// Botón de la tienda: pizza con audífonos 🍕🎧 → música on/off, efectos on/off y volumen. La música arranca apagada.
import { useEffect, useState } from 'react';
import { sonido } from './sonido';

/** Una porción de pizza con audífonos (dibujo propio). Cuando suena, los audífonos brillan y salen notas. */
export function PizzaAudifonos({ sonando, tam = 30 }: { sonando: boolean; tam?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={tam} height={tam} aria-hidden="true" className={'t-pizza-audio' + (sonando ? ' on' : '')}>
      {/* porción */}
      <path d="M24 44 L9 15 Q24 8 39 15 Z" fill="#F2C14E" stroke="#C8432B" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 15 Q24 8 39 15 L37.5 12 Q24 5 10.5 12 Z" fill="#E7A94F" stroke="#A9661F" strokeWidth="1.2" />
      <circle cx="19" cy="20" r="3" fill="#B8322A" /><circle cx="28" cy="25" r="3" fill="#B8322A" /><circle cx="23" cy="33" r="2.6" fill="#B8322A" />
      <circle cx="30" cy="17.5" r="1.3" fill="#3E8E41" /><circle cx="18" cy="27" r="1.3" fill="#3E8E41" />
      {/* carita */}
      <circle cx="20.5" cy="23.5" r="1.1" fill="#141414" /><circle cx="27" cy="23.5" r="1.1" fill="#141414" />
      <path d="M21 27.5 q2.8 2.2 5.6 0" stroke="#141414" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      {/* audífonos */}
      <path d="M8 24 Q8 4 24 4 Q40 4 40 24" stroke="#141414" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <rect className="t-audifono" x="3.5" y="20" width="8" height="12" rx="3.5" fill="#141414" stroke="#E3A21A" strokeWidth="1.4" />
      <rect className="t-audifono" x="36.5" y="20" width="8" height="12" rx="3.5" fill="#141414" stroke="#E3A21A" strokeWidth="1.4" />
      {sonando && <g className="t-notas" fill="#E3A21A"><text x="40" y="9" fontSize="9">♪</text><text x="1" y="11" fontSize="8">♫</text></g>}
    </svg>
  );
}

export function ControlSonido() {
  const [p, setP] = useState(sonido.prefs());
  const [abierto, setAbierto] = useState(false);
  useEffect(() => sonido.escuchar(setP), []);

  return (
    <div className="t-sonido">
      <button className={'t-icono-redondo' + (p.sonando ? ' t-sonando' : '')} aria-label="Música y sonidos" aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}>
        <PizzaAudifonos sonando={p.sonando} />
      </button>
      {abierto && (
        <div className="t-sonido-panel" role="dialog" aria-label="Música y sonidos">
          <div className="fila" style={{ gap: 8, alignItems: 'center' }}><PizzaAudifonos sonando={p.sonando} tam={40} /><b>Ambiente Max Pizza</b></div>
          <small>{p.cancion ? <>🎵 Sonando: <b>{p.cancion}</b></> : 'Música instrumental original de Max Pizza.'} Puedes apagarla cuando quieras.</small>
          <label className="t-interruptor">
            <input type="checkbox" checked={p.musica} onChange={(e) => sonido.cambiar({ musica: e.target.checked })} />
            <span>🎶 Música</span>
          </label>
          <label className="t-interruptor">
            <input type="checkbox" checked={p.efectos} onChange={(e) => { sonido.cambiar({ efectos: e.target.checked }); if (e.target.checked) sonido.efecto('agregar'); }} />
            <span>✨ Sonidos al agregar y confirmar</span>
          </label>
          <label className="t-volumen">
            <span>🔉</span>
            <input type="range" min={0} max={1} step={0.05} value={p.volumen} aria-label="Volumen"
              onChange={(e) => sonido.cambiar({ volumen: Number(e.target.value) })} />
            <span>🔊</span>
          </label>
          <button className="t-enlace-osc" onClick={() => setAbierto(false)}>Listo</button>
        </div>
      )}
    </div>
  );
}
