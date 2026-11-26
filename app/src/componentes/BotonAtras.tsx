// Botón de atrás en forma de porción de pizza 🍕 (abajo a la izquierda). Sale solo cuando hay a dónde volver.
import { irAtras, useHayAtras } from '../lib/atras';

export function BotonAtras() {
  const hay = useHayAtras();
  if (!hay) return null;
  return (
    <button className="boton-atras" onClick={irAtras} aria-label="Atrás">
      <svg viewBox="0 0 64 64" width="58" height="58" aria-hidden="true">
        {/* porción de pizza apuntando a la izquierda (la punta es la flecha) */}
        <path d="M6 32 L54 10 Q62 32 54 54 Z" fill="#F2C14E" stroke="#C8432B" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M54 10 Q62 32 54 54 L59 55 Q68 32 59 9 Z" fill="#E7A94F" stroke="#A9661F" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="38" cy="24" r="4" fill="#B8322A" /><circle cx="44" cy="38" r="4" fill="#B8322A" /><circle cx="27" cy="33" r="3.4" fill="#B8322A" />
        <circle cx="46" cy="28" r="1.6" fill="#3E8E41" /><circle cx="34" cy="41" r="1.6" fill="#3E8E41" />
        <path d="M30 22 l-8 10 l8 10" stroke="#141414" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
      </svg>
      <span>Atrás</span>
    </button>
  );
}
