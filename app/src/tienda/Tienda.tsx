// Tienda online pública (/pedir): sede, portada giratoria, menú, armar producto, carrito y datos del pedido.
// Lee el MISMO catálogo de Administración por funciones públicas (tienda_sedes / tienda_catalogo / tienda_info).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { configurado, sb } from '../lib/supabase';
import { plata } from '../lib/formato';
import { Logo } from '../componentes/Logo';
import { ImagenProducto } from './Dibujos';
import { Rueda } from './Rueda';
import { Caja, fraseAgregado } from './Caja';
import { Max } from './Max';
import { useCapa } from '../lib/atras';
import { ControlSonido } from './ControlSonido';
import { Bienvenida } from './Bienvenida';
import { sonido } from './sonido';
import { SugerenciaFlotante, agregaDirecto, sugerencias as recomendar, type Sugerencia } from './Recomendaciones';
import { confeti, recordarOrigen, volarAlCarrito } from './efectos';
import { Tarjeta as TarjetaPremium } from './Tarjeta';
import { Elegir } from './Elegir';
import { Pedido } from './Pedido';
import { CLAVE_ULTIMO, Seguimiento } from './Seguimiento';
import { agruparPlatos, minutos, platoAgotado, precioLinea, type Combo, useGuardadoLocal, type InfoTienda, type LineaCarrito, type Plato, type ProductoTienda } from './modelo';
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
  const [sugFlot, setSugFlot] = useState<{ titulo: string; items: Sugerencia[] } | null>(null);
  const [buscando, setBuscando] = useState(false);
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
      setMenu((m.data as ProductoTienda[]).map((p) => ({ ...p, precio: Number(p.precio), disponibles: p.disponibles == null ? null : Number(p.disponibles) })));
      const inf = i.data as InfoTienda;
      sonido.usarCancion(inf.ajustes?.musica_url ?? null, inf.ajustes?.musica_nombre ?? null);
      setInfo({ ajustes: inf.ajustes, zonas: (inf.zonas ?? []).map((z) => ({ ...z, tarifa: Number(z.tarifa) })), opciones: inf.opciones ?? [], promos: inf.promos ?? [], hay_codigos: !!inf.hay_codigos,
        combos: (inf.combos ?? []).map((c) => ({ ...c, precio: Number(c.precio), normal: Number(c.normal) })) });
    });
  }, [sede]);

  const platos = useMemo(() => agruparPlatos(menu ?? []), [menu]);
  // Si un producto del carrito ya no se vende o cambió de precio, el carrito se ajusta al menú actual
  useEffect(() => {
    if (!menu) return;
    const precio = new Map(menu.filter((p) => p.disponibles !== 0).map((p) => [p.id, p.precio]));
    const agotados = carrito.filter((l) => !l.combo_id && menu.some((p) => p.id === l.producto_id && p.disponibles === 0));
    if (agotados.length) { setAviso(`Se agotó: ${agotados.map((l) => l.nombre).join(', ')}. Lo quitamos de tu pedido.`); setTimeout(() => setAviso(''), 4000); }
    const combos = new Map((info.combos ?? []).map((c) => [c.id, c.precio]));
    const ajustado = carrito.filter((l) => (l.combo_id ? combos.has(l.combo_id) : precio.has(l.producto_id)))
      .map((l) => ({ ...l, precio_base: l.combo_id ? combos.get(l.combo_id)! : precio.get(l.producto_id)! }));
    if (JSON.stringify(ajustado) !== JSON.stringify(carrito)) setCarrito(ajustado);
  }, [menu, info.combos]);

  const portada = useMemo(() => {
    const libres = platos.filter((p) => !platoAgotado(p));
    const d = libres.filter((p) => p.destacado);
    return d.length ? d : libres.filter((p) => p.categoria_tipo === 'pizza');
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

  function agregarCombo(c: Combo) {
    const ya = carrito.find((l) => l.combo_id === c.id);
    setCarrito(ya ? carrito.map((l) => (l === ya ? { ...l, cantidad: Math.min(50, l.cantidad + 1) } : l))
      : [...carrito, { clave: crypto.randomUUID(), plato_id: 'combo:' + c.id, producto_id: '', combo_id: c.id, nombre: c.nombre, tamano: null,
        precio_base: c.precio, opciones: [], nota: '', cantidad: 1, detalle: c.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(' + ') }]);
    setAviso(fraseAgregado('combo ' + c.nombre, subtotal + c.precio)); setTimeout(() => setAviso(''), 3200);
    volarAlCarrito(); setTimeout(() => confeti(), 600);
    setSugFlot(null);
  }

  /** El cliente armó un combo con productos sueltos: se cambian por el combo (con su precio real, que es menor) */
  function cambiarACombo(c: Combo) {
    let lineas = carrito.map((l) => ({ ...l }));
    for (const it of c.items) {
      let falta = it.cantidad;
      for (const l of lineas) {
        if (falta <= 0) break;
        if (l.combo_id || l.producto_id !== it.producto_id || l.opciones.length || l.nota) continue;
        const usa = Math.min(falta, l.cantidad); l.cantidad -= usa; falta -= usa;
      }
      if (falta > 0) return;   // ya no alcanza (cambió el carrito)
    }
    lineas = lineas.filter((l) => l.cantidad > 0);
    const ya = lineas.find((l) => l.combo_id === c.id);
    setCarrito(ya ? lineas.map((l) => (l === ya ? { ...l, cantidad: l.cantidad + 1 } : l))
      : [...lineas, { clave: crypto.randomUUID(), plato_id: 'combo:' + c.id, producto_id: '', combo_id: c.id, nombre: c.nombre, tamano: null,
        precio_base: c.precio, opciones: [], nota: '', cantidad: 1, detalle: c.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(' + ') }]);
    confeti(); setAviso(`🎉 ¡Combo ${c.nombre} completo! Ahorraste ${plata(c.normal - c.precio)}`); setTimeout(() => setAviso(''), 3500);
  }

  // La sugerencia se esconde sola para no estorbar
  useEffect(() => { if (!sugFlot) return; const t = setTimeout(() => setSugFlot(null), 10000); return () => clearTimeout(t); }, [sugFlot]);

  function sugerirDespues(nuevo: LineaCarrito[], agregado: { tipo: string }) {
    if (agregado.tipo === 'bebida') { setSugFlot(null); return; }
    const items = recomendar(nuevo, platos, info.combos ?? [], 3);
    if (!items.length) { setSugFlot(null); return; }
    const titulo = agregado.tipo === 'pizza' ? '¡Tu pizza ya está lista para acompañarse!' : '¡Completa tu pedido!';
    setSugFlot({ titulo, items });
  }

  /** Un toque: si el producto tiene un solo tamaño y no tiene adicionales se agrega directo; si no, se abre su ventana */
  function agregarRapido(p: Plato) {
    if (!agregaDirecto(p, info.opciones)) { setArmando({ plato: p }); return; }
    const v = p.variantes[0];
    listo({ clave: crypto.randomUUID(), plato_id: p.id, producto_id: v.producto_id, nombre: p.nombre, tamano: v.etiqueta || null,
      precio_base: v.precio, opciones: [], nota: '', cantidad: 1 });
  }

  function listo(l: LineaCarrito) {
    const existe = carrito.some((x) => x.clave === l.clave);
    const nuevoCarrito = existe ? carrito.map((x) => (x.clave === l.clave ? l : x)) : [...carrito, l];
    setCarrito(nuevoCarrito);
    if (!existe) sugerirDespues(nuevoCarrito, { tipo: platos.find((p) => p.id === l.plato_id)?.categoria_tipo ?? '' });
    setArmando(null);
    if (!existe) {
      const nuevo = subtotal + precioLinea(l) * l.cantidad;
      setAviso(fraseAgregado(l.nombre, nuevo)); setTimeout(() => setAviso(''), 3200);
      requestAnimationFrame(() => volarAlCarrito());
    }
  }

  const sedeNombre = sedes?.find((s) => s.id === sede)?.nombre ?? '';
  const abrir = useCallback((p: Plato) => setArmando({ plato: p }), []);
  // Atrás (celular o navegador) cierra lo que esté abierto en vez de salir de la tienda
  useCapa(!!armando, () => setArmando(null));
  useCapa(verPedido, () => setVerPedido(false));
  useCapa(!!seguir, () => setSeguir(null));
  useCapa(cambiarSede && !!sede, () => setCambiarSede(false));
  if (!configurado) return <div className="t-pagina t-centro">La tienda aún no está conectada.</div>;

  const aj = info.ajustes;
  const tarifaMin = info.zonas.length ? Math.min(...info.zonas.map((z) => z.tarifa)) : null;
  const tiempo = minutos(info.zonas);
  const combos = info.combos ?? [];
  const whatsapp = aj?.whatsapp ? `https://wa.me/57${aj.whatsapp}?text=${encodeURIComponent(`Hola Max Pizza ${sedeNombre}, quiero hacer un pedido 🍕`)}` : null;
  const sugerencias = [
    ...(combos.length ? ['Combos'] : []),
    ...portada.slice(0, 4).map((p) => p.nombre.replace(/^Pizza\s+/i, '')),
    ...platos.filter((p) => p.categoria_tipo === 'rapida').slice(0, 2).map((p) => p.nombre),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);
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

  // Datos reales para las etiquetas de las tarjetas
  const enAlgunCombo = new Set(combos.flatMap((c) => c.items.map((i) => i.producto_id)));
  const conAdic = new Set(info.opciones.map((o) => o.producto_id));
  const tarjeta = (p: Plato, sello?: string) => (
    <TarjetaPremium key={p.id} p={p} sello={sello} enPedido={enCarrito(p.id)} onAbrir={abrir}
      enCombo={p.variantes.some((v) => enAlgunCombo.has(v.producto_id))} conAdicionales={p.variantes.some((v) => conAdic.has(v.producto_id))} />
  );

  return (
    <div className="t-pagina t-con-nav" onPointerDownCapture={(e) => recordarOrigen(e.nativeEvent)}>
      <header className="t-barra">
        <button className="t-icono-redondo" aria-label="Cambiar de sede" onClick={() => setCambiarSede(true)}>📍</button>
        <div className="t-saludo">
          <span>¡Hola! Pides en <b>{sedeNombre || 'tu sede'}</b> 🍕</span>
          <div className="t-marca"><Logo alto={30} /></div>
        </div>
        <ControlSonido />
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
              <input placeholder="Busca tu pizza favorita…" value={busca} onFocus={() => setBuscando(true)} onBlur={() => setTimeout(() => setBuscando(false), 200)}
                onChange={(e) => { setBusca(e.target.value); if (e.target.value) irA('Todo'); }} />
              {busca && <button aria-label="Borrar búsqueda" onClick={() => setBusca('')}>✕</button>}
            </label>
            <span className={'t-estado-chip ' + (aj && !aj.abierta ? 'cerrada' : 'abierta')}>{aj && !aj.abierta ? 'Cerrado' : 'Abierto'}</span>
          </div>
          {buscando && !busca && sugerencias.length > 0 && (
            <div className="t-sugerencias">
              <small>Lo más buscado</small>
              {sugerencias.map((s) => <button key={s} onMouseDown={(e) => e.preventDefault()}
                onClick={() => { if (s === 'Combos') { setBuscando(false); document.getElementById('combos')?.scrollIntoView({ behavior: 'smooth' }); } else { setBusca(s); irA('Todo'); } }}>{s}</button>)}
            </div>
          )}

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

          {!q && <Caja lineas={carrito} platos={platos} onVerPedido={unidades ? () => setVerPedido(true) : undefined} />}

          <nav className="t-circulos" id="menu">
            {['Todo', ...cats].map((c) => (
              <button key={c} className={c === cat ? 'on' : ''} onClick={() => irA(c)}>
                <span className="t-circulo">{c === 'Todo' ? <span style={{ fontSize: 28 }}>🍽️</span> : iconoCat(c)}</span>
                {c}
              </button>
            ))}
          </nav>

          <main className="t-menu">
            {!q && aj?.banner && (
              <div className="t-temporada">
                {aj.banner.etiqueta && <span className="t-etiqueta">{aj.banner.etiqueta}</span>}
                <b>{aj.banner.titulo}</b>
                {aj.banner.texto && <span>{aj.banner.texto}</span>}
                <button className="t-btn" onClick={() => (combos.length ? document.getElementById('combos')?.scrollIntoView({ behavior: 'smooth' }) : irA(cats[0] ?? 'Todo'))}>Pedir ahora →</button>
              </div>
            )}

            {!q && portada.length > 0 && (
              <section>
                <div className="t-titulo-fila"><h2 className="t-titulo-cat">Los más pedidos</h2>
                  <button className="t-ver-todo" onClick={() => irA(cats[0] ?? 'Todo')}>Ver todo →</button></div>
                <div className="t-cards t-cards-deslizar">
                  {portada.slice(0, 6).map((p, i) => tarjeta(p, p.destacado ? '★ Favorita de la casa' : undefined))}
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

            {!q && combos.length > 0 && (
              <section id="combos">
                <h2 className="t-titulo-cat">🎉 Combos</h2>
                <div className="t-combos">
                  {combos.map((c) => {
                    const n = enCarrito('combo:' + c.id);
                    const fuera = c.items.some((i) => menu?.some((p) => p.id === i.producto_id && p.disponibles === 0));
                    return (
                      <article key={c.id} className={'t-combo' + (fuera ? ' t-agotado' : '')} onClick={() => !fuera && agregarCombo(c)} aria-disabled={fuera}>
                        {fuera ? <span className="t-sello t-sello-agotado">AGOTADO</span> : c.normal > c.precio && <span className="t-sello">AHORRAS {plata(c.normal - c.precio)}</span>}
                        <div className="t-combo-img">
                          {c.foto_url ? <img className="t-foto" src={c.foto_url} alt={c.nombre} style={{ width: 120, height: 120 }} />
                            : c.items.slice(0, 3).map((i) => { const p = platos.find((x) => x.variantes.some((v) => v.producto_id === i.producto_id) || x.id === i.producto_id);
                              return <span key={i.producto_id}>{p ? <ImagenProducto p={p} tam={70} /> : '🍽️'}</span>; })}
                        </div>
                        <div className="t-combo-txt">
                          <b>{c.nombre}</b>
                          <span>{c.descripcion || c.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(' + ')}</span>
                          <div className="t-card-pie">
                            <span className="t-card-precio">{plata(c.precio)} {c.normal > c.precio && <s>{plata(c.normal)}</s>}</span>
                            {fuera ? <span className="t-card-agotado">Vuelve pronto</span>
                              : <button className={'t-card-mas' + (n ? ' con' : '')} aria-label={`Agregar ${c.nombre}`}>{n || '＋'}</button>}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {cats.map((c) => (
              <section key={c} id={'cat-' + c} data-cat={c}>
                <h2 className="t-titulo-cat">{c}</h2>
                <div className="t-cards">
                  {visibles.filter((p) => p.categoria === c).map((p) => tarjeta(p))}
                </div>
              </section>
            ))}
            {q && !visibles.length && <div className="t-centro">No encontramos “{busca}”. Prueba con otra palabra.</div>}
            {menu && !menu.length && <div className="t-centro">Esta sede aún no tiene productos en línea.</div>}

            <div className="t-confianza">
              {(!aj || aj.domicilio) && <div><span>🛵</span><b>{tiempo ? `Llega en ${tiempo}` : 'Domicilio'}</b><small>{tarifaMin != null ? `Domicilio desde ${plata(tarifaMin)}` : 'a tu puerta'}</small></div>}
              <div><span>🔥</span><b>Recién hecha</b><small>Siempre fresca</small></div>
              <div><span>🎁</span><b>Promociones</b><small>{(info.promos ?? []).length ? 'Activas hoy' : 'Muy pronto'}</small></div>
              <div><span>🔒</span><b>Pago fácil</b><small>Efectivo o Nequi</small></div>
            </div>
          </main>

          <footer className="t-pie">
            <div className="t-marca"><Logo alto={44} /></div>
            <span>Max Pizza · {sedeNombre}{aj?.horario_texto ? ` · ${aj.horario_texto}` : ''}</span>
            <div className="t-pie-links">
              {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
              {aj?.instagram && <a href={`https://instagram.com/${aj.instagram}`} target="_blank" rel="noreferrer">📸 Instagram</a>}
              {aj?.facebook && <a href={`https://facebook.com/${aj.facebook}`} target="_blank" rel="noreferrer">👍 Facebook</a>}
              {aj?.tiktok && <a href={`https://tiktok.com/@${aj.tiktok}`} target="_blank" rel="noreferrer">🎵 TikTok</a>}
              <button className="t-enlace" onClick={() => setSeguir('buscar')}>📦 Seguir mi pedido</button>
            </div>
            <a href="/">¿Trabajas en Max Pizza? Entrar</a>
          </footer>

          {whatsapp && !verPedido && !armando && (
            <a className="t-whatsapp" href={whatsapp} target="_blank" rel="noreferrer" aria-label="Pedir por WhatsApp">
              <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path fill="#fff" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.7c-2 0-3.9-.5-5.6-1.5l-.4-.2-3.9 1 1-3.8-.2-.4A10.7 10.7 0 1 1 16 26.7Zm5.9-8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1a8.8 8.8 0 0 1-4.4-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7c0 1.6 1.2 3.1 1.3 3.3.2.2 2.3 3.5 5.5 4.9 2 .9 2.8.9 3.8.8.6-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4Z" /></svg>
            </a>
          )}

          {unidades > 0 && !verPedido && !armando && (
            <button className="t-barra-carrito" onClick={() => setVerPedido(true)}>
              <span className="t-burbuja">{unidades}</span><b>Ver mi pedido</b><span>{plata(subtotal)}</span>
            </button>
          )}

          <Bienvenida />
          <Max unidades={unidades} oculto={!!armando || verPedido || !!seguir || !!sugFlot} />
          {sugFlot && !armando && !verPedido && (
            <SugerenciaFlotante titulo={sugFlot.titulo} items={sugFlot.items} onCerrar={() => setSugFlot(null)}
              onPlato={(p) => { setSugFlot(null); agregarRapido(p); }} onCombo={(c) => { setSugFlot(null); agregarCombo(c); }} />
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
        <Pedido lineas={carrito} platos={platos} info={info} onCambiarCombo={cambiarACombo} onAgregarPlato={agregarRapido} onAgregarCombo={agregarCombo} sede={sede!} sedeNombre={sedeNombre} onCerrar={() => setVerPedido(false)}
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
