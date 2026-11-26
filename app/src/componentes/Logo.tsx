// Logo oficial de Max Pizza (diseno/logo-oficial.jpg → public/logo.webp, 277×240, ~9 KB; antes logo.png de 564 KB).
// Tiene fondo negro: va sobre la barra negra y la pantalla de entrada.
export function Logo({ alto = 46 }: { alto?: number }) {
  return <img className="logo-img" src="/logo.webp" alt="Max Pizza · ¡Más sabor!" width={Math.round(alto * 277 / 240)} height={alto} decoding="async" style={{ height: alto, width: 'auto' }} />;
}
