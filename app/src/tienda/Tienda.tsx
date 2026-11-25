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
      const actual = secs.filter((el) => el.getBoundingClientRect().top < 120).pop();
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
    const el = document.getElementById(c === 'Todo' ? 'menu' : 'cat-' + c);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 76, behavior: 'smooth' });
  };
  const mejorPromo = (info.promos ?? []).slice().sort((a, b) => Number(b.valor) - Number(a.valor))[0];
  const abrirCarrito = () => (unidades ? setVerPedido(true) : irA('Todo'));
  const iconoCat = (c: string) => {
    const p = platos.find((x) => x.categoria === c);
    if (p?.categoria_tipo === 'pizza') return <ImagenProducto p={p} tam={58} />;
    return <span style={{ fontSize: 30 }}>{p?.categoria_tipo === 'bebida' ? '🥤' : p ? '🍔' : '🍽️'}</span>;
  };

  const Tarjeta = ({ p, sello }: { p: Plato; sello?: string }) => {
    const n = enCarrito(p.id);
    return (
      <article className="t-card" onClick={() => setArmando({ plato: p })}>
        {sello && <span className="t-sello">{sello}</span>}
        <div className="t-card-img"><ImagenProducto p={p} tam={132} /></div>
        <b className="t-card-nombre">{p.nombre}</b>
        <span className="t-card-desc">{p.descripcion || (p.variantes.length > 1 ? p.variantes.map((v) => v.etiqueta).join(' · ') : p.categoria)}</span>
        <div className="t-card-pie">
          <span className="t-card-precio">{p.variantes.length > 1 && <small>Desde </small>}{plata(p.precio)}</span>
          <button className={'t-card-mas' + (n ? ' con' : '')} aria-label={`Agregar ${p.nombre}`}>{n || '＋'}</button>
        </div>
      </article>
    );
  };

  return (
    <div className="t-pagina t-con-nav">
      <header className="t-barra">
        <button className="t-icono-redondo" aria-label="Cambiar de sede" onClick={() => setCambiarSede(true)}>📍</button>
        <div className="t-saludo">
          <span>¡Hola! Pides en <b>{sedeNombre || 'tu sede'}</b> 🍕</span>
          <div className="t-marca"><Logo alto={30} /></div>
        </div>
        <button className="t-icono-redondo" aria-label="Seguir mi pedido"
          onClick={() => setSeguir(ultimoVigente ? { codigo: ultimoVigente.codigo, celular: ultimoVigente.celular } : 'buscar')}>
          📦{ultimoVigente && <i className="t-contador">1</i>}
        </button>
        <button className="t-icono-redondo" aria-label="Mi carrito" onClick={abrirCarrito}>
          🛍️{unidades > 0 && <i className="t-contador">{unidades}</i>}
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
          <div className="t-buscar-fila">
            <label className="t-buscar">
              <span aria-hidden>🔍</span>
              <input placeholder="Busca tu pizza favorita…" value={busca} onChange={(e) => { setBusca(e.target.value); if (e.target.value) irA('Todo'); }} />
              {busca && <button aria-label="Borrar búsqueda" onClick={() => setBusca('')}>✕</button>}
            </label>
            <span className={'t-estado-chip ' + (aj && !aj.abierta ? 'cerrada' : 'abierta')}>{aj && !aj.abierta ? 'Cerrado' : 'Abierto'}</span>
          </div>

          {!q && (
            <section className="t-portada">
              <div className="t-portada-txt">
                <span className="t-etiqueta">{aj && !aj.abierta ? 'AHORA CERRADO' : 'RECIÉN HORNEADA'}</span>
                <div className="t-lema">¡MÁS SABOR!<em>MÁS QUESO.</em></div>
                <p>{aj?.horario_texto ?? 'Hecha con amor, directo a tu puerta.'}</p>
              </div>
              {menu ? <Rueda items={portada} onElegir={(p) => setArmando({ plato: p })} /> : <div className="t-cargando">Calentando el horno…</div>}
            </section>
          )}

          <nav className="t-circulos" id="menu">
            {['Todo', ...cats].map((c) => (
              <button key={c} className={c === cat ? 'on' : ''} onClick={() => irA(c)}>
                <span className="t-circulo">{c === 'Todo' ? <span style={{ fontSize: 28 }}>🍽️</span> : iconoCat(c)}</span>
                {c}
              </button>
            ))}
          </nav>

          <main className="t-menu">
            {!q && portada.length > 0 && (
              <section>
                <div className="t-titulo-fila"><h2 className="t-titulo-cat">Los más pedidos</h2>
                  <button className="t-ver-todo" onClick={() => irA(cats[0] ?? 'Todo')}>Ver todo →</button></div>
                <div className="t-cards t-cards-deslizar">
                  {portada.slice(0, 6).map((p, i) => <Tarjeta key={p.id} p={p} sello={i === 0 ? '★ FAVORITA' : p.destacado ? 'RECOMENDADA' : undefined} />)}
                </div>
              </section>
            )}

            {!q && mejorPromo && (
              <div className="t-banner-promo">
                <div>
                  <span className="t-etiqueta oscura">PROMOCIÓN</span>
                  <b>{mejorPromo.tipo === 'porcentaje' ? `${Number(mejorPromo.valor)}% MENOS` : `${plata(mejorPromo.valor)} MENOS`}</b>
                  <span>{mejorPromo.nombre}{Number(mejorPromo.minimo) > 0 ? ` · desde ${plata(mejorPromo.minimo)}` : ''}</span>
                  <button className="t-btn-negro" onClick={() => irA(cats[0] ?? 'Todo')}>Pedir ahora →</button>
                </div>
                <div className="t-banner-img">{portada[0] && <ImagenProducto p={portada[0]} tam={120} />}</div>
              </div>
            )}

            {cats.map((c) => (
              <section key={c} id={'cat-' + c} data-cat={c}>
                <h2 className="t-titulo-cat">{c}</h2>
                <div className="t-cards">
                  {visibles.filter((p) => p.categoria === c).map((p) => <Tarjeta key={p.id} p={p} />)}
                </div>
              </section>
            ))}
            {q && !visibles.length && <div className="t-centro">No encontramos “{busca}”. Prueba con otra palabra.</div>}
            {menu && !menu.length && <div className="t-centro">Esta sede aún no tiene productos en línea.</div>}

            <div className="t-confianza">
              {(!aj || aj.domicilio) && <div><span>🛵</span><b>Domicilio</b><small>{tarifaMin != null ? `desde ${plata(tarifaMin)}` : 'a tu puerta'}</small></div>}
              <div><span>🔥</span><b>Recién hecha</b><small>Siempre fresca</small></div>
              <div><span>🎁</span><b>Promociones</b><small>{(info.promos ?? []).length ? 'Activas hoy' : 'Muy pronto'}</small></div>
              <div><span>🔒</span><b>Pago fácil</b><small>Efectivo o Nequi</small></div>
            </div>
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

          <nav className="t-nav-abajo">
            <button className="on" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><span>🏠</span>Inicio</button>
            <button onClick={() => irA('Todo')}><span>📋</span>Menú</button>
            <button className="t-nav-pedir" onClick={abrirCarrito}><span>🍕</span>{unidades ? plata(subtotal) : 'Pedir'}</button>
            <button onClick={() => (mejorPromo ? document.querySelector('.t-banner-promo')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) : irA('Todo'))}><span>🎁</span>Promos</button>
            <button onClick={() => setSeguir(ultimoVigente ? { codigo: ultimoVigente.codigo, celular: ultimoVigente.celular } : 'buscar')}><span>📦</span>Mi pedido</button>
          </nav>
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
