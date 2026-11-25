// Pantalla de bienvenida: el toque en "Entrar" es el que deja sonar la música (los navegadores no dejan sonar sin un toque).
// Sale una vez por visita, solo si la música está prendida y todavía no pudo sonar sola.
import { useEffect, useState } from 'react';
import { Logo } from '../componentes/Logo';
import { MaxDibujo } from './Max';
import { sonido } from './sonido';
import { PizzaAudifonos } from './ControlSonido';

const CLAVE = 'maxpizza.tienda.bienvenida';

export function Bienvenida() {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).has('bienvenida')) { setVer(true); return; }   // para revisarla a propósito
    if (sessionStorage.getItem(CLAVE) || !sonido.prefs().musica) return;
    // Damos un momento por si el navegador sí deja sonar solo (algunos computadores)
    const t = setTimeout(() => { if (!sonido.prefs().sonando) setVer(true); }, 900);
    return () => clearTimeout(t);
  }, []);
  if (!ver) return null;

  const entrar = (musica: boolean) => {
    sessionStorage.setItem(CLAVE, '1');
    sonido.cambiar({ musica });   // este toque es el permiso para sonar
    setVer(false);
  };

  return (
    <div className="t-bienvenida" role="dialog" aria-label="Bienvenido a Max Pizza">
      <div className="t-bienv-luces" aria-hidden />
      <div className="t-bienv-logo"><Logo alto={84} /></div>
      <div className="t-bienv-max"><MaxDibujo estado="bienvenida" tam={120} /></div>
      <h1>¡Bienvenido a <em>Max Pizza</em>!</h1>
      <p>Recién salidas del horno, directo a tu puerta 🔥</p>
      <button className="t-bienv-entrar" onClick={() => entrar(true)} autoFocus>
        <PizzaAudifonos sonando tam={34} /> Entrar con música
      </button>
      <button className="t-bienv-sin" onClick={() => entrar(false)}>Entrar sin música</button>
    </div>
  );
}
