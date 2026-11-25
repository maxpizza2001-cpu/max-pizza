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
  const [busca, setBusca] = useState('');
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
      setInfo({ ajustes: inf.ajustes, zonas: (inf.zonas ?? []).map((z) => ({ ...z, tarifa: Number(z.tarifa) })), opciones: inf.opciones ?? [], promos: inf.promos ?? [], hay_codigos: !!inf.hay_codigos });
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

  // La categoría que se está viendo queda marcada arriba mientras se baja por el menú
  useEffect(() => {
    const ver = () => {
      const secs = [...document.querySelectorAll<HTMLElement>('[data-cat]')];
      const actual = secs.filter((el) => el.getBoundingClientRect().top < 190).pop();
      if (actual) setCat(actual.dataset.cat!);
    };
    window.addEventListener('scroll', ver, { passive: true });
    return () => window.removeEventListener('scroll', ver);
  }, []);
  useEffect(() => { document.querySelector('.t-chips .on')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [cat]);

  function listo(l: LineaCarrito) {
    const existe = carrito.some((x) => x.clave === l.clave);
    setCarrito(existe ? carrito.map((x) => (x.clave === l.clave ? l : x)) : [...carrito, l]);
    setArmando(null);
    if (!existe) { setAviso(`✓ ${l.cantidad} × ${l.nombre} agregado`); setTimeout(() => setAviso(''), 2200); }
  }

  const sedeNombre = sedes?.find((s) => s.id === sede)?.nombre ?? '';
  if (!configurado) return <div className="t-pagina t-centro">La tienda aún no está conectada.</div>;

  const aj = info.ajustes;
  const tarifaMin = info.zonas.length ? Math.min(...info.zonas.map((z) => z.tarifa)) : null;
  const q = busca.trim().toLowerCase();
  const visibles = q ? platos.filter((p) => (p.nombre + ' ' + (p.descripcion ?? '') + ' ' + p.categoria).toLowerCase().includes(q)) : platos;
  const cats = categorias.filter((c) => c !== 'Todo' && visibles.some((p) => p.categoria === c));
  const enCarrito = (id: string) => carrito.filter((l) => l.plato_id === id).reduce((t, l) => t + l.cantidad, 0);
  const irA = (c: string) => {
    setCat(c);
    const el = document.getElementById('cat-' + c);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 170, behavior: 'smooth' });
  };

  return (
    <div className="t-pagina">
      <header className="t-barra">
        <div className="t-marca"><Logo alto={34} /></div>
        {sede && !cambiarSede && <button className="t-ubicacion" onClick={() => setCambiarSede(true)}>
          <span>Pides en</span><b>{sedeNombre || 'Sede'} ▾</b></button>}
        <button className="t-icono-btn" aria-label="Seguir mi pedido"
          onClick={() => setSeguir(ultimoVigente ? { codigo: ultimoVigente.codigo, celular: ultimoVigente.celular } : 'buscar')}>
          📦<span>{ultimoVigente ? 'Mi pedido' : 'Seguir'}</span>
          {ultimoVigente && <i className="t-punto" />}
        </button>
      </header>

      {error && <div className="t-error">{error}</div>}

      {(!sede || cambiarSede) && sedes && (
        <div className="t-elegir">
          <div className="t-elegir-logo"><Logo alto={90} /></div>
          <h1>¿Desde qué sede pides?</h1>
          <p>Cada sede tiene su menú, sus precios y su zona de domicilio.</p>
          <div className="t-sedes">
            {sedes.map((s) => (
              <button key={s.id} className={'t-sede-tarjeta' + (s.id === sede ? ' on' : '')} onClick={() => { setSede(s.id); setCambiarSede(false); window.scrollTo(0, 0); }}>
                <span className="t-sede-icono">📍</span><b>{s.nombre}</b><span>Ver menú →</span>
              </button>
            ))}
          </div>
          {sede && <button className="t-enlace" onClick={() => setCambiarSede(false)}>Cancelar</button>}
        </div>
      )}

      {sede && !cambiarSede && (
        <>
          <div className="t-estado-tienda">
            <span className={aj && !aj.abierta ? 't-cerrada' : 't-abierta'}>{aj && !aj.abierta ? '● Cerrado' : '● Abierto'}</span>
            {aj?.horario_texto && <span>🕓 {aj.horario_texto}</span>}
            {(!aj || aj.domicilio) && tarifaMin != null && <span>🛵 Domicilio desde {plata(tarifaMin)}</span>}
            {(!aj || aj.recoger) && <span>🏪 Recoger gratis</span>}
            {aj && Number(aj.pedido_minimo) > 0 && <span>Mínimo {plata(aj.pedido_minimo)}</span>}
          </div>

          <section className="t-portada">
            <div className="t-lema">¡Más sabor!<span>Recién salidas del horno, directo a tu puerta</span></div>
            {aj && !aj.abierta && <div className="t-cerrado">Ahora estamos cerrados · puedes ver el menú</div>}
            {menu ? <Rueda items={portada} onElegir={(p) => setArmando({ plato: p })} /> : <div className="t-cargando">Calentando el horno…</div>}
          </section>

          {(info.promos ?? []).length > 0 && (
            <div className="t-promos">
              {(info.promos ?? []).map((p) => (
                <div key={p.nombre} className="t-promo-tarjeta">
                  <b>{p.tipo === 'porcentaje' ? `${Number(p.valor)}%` : plata(p.valor)}<small> menos</small></b>
                  <span>{p.nombre}</span>
                  {Number(p.minimo) > 0 && <small>En pedidos desde {plata(p.minimo)}</small>}
                </div>
              ))}
            </div>
          )}

          <div className="t-pegado">
            <label className="t-buscar">
              <span aria-hidden>🔍</span>
              <input placeholder="Buscar pizzas, hamburguesas, bebidas…" value={busca} onChange={(e) => setBusca(e.target.value)} />
              {busca && <button aria-label="Borrar búsqueda" onClick={() => setBusca('')}>✕</button>}
            </label>
            <nav className="t-chips">
              {cats.map((c) => <button key={c} className={c === cat ? 'on' : ''} onClick={() => irA(c)}>{c}</button>)}
            </nav>
          </div>

          <main className="t-menu">
            {!q && portada.length > 0 && (
              <section>
                <h2 className="t-titulo-cat">⭐ Los favoritos</h2>
                <div className="t-carrusel">
                  {portada.slice(0, 8).map((p) => (
                    <button key={p.id} className="t-fav" onClick={() => setArmando({ plato: p })}>
                      <div className="t-fav-img"><ImagenProducto p={p} tam={118} /></div>
                      <b>{p.nombre}</b>
                      <span>{p.variantes.length > 1 ? 'Desde ' : ''}{plata(p.precio)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {cats.map((c) => (
              <section key={c} id={'cat-' + c} data-cat={c}>
                <h2 className="t-titulo-cat">{c}</h2>
                <div className="t-grilla">
                  {visibles.filter((p) => p.categoria === c).map((p) => {
                    const n = enCarrito(p.id);
                    return (
                      <article key={p.id} className="t-tarjeta" onClick={() => setArmando({ plato: p })}>
                        <div className="t-tarjeta-txt">
                          <b>{p.nombre}</b>
                          {p.descripcion && <span className="t-desc">{p.descripcion}</span>}
                          {p.variantes.length > 1 && <span className="t-tamanos">{p.variantes.map((v) => v.etiqueta).join(' · ')}</span>}
                          <span className="t-precio">{p.variantes.length > 1 ? <small>Desde </small> : null}{plata(p.precio)}</span>
                        </div>
                        <div className="t-tarjeta-img">
                          <ImagenProducto p={p} tam={96} />
                          <button className={'t-mas' + (n ? ' con' : '')} aria-label={`Agregar ${p.nombre}`}>{n ? n : '＋'}</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
            {q && !visibles.length && <div className="t-centro">No encontramos “{busca}”. Prueba con otra palabra.</div>}
            {menu && !menu.length && <div className="t-centro">Esta sede aún no tiene productos en línea.</div>}
          </main>

          <footer className="t-pie">
            <div className="t-marca"><Logo alto={44} /></div>
            <span>Max Pizza · {sedeNombre}{aj?.horario_texto ? ` · ${aj.horario_texto}` : ''}</span>
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
