// Tipos y reglas de la tienda: agrupar tamaños por sabor, calcular precios y guardar el carrito en el teléfono.
import { useEffect, useState } from 'react';

export type ProductoTienda = {
  id: string; nombre: string; descripcion: string | null; foto_url: string | null; precio: number;
  destacado: boolean; formato: string; categoria: string; categoria_tipo: string; categoria_orden: number;
};
export type Variante = { producto_id: string; etiqueta: string; precio: number };
/** Lo que el cliente ve como un plato: un sabor de pizza con sus tamaños, o un producto suelto. */
export type Plato = {
  id: string; nombre: string; descripcion: string | null; foto_url: string | null; precio: number;
  destacado: boolean; categoria: string; categoria_tipo: string; variantes: Variante[];
};
export type Opcion = { id: string; producto_id: string; nombre: string; precio_extra: number };
export type Zona = { id: string; nombre: string; tarifa: number };
export type Ajustes = {
  abierta: boolean; pedido_minimo: number; medios: string[]; nequi_numero: string | null; cuenta_texto: string | null;
  horario_texto: string | null; recoger: boolean; domicilio: boolean;
};
export type InfoTienda = { ajustes: Ajustes | null; zonas: Zona[]; opciones: Opcion[] };

export type LineaCarrito = {
  clave: string; plato_id: string; producto_id: string; nombre: string; tamano: string | null;
  precio_base: number; opciones: { id: string; nombre: string; precio: number }[]; nota: string; cantidad: number;
};
export const precioLinea = (l: LineaCarrito) => l.precio_base + l.opciones.reduce((s, o) => s + o.precio, 0);

const TAMANOS: Record<string, string> = { porcion: 'Porción', personal: 'Personal' };

export function agruparPlatos(menu: ProductoTienda[]): Plato[] {
  const platos = new Map<string, Plato>();
  for (const p of menu) {
    const m = p.categoria_tipo === 'pizza' ? p.nombre.match(/^(Porción|Personal)\s+(.+)$/i) : null;
    const clave = m ? `pizza:${m[2].toLowerCase()}` : p.id;
    const nombre = m ? `Pizza ${m[2]}` : p.nombre;
    const v: Variante = { producto_id: p.id, etiqueta: m ? (TAMANOS[p.formato] ?? m[1]) : '', precio: p.precio };
    const ya = platos.get(clave);
    if (!ya) {
      platos.set(clave, { id: clave, nombre, descripcion: p.descripcion, foto_url: p.foto_url, precio: p.precio, destacado: p.destacado,
        categoria: p.categoria, categoria_tipo: p.categoria_tipo, variantes: [v] });
    } else {
      ya.variantes.push(v);
      ya.precio = Math.min(ya.precio, p.precio);
      ya.descripcion ||= p.descripcion; ya.foto_url ||= p.foto_url; ya.destacado ||= p.destacado;
    }
  }
  for (const pl of platos.values()) pl.variantes.sort((a, b) => a.precio - b.precio);
  return [...platos.values()];
}

/** Guarda un valor en el teléfono (sobrevive a recargar la página). */
export function useGuardadoLocal<T>(clave: string, inicial: T) {
  const [v, setV] = useState<T>(() => {
    try { const x = localStorage.getItem(clave); return x ? JSON.parse(x) : inicial; } catch { return inicial; }
  });
  useEffect(() => { try { localStorage.setItem(clave, JSON.stringify(v)); } catch { /* sin espacio */ } }, [clave, v]);
  // si cambia la clave (otra sede), se carga lo de esa clave
  useEffect(() => {
    try { const x = localStorage.getItem(clave); setV(x ? JSON.parse(x) : inicial); } catch { setV(inicial); }
  }, [clave]);
  return [v, setV] as const;
}

export const MEDIOS: Record<string, string> = { efectivo: '💵 Efectivo', nequi: '📱 Nequi', transferencia: '🏦 Transferencia', datafono: '💳 Tarjeta (datáfono)' };
