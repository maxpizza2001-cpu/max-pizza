// Pantalla de bienvenida: el toque en "Entrar" es el que deja sonar la música (los navegadores no dejan sonar sin un toque).
// Sale una vez por visita si la música no pudo sonar sola.
import { useEffect, useState } from 'react';
import { IMAGENES_CHEF } from './Chef';
import { sonido } from './sonido';
import { PizzaAudifonos } from './ControlSonido';

const CLAVE = 'maxpizza.tienda.bienvenida';

export function Bienvenida() {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).has('bienvenida')) { setVer(true); return; }   // para revisarla a propósito
    // Sale en cada visita (aunque antes hayan apagado la música): un toque y entran con música o sin ella
    if (sessionStorage.getItem(CLAVE)) return;
    // Damos un momento por si el navegador sí deja sonar solo (algunos computadores)
    const t = setTimeout(() => { if (!sonido.prefs().sonando) setVer(true); }, 900);
    return () => clearTimeout(t);
  }, []);
  if (!ver) return null;

  // Un solo toque (en el botón o en cualquier parte) entra y prende la música: sin preguntas
  const entrar = () => {
    sessionStorage.setItem(CLAVE, '1');
    sonido.cambiar({ musica: true });   // este toque es el permiso para sonar
    setVer(false);
  };

  return (
    <div className="t-bienvenida" role="dialog" aria-label="Bienvenido a Max Pizza" onClick={entrar}>
      <div className="t-bienv-luces" aria-hidden />
      <div className="t-bienv-max"><img src={IMAGENES_CHEF[0]} alt="Don Iván, el chef de Max Pizza" width={550} height={1134} /></div>
      <h1>¡Bienvenido a <em>Max Pizza</em>!</h1>
      <p><b className="t-bienv-nombre">Don Iván</b> ya prendió el horno 🔥 Recién salidas, directo a tu puerta</p>
      <button className="t-bienv-entrar" onClick={(e) => { e.stopPropagation(); entrar(); }} autoFocus>
        <PizzaAudifonos sonando tam={34} /> ¡Entrar!
      </button>
      <span className="t-bienv-sin">Toca en cualquier parte para entrar</span>
    </div>
  );
}
