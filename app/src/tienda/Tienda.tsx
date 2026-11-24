// Tienda online pública (/pedir): sede, portada giratoria, menú, armar producto, carrito y datos del pedido.
// Lee el MISMO catálogo de Administración por funciones públicas (tienda_sedes / tienda_catalogo / tienda_info).
import { useEffect, useMemo, useState } from 'react';
import { configurado, sb } from '../lib/supabase';
import { plata } from '../lib/formato';
import { Logo } from '../componentes/Logo';
import { ImagenProducto } from './Dibujos';
import { Rueda } from './Rueda';
import { Elegir } from './Elegir';
import { Pedido } from './Pedido';
import { CLAVE_ULTIMO, Seguimiento } from './Seguimiento';
import { agruparPlatos, precioLinea, useGuardadoLocal, type InfoTienda, type LineaCarrito, type Plato, type ProductoTienda } from './modelo';
import './tienda.css';

type SedeT = { id: string; nombre: string };
const CLAVE_SEDE = 'maxpizza.tienda.sede';
const INFO_VACIA: InfoTienda = { ajustes: null, zonas: [], opciones: [] };

export function Tienda() {
  const [sedes, setSedes] = useState<SedeT[] | null>(null);
  const [sede, setSede] = useState<string | null>(() => localStorage.getItem(CLAVE_SEDE));
  const [menu, setMenu] = useState<ProductoTienda[] | null>(null);
  const [info, setInfo] = useState<InfoTienda>(INFO_VACIA);
  const [error, setError] = useState('');
  const [cat, setCat] = useState('Todo');
  const [cambiarSede, setCambiarSede] = useState(false);
  const [armando, setArmando] = useState<{ plato: Plato; linea?: LineaCarrito } | null>(null);
  const [verPedido, setVerPedido] = useState(false);
  const [aviso, setAviso] = useState('');
  const [seguir, setSeguir] = useState<{ codigo: string; celular: string } | null | 'buscar'>(() => {
    const c = new URLSearchParams(location.search).get('codigo');
    return c ? 'buscar' : null;
  });
  const ultimo = (() => { try { return JSON.parse(localStorage.getItem(CLAVE_ULTIMO) ?? 'null') as { codigo: string; celular: string; en: number } | null; } catch { return null; } })();
  const ultimoVigente = ultimo && Date.now() - ultimo.en < 24 * 3600e3 ? ultimo : null;
  const [carrito, setCarrito] = useGuardadoLocal<LineaCarrito[]>(`maxpizza.tienda.carrito.${sede ?? 'ninguna'}`, []);

  useEffect(() => { document.title = 'Max Pizza · Pide en línea'; }, []);

  useEffect(() => {
    if (!configurado) return;
    sb.rpc('tienda_sedes').then(({ data, error }) => {
      if (error) return setError('No pudimos cargar el menú. Revisa tu internet.');
      setSedes(data as SedeT[]);
      if (sede && !(data as SedeT[]).some((s) => s.id === sede)) setSede(null);
    });
  }, []);

  useEffect(() => {
    if (!sede) return;
    localStorage.setItem(CLAVE_SEDE, sede);
    setMenu(null); setCat('Todo'); setInfo(INFO_VACIA);
    Promise.all([sb.rpc('tienda_catalogo', { p_sede: sede }), sb.rpc('tienda_info', { p_sede: sede })]).then(([m, i]) => {
      if (m.error || i.error) return setError('No pudimos cargar el menú. Revisa tu internet.');
      setError('');
      setMenu((m.data as ProductoTienda[]).map((p) => ({ ...p, precio: Number(p.precio) })));
      const inf = i.data as InfoTienda;
      setInfo({ ajustes: inf.ajustes, zonas: (inf.zonas ?? []).map((z) => ({ ...z, tarifa: Number(z.tarifa) })), opciones: inf.opciones ?? [] });
    });
  }, [sede]);

  const platos = useMemo(() => agruparPlatos(menu ?? []), [menu]);
  // Si un producto del carrito ya no se vende o cambió de precio, el carrito se ajusta al menú actual
  useEffect(() => {
    if (!menu) return;
    const precio = new Map(menu.map((p) => [p.id, p.precio]));
    const ajustado = carrito.filter((l) => precio.has(l.producto_id)).map((l) => ({ ...l, precio_base: precio.get(l.producto_id)! }));
    if (JSON.stringify(ajustado) !== JSON.stringify(carrito)) setCarrito(ajustado);
  }, [menu]);

  const portada = useMemo(() => {
    const d = platos.filter((p) => p.destacado);
    return d.length ? d : platos.filter((p) => p.categoria_tipo === 'pizza');
  }, [platos]);
  const categorias = useMemo(() => ['Todo', ...new Set(platos.map((p) => p.categoria))], [platos]);
  const unidades = carrito.reduce((s, l) => s + l.cantidad, 0);
  const subtotal = carrito.reduce((s, l) => s + precioLinea(l) * l.cantidad, 0);

  function listo(l: LineaCarrito) {
    const existe = carrito.some((x) => x.clave === l.clave);
    setCarrito(existe ? carrito.map((x) => (x.clave === l.clave ? l : x)) : [...carrito, l]);
    setArmando(null);
    if (!existe) { setAviso(`✓ ${l.cantidad} × ${l.nombre} agregado`); setTimeout(() => setAviso(''), 2200); }
  }

  const sedeNombre = sedes?.find((s) => s.id === sede)?.nombre ?? '';
  if (!configurado) return <div className="t-pagina t-centro">La tienda aún no está conectada.</div>;

  return (
    <div className="t-pagina">
      <header className="t-barra">
        <Logo alto={40} />
        <div className="fila" style={{ gap: 8 }}>
        <button className="t-sede" onClick={() => setSeguir(ultimoVigente ? { codigo: ultimoVigente.codigo, celular: ultimoVigente.celular } : 'buscar')}>📦 {ultimoVigente ? 'Mi pedido' : 'Seguir pedido'}</button>
        {sede && <button className="t-sede" onClick={() => setCambiarSede(true)}>📍 {sedeNombre || 'Sede'} ▾</button>}
        </div>
      </header>

      {error && <div className="t-error">{error}</div>}

      {(!sede || cambiarSede) && sedes && (
        <div className="t-elegir">
          <h1>¿Desde qué sede pides?</h1>
          <p>Cada sede tiene su menú y sus precios.</p>
          <div className="t-sedes">
            {sedes.map((s) => (
              <button key={s.id} className={'t-sede-tarjeta' + (s.id === sede ? ' on' : '')} onClick={() => { setSede(s.id); setCambiarSede(false); }}>
                <span className="t-sede-icono">🍕</span><b>{s.nombre}</b><span>Ver menú →</span>
              </button>
            ))}
          </div>
          {sede && <button className="t-enlace" onClick={() => setCambiarSede(false)}>Cancelar</button>}
        </div>
      )}

      {sede && !cambiarSede && (
        <>
          <section className="t-portada">
            <div className="t-lema">¡Más sabor!<span>Recién salidas del horno, directo a tu puerta</span></div>
            {info.ajustes && !info.ajustes.abierta && <div className="t-cerrado">Ahora estamos cerrados · {info.ajustes.horario_texto}</div>}
            {menu ? <Rueda items={portada} onElegir={(p) => setArmando({ plato: p })} /> : <div className="t-cargando">Calentando el horno…</div>}
          </section>

          <nav className="t-chips">
            {categorias.map((c) => <button key={c} className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}
          </nav>

          <main className="t-menu">
            {categorias.filter((c) => c !== 'Todo' && (cat === 'Todo' || cat === c)).map((c) => (
              <section key={c}>
                <h2 className="t-titulo-cat">{c}</h2>
                <div className="t-grilla">
                  {platos.filter((p) => p.categoria === c).map((p) => (
                    <article key={p.id} className="t-tarjeta" onClick={() => setArmando({ plato: p })}>
                      <div className="t-tarjeta-img"><ImagenProducto p={p} tam={120} /></div>
                      <div className="t-tarjeta-txt">
                        <b>{p.nombre}</b>
                        {p.descripcion && <span className="t-desc">{p.descripcion}</span>}
                        {p.variantes.length > 1 && <span className="t-tamanos">{p.variantes.map((v) => v.etiqueta).join(' · ')}</span>}
                        <div className="fila entre"><span className="t-precio">{p.variantes.length > 1 ? 'Desde ' : ''}{plata(p.precio)}</span>
                          <button className="t-mas" aria-label={`Agregar ${p.nombre}`}>＋</button></div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
            {menu && !menu.length && <div className="t-centro">Esta sede aún no tiene productos en línea.</div>}
          </main>

          <footer className="t-pie">
            <Logo alto={34} />
            <span>Max Pizza · {sedeNombre}{info.ajustes?.horario_texto ? ` · ${info.ajustes.horario_texto}` : ''}</span>
            <a href="/">¿Trabajas en Max Pizza? Entrar</a>
          </footer>

          {unidades > 0 && !verPedido && !armando && (
            <button className="t-barra-carrito" onClick={() => setVerPedido(true)}>
              <span className="t-burbuja">{unidades}</span><b>Ver mi pedido</b><span>{plata(subtotal)}</span>
            </button>
          )}
        </>
      )}

      {armando && <Elegir plato={armando.plato} linea={armando.linea} opciones={info.opciones} onListo={listo} onCerrar={() => setArmando(null)} />}
      {verPedido && !armando && (
        <Pedido lineas={carrito} info={info} sede={sede!} sedeNombre={sedeNombre} onCerrar={() => setVerPedido(false)}
          onSeguir={(e) => { setVerPedido(false); setSeguir({ codigo: e.codigo, celular: e.celular }); }}
          onEnviado={(e) => { setCarrito([]); localStorage.setItem(CLAVE_ULTIMO, JSON.stringify({ ...e, sede, en: Date.now() })); }}
          onCantidad={(k, n) => setCarrito(carrito.map((l) => (l.clave === k ? { ...l, cantidad: n } : l)))}
          onQuitar={(k) => setCarrito(carrito.filter((l) => l.clave !== k))}
          onEditar={(l) => { const pl = platos.find((p) => p.id === l.plato_id); if (pl) setArmando({ plato: pl, linea: l }); }} />
      )}
      {seguir && <Seguimiento inicial={seguir === 'buscar' ? (new URLSearchParams(location.search).get('codigo') ? { codigo: new URLSearchParams(location.search).get('codigo')!.toUpperCase(), celular: '' } : undefined) : seguir} onCerrar={() => setSeguir(null)} />}
      {aviso && <div className="t-toast">{aviso}</div>}
    </div>
  );
}
