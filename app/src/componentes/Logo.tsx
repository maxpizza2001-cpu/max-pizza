// Logo oficial de Max Pizza (diseno/logo-oficial.jpg, recortado en public/logo.png).
// Tiene fondo negro: va sobre la barra negra y la pantalla de entrada.
export function Logo({ alto = 46 }: { alto?: number }) {
  return <img className="logo-img" src="./logo.png" alt="Max Pizza · ¡Más sabor!" style={{ height: alto }} />;
}
