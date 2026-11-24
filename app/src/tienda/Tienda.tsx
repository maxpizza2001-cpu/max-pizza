// Tienda online pública (/pedir): el cliente escoge sede, ve la portada giratoria y el menú.
// Lee el MISMO catálogo de Administración por funciones públicas (tienda_sedes / tienda_catalogo).
import { useEffect, useMemo, useState } from 'react';
import { configurado, sb } from '../lib/supabase';
import { plata } from '../lib/formato';
import { Logo } from '../componentes/Logo';
import { ImagenProducto } from './Dibujos';
import { Rueda } from './Rueda';
import './tienda.css';

export type ProductoTienda = {
  id: string; nombre: string; descripcion: string | null; foto_url: string | null; precio: number;
  destacado: boolean; formato: string; categoria: string; categoria_tipo: string; categoria_orden: number;
};
type SedeT = { id: string; nombre: string };

const CLAVE_SEDE = 'maxpizza.tienda.sede';

export function Tienda() {
  const [sedes, setSedes] = useState<SedeT[] | null>(null);
  const [sede, setSede] = useState<string | null>(() => localStorage.getItem(CLAVE_SEDE));
  const [menu, setMenu] = useState<ProductoTienda[] | null>(null);
  const [error, setError] = useState('');
  const [cat, setCat] = useState('Todo');
  const [elegir, setElegir] = useState(false);
  const [aviso, setAviso] = useState('');

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
    setMenu(null); setCat('Todo');
    sb.rpc('tienda_catalogo', { p_sede: sede }).then(({ data, error }) => {
      if (error) return setError('No pudimos cargar el menú. Revisa tu internet.');
      setMenu((data as ProductoTienda[]).map((p) => ({ ...p, precio: Number(p.precio) })));
    });
  }, [sede]);

  const portada = useMemo(() => {
    if (!menu) return [];
    const d = menu.filter((p) => p.destacado);
    return d.length ? d : menu.filter((p) => p.categoria_tipo === 'pizza' && p.formato === 'personal');
  }, [menu]);
  const categorias = useMemo(() => ['Todo', ...new Set((menu ?? []).map((p) => p.categoria))], [menu]);

  function pedir(p: ProductoTienda) {
    setAviso(`${p.nombre}: muy pronto podrás agregarlo al carrito y pedirlo desde aquí.`);
    setTimeout(() => setAviso(''), 3500);
  }

  const sedeNombre = sedes?.find((s) => s.id === sede)?.nombre;

  if (!configurado) return <div className="t-pagina t-centro">La tienda aún no está conectada.</div>;

  return (
    <div className="t-pagina">
      <header className="t-barra">
        <Logo alto={40} />
        {sede && <button className="t-sede" onClick={() => setElegir(true)}>📍 {sedeNombre ?? 'Sede'} ▾</button>}
      </header>

      {error && <div className="t-error">{error}</div>}

      {(!sede || elegir) && sedes && (
        <div className="t-elegir">
          <h1>¿Desde qué sede pides?</h1>
          <p>Cada sede tiene su menú y sus precios.</p>
          <div className="t-sedes">
            {sedes.map((s) => (
              <button key={s.id} className={'t-sede-tarjeta' + (s.id === sede ? ' on' : '')} onClick={() => { setSede(s.id); setElegir(false); }}>
                <span className="t-sede-icono">🍕</span><b>{s.nombre}</b><span>Ver menú →</span>
              </button>
            ))}
          </div>
          {sede && <button className="t-enlace" onClick={() => setElegir(false)}>Cancelar</button>}
        </div>
      )}

      {sede && !elegir && (
        <>
          <section className="t-portada">
            <div className="t-lema">¡Más sabor!<span>Recién salidas del horno, directo a tu puerta</span></div>
            {menu ? <Rueda items={portada} onElegir={pedir} /> : <div className="t-cargando">Calentando el horno…</div>}
          </section>

          <nav className="t-chips">
            {categorias.map((c) => <button key={c} className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}
          </nav>

          <main className="t-menu">
            {categorias.filter((c) => c !== 'Todo' && (cat === 'Todo' || cat === c)).map((c) => (
              <section key={c}>
                <h2 className="t-titulo-cat">{c}</h2>
                <div className="t-grilla">
                  {menu!.filter((p) => p.categoria === c).map((p) => (
                    <article key={p.id} className="t-tarjeta" onClick={() => pedir(p)}>
                      <div className="t-tarjeta-img"><ImagenProducto p={p} tam={120} /></div>
                      <div className="t-tarjeta-txt">
                        <b>{p.nombre}</b>
                        {p.descripcion && <span className="t-desc">{p.descripcion}</span>}
                        <div className="fila entre"><span className="t-precio">{plata(p.precio)}</span>
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
            <span>Max Pizza · {sedeNombre}</span>
            <a href="/">¿Trabajas en Max Pizza? Entrar</a>
          </footer>
        </>
      )}

      {aviso && <div className="t-toast">{aviso}</div>}
    </div>
  );
}
