import type { ReactNode } from 'react';
// Barra de arriba de la tienda (según el diseño del dueño): "Max Pizza" + Sede · Seguir mi domicilio · Mi carrito,
// con íconos amarillos propios (SVG) y rayitas doradas entre cada uno.

export function Encabezado({ sede, unidades, hayPedido, onSede, onSeguir, onCarrito, buscador }: {
  sede: string; unidades: number; hayPedido: boolean; onSede: () => void; onSeguir: () => void; onCarrito: () => void; buscador?: ReactNode;
}) {
  return (
    <header className="t-barra enc">
      <a className="enc-marca" href="/pedir" aria-label="Max Pizza, inicio">Max <em>Pizza</em></a>
      <nav className="enc-items">
        <button className="enc-item" onClick={onSede} aria-label={`Sede: ${sede || 'escoger'}. Toca para cambiar`}>
          <IconoCasa /><span>{sede || 'Escoger sede'}</span>
        </button>
        <button className="enc-item" onClick={onSeguir} aria-label="Seguir mi domicilio">
          <IconoMoto />{hayPedido && <i className="enc-punto" />}<span>Seguir mi<br />Domicilio</span>
        </button>
        <button className="enc-item" onClick={onCarrito} aria-label={`Mi carrito${unidades ? `, ${unidades} productos` : ''}`}>
          <span className="enc-carrito"><IconoCarrito />{unidades > 0 && <b className="enc-n" key={unidades}>{unidades}</b>}</span>
          <span>Mi Carrito</span>
        </button>
      </nav>
      {buscador}
    </header>
  );
}

const ORO = { a: '#FFD23F', b: '#E3A21A', c: '#A86F08' };

function Gradientes({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={ORO.a} /><stop offset=".6" stopColor={ORO.b} /><stop offset="1" stopColor={ORO.c} /></linearGradient>
    </defs>
  );
}

function IconoCasa() {
  return (
    <svg className="enc-ico" viewBox="0 0 64 56" aria-hidden="true">
      <Gradientes id="g-casa" />
      <ellipse cx="32" cy="52" rx="24" ry="3" fill="#000" opacity=".5" />
      <rect x="44" y="6" width="6" height="12" rx="1.5" fill="url(#g-casa)" />
      <path d="M14 26 H50 V50 H14 Z" fill="#F4F1EA" stroke="#d9d2c2" strokeWidth="1" />
      <path d="M8 28 L32 7 L56 28" fill="none" stroke="url(#g-casa)" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M26 50 V39 a6 6 0 0 1 12 0 V50 Z" fill="#2a2016" />
      <circle cx="35.5" cy="44" r="1" fill={ORO.b} />
      <rect x="40.5" y="31" width="7" height="7" rx="1" fill={ORO.a} stroke="#7a5a10" strokeWidth="1" />
      <path d="M44 31 V38 M40.5 34.5 H47.5" stroke="#7a5a10" strokeWidth="1" />
      <rect x="12" y="49" width="40" height="3" rx="1.5" fill="url(#g-casa)" />
    </svg>
  );
}

function IconoMoto() {
  return (
    <svg className="enc-ico" viewBox="0 0 76 56" aria-hidden="true">
      <Gradientes id="g-moto" />
      {/* mapa */}
      <path d="M2 34 L18 28 L32 33 L46 27 L46 47 L32 53 L18 47 L2 53 Z" fill="#ECE8DF" stroke="#cfc8b8" strokeWidth="1" />
      <path d="M6 44 Q16 38 26 44 T44 40" stroke={ORO.b} strokeWidth="1.6" fill="none" opacity=".8" />
      {/* pin */}
      <path d="M17 6 a9 9 0 0 1 9 9 c0 7 -9 17 -9 17 s-9 -10 -9 -17 a9 9 0 0 1 9 -9 Z" fill="url(#g-moto)" stroke="#8a5d08" strokeWidth="1" />
      <circle cx="17" cy="15" r="3.4" fill="#2a2016" />
      {/* moto con caja y domiciliario */}
      <rect x="36" y="18" width="14" height="11" rx="2" fill="url(#g-moto)" stroke="#8a5d08" strokeWidth="1" />
      <path d="M40 41 Q42 32 52 32 L62 32 Q68 33 68 40 Z" fill="url(#g-moto)" stroke="#8a5d08" strokeWidth="1" />
      <path d="M60 32 L63 22 L67 22" stroke="#2a2016" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="58" cy="16" r="5" fill="url(#g-moto)" stroke="#8a5d08" strokeWidth="1" />
      <path d="M53.5 16 h9" stroke="#2a2016" strokeWidth="1.6" />
      <path d="M57 21 L55 30 L61 30" stroke="url(#g-moto)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="44" cy="44" r="6" fill="#2a2016" /><circle cx="44" cy="44" r="2.4" fill={ORO.a} />
      <circle cx="66" cy="44" r="6" fill="#2a2016" /><circle cx="66" cy="44" r="2.4" fill={ORO.a} />
      <path d="M70 26 h5 M71 31 h4" stroke={ORO.b} strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

function IconoCarrito() {
  return (
    <svg className="enc-ico" viewBox="0 0 64 56" aria-hidden="true">
      <Gradientes id="g-carro" />
      <ellipse cx="34" cy="53" rx="22" ry="2.5" fill="#000" opacity=".5" />
      <path d="M4 8 H13 L20 38 H50" fill="none" stroke="url(#g-carro)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 14 H56 L51 33 H19 Z" fill="url(#g-carro)" stroke="#8a5d08" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M26 14 L27 33 M36 14 V33 M46 14 L44 33 M17 23.5 H53.5" stroke="#5c3d05" strokeWidth="1.6" opacity=".55" />
      <circle cx="24" cy="46" r="5" fill="#2a2016" /><circle cx="24" cy="46" r="2" fill="#ECE8DF" />
      <circle cx="46" cy="46" r="5" fill="#2a2016" /><circle cx="46" cy="46" r="2" fill="#ECE8DF" />
    </svg>
  );
}

