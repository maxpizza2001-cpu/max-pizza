// Botón 🎵 de la tienda: música on/off, efectos on/off y volumen. Todo arranca apagado (la música).
import { useEffect, useState } from 'react';
import { sonido } from './sonido';

export function ControlSonido() {
  const [p, setP] = useState(sonido.prefs());
  const [abierto, setAbierto] = useState(false);
  useEffect(() => sonido.escuchar(setP), []);

  return (
    <div className="t-sonido">
      <button className={'t-icono-redondo' + (p.sonando ? ' t-sonando' : '')} aria-label="Música y sonidos" aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}>
        {p.sonando ? '🎵' : '🔈'}
        {p.sonando && <span className="t-ondas" aria-hidden><i /><i /><i /></span>}
      </button>
      {abierto && (
        <div className="t-sonido-panel" role="dialog" aria-label="Música y sonidos">
          <b>Ambiente Max Pizza</b>
          <small>Música instrumental original. Puedes apagarla cuando quieras.</small>
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
