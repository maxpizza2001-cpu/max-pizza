import { useCallback, useEffect, useRef, useState } from 'react';
import { sb } from './supabase';

// ───────── Tipos ─────────
export type Producto = {
  id: string; nombre: string; foto_url: string | null; formato: 'porcion' | 'personal' | 'unidad';
  estacion: 'horno' | 'rapidas' | 'ninguna'; tipo: 'pizza' | 'rapida' | 'bebida'; precio: number;
  disponible: number | null;   // null = no se controla por unidades listas (se prepara al momento)
};

export type LineaCarrito = { producto_id: string; cantidad: number; observacion?: string };

export type Comanda = {
  id: string; estado: 'nueva' | 'en_preparacion' | 'lista' | 'entregada' | 'cancelada';
  creada_en: string; empezada_en: string | null; lista_en: string | null; estacion: 'horno' | 'rapidas';
  numero: number; tipo: 'mesa' | 'mostrador' | 'llevar'; mesa: number | null; cuenta_id: string;
  lineas: { id: string; cantidad: number; observacion: string | null; producto: string; cancelada: boolean }[];
};

// ───────── Tiempo real ─────────
/** Vuelve a cargar cuando cambia alguna de las tablas (y al recuperar la conexión o volver a la app). */
export function useEnVivo(nombre: string, tablas: { tabla: string; filtro?: string }[], cargar: () => unknown) {
  const ref = useRef(cargar);
  ref.current = cargar;
  const clave = JSON.stringify(tablas);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const pronto = () => { clearTimeout(t); t = setTimeout(() => ref.current(), 150); };
    // Un canal por tabla: si una tabla no tiene tiempo real, las demás siguen avisando
    const canales = tablas.map(({ tabla, filtro }) =>
      sb.channel(`${nombre}-${tabla}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: tabla, ...(filtro ? { filter: filtro } : {}) }, pronto)
        .subscribe((estado) => { if (estado === 'SUBSCRIBED') pronto(); }));
    const alVolver = () => { if (document.visibilityState === 'visible') pronto(); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', pronto);
    window.addEventListener('mp:cambio', pronto);
    return () => {
      clearTimeout(t);
      canales.forEach((c) => sb.removeChannel(c));
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', pronto);
      window.removeEventListener('mp:cambio', pronto);
    };
  }, [nombre, clave]);
}

// ───────── Catálogo con precios y disponibilidad de la sede ─────────
export function useCatalogo(sede: string) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const cargar = useCallback(async () => {
    const [ps, rs, ss] = await Promise.all([
      sb.from('productos_sede').select('precio, disponible, productos!inner(id, nombre, foto_url, formato, estacion, activo, categorias(tipo, orden))')
        .eq('sede_id', sede).eq('disponible', true).eq('productos.activo', true),
      sb.from('recetas').select('producto_id, receta_detalles(insumo_id, cantidad, ubicacion)').eq('vigente', true),
      sb.from('v_saldos').select('ubicacion, insumo_id, disponible').eq('sede_id', sede),
    ]);
    const saldo = new Map((ss.data ?? []).map((s: any) => [`${s.ubicacion}/${s.insumo_id}`, Number(s.disponible)]));
    const receta = new Map((rs.data ?? []).map((r: any) => [r.producto_id, r.receta_detalles as any[]]));
    const lista: Producto[] = (ps.data ?? []).map((x: any) => {
      const p = x.productos;
      let disponible: number | null = null;
      if (p.estacion !== 'rapidas') {
        const det = receta.get(p.id) ?? [];
        if (det.length) disponible = Math.max(0, Math.floor(Math.min(...det.map((d) => (saldo.get(`${d.ubicacion}/${d.insumo_id}`) ?? 0) / Number(d.cantidad)))));
      }
      return { id: p.id, nombre: p.nombre, foto_url: p.foto_url, formato: p.formato, estacion: p.estacion,
        tipo: p.categorias?.tipo ?? 'pizza', precio: Number(x.precio), disponible, _orden: p.categorias?.orden ?? 0 } as Producto & { _orden: number };
    }).sort((a: any, b: any) => a._orden - b._orden || a.nombre.localeCompare(b.nombre, 'es'));
    setProductos(lista);
  }, [sede]);
  useEnVivo(`catalogo-${sede}`, [{ tabla: 'saldos_stock', filtro: `sede_id=eq.${sede}` }], cargar);
  useEffect(() => { cargar(); }, [cargar]);
  return productos;
}

// ───────── Comandas de una estación ─────────
const SELECT_COMANDA = `id, estado, creada_en, empezada_en, lista_en,
  estaciones!inner(codigo),
  pedidos!inner(numero, cuenta_id, cuentas!inner(tipo, mesas(numero))),
  lineas_comanda(cancelada, lineas_pedido(id, cantidad, observacion, productos(nombre)))`;

export function aComanda(c: any): Comanda {
  return {
    id: c.id, estado: c.estado, creada_en: c.creada_en, empezada_en: c.empezada_en, lista_en: c.lista_en,
    estacion: c.estaciones.codigo, numero: c.pedidos.numero, cuenta_id: c.pedidos.cuenta_id,
    tipo: c.pedidos.cuentas.tipo, mesa: c.pedidos.cuentas.mesas?.numero ?? null,
    lineas: (c.lineas_comanda ?? []).map((l: any) => ({
      id: l.lineas_pedido.id, cantidad: Number(l.lineas_pedido.cantidad), observacion: l.lineas_pedido.observacion,
      producto: l.lineas_pedido.productos?.nombre ?? '', cancelada: l.cancelada,
    })),
  };
}

export function useComandas(sede: string, opciones: { estacion?: 'horno' | 'rapidas'; estados: Comanda['estado'][] }) {
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const clave = JSON.stringify(opciones);
  const cargar = useCallback(async () => {
    let q = sb.from('comandas').select(SELECT_COMANDA).eq('sede_id', sede).in('estado', opciones.estados)
      .order('creada_en', { ascending: true }).limit(100);
    if (opciones.estacion) q = q.eq('estaciones.codigo', opciones.estacion);
    const { data } = await q;
    setComandas((data ?? []).map(aComanda));
  }, [sede, clave]);
  useEnVivo(`comandas-${sede}-${clave}`, [
    { tabla: 'comandas', filtro: `sede_id=eq.${sede}` },
    { tabla: 'lineas_comanda' },
  ], cargar);
  useEffect(() => { cargar(); }, [cargar]);
  return { comandas, recargar: cargar };
}

// ───────── Utilidades ─────────
export const nombreDestino = (c: { tipo: string; mesa: number | null; numero: number }) =>
  c.mesa != null ? `Mesa ${String(c.mesa).padStart(2, '0')}` : c.tipo === 'llevar' ? 'Para llevar' : 'Mostrador';

export function minutosDesde(iso: string, ahora = Date.now()) {
  return Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));
}

/** Reloj que avanza cada 30 s (para los tiempos de espera) */
export function useAhora(cada = 30000) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setAhora(Date.now()), cada); return () => clearInterval(i); }, [cada]);
  return ahora;
}

/** Aviso breve con sonido (para comandas nuevas y pedidos listos) */
export function pitar() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.15;
    o.start(); o.stop(ctx.currentTime + 0.18);
    setTimeout(() => ctx.close(), 400);
    navigator.vibrate?.(150);
  } catch { /* sin sonido */ }
}

export const emojiProducto = (p: { tipo: string }) => (p.tipo === 'pizza' ? '🍕' : p.tipo === 'rapida' ? '🍔' : '🥤');

/** Guarda un valor en el teléfono (borradores que sobreviven a recargar o perder conexión) */
export function useGuardado<T>(clave: string, inicial: T) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(clave); return s ? JSON.parse(s) : inicial; } catch { return inicial; }
  });
  const actual = useRef(v);
  actual.current = v;
  useEffect(() => {
    let n: T; try { n = JSON.parse(localStorage.getItem(clave) ?? 'null') ?? inicial; } catch { n = inicial; }
    actual.current = n; setV(n);
  }, [clave]);
  // Se guarda en el celular AL INSTANTE (no dentro de React): así, si la ventana se cierra justo después
  // de enviar, el borrador vacío sí queda guardado y no reaparece el pedido anterior.
  const guardar = useCallback((n: T | ((p: T) => T)) => {
    const val = typeof n === 'function' ? (n as (p: T) => T)(actual.current) : n;
    actual.current = val;
    try { localStorage.setItem(clave, JSON.stringify(val)); } catch { /* lleno */ }
    setV(val);
  }, [clave]);
  return [v, guardar] as const;
}
