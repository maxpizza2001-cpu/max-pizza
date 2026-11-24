// Logo Max Pizza: corona sobre una porción (según la identidad oficial en diseno/referencias/3.jpg)
export function Icono({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <g stroke="#141414" strokeWidth="3" strokeLinejoin="round" fill="#E3A21A">
        {/* corona */}
        <path d="M10 26 L14 12 L23 21 L32 8 L41 21 L50 12 L54 26 Z" />
        <circle cx="14" cy="10" r="3.2" />
        <circle cx="32" cy="6" r="3.2" />
        <circle cx="50" cy="10" r="3.2" />
        {/* porción */}
        <path d="M9 28 H55 L32 60 Z" />
      </g>
      <g fill="#141414">
        <circle cx="25" cy="36" r="3.4" />
        <circle cx="39" cy="36" r="3.4" />
        <circle cx="32" cy="47" r="3.4" />
      </g>
    </svg>
  );
}

export function Logo({ size = 34, claro = true }: { size?: number; claro?: boolean }) {
  return (
    <span className="logo" style={{ color: claro ? '#fff' : '#141414' }}>
      <Icono size={size} />
      <span className="logo-texto">MAX PIZZA</span>
    </span>
  );
}
