// Barra fija arriba de cada ventana de la tienda: botón "‹ Atrás" limpio (siempre visible, no se va con el scroll)
// y la rayita para indicar que la ventana se puede cerrar. Reemplaza la ✕ suelta que quedaba tapada en iPhone.
export function BarraHoja({ onAtras, titulo, oscura = false }: { onAtras: () => void; titulo?: string; oscura?: boolean }) {
  return (
    <div className={'t-hoja-barra' + (oscura ? ' oscura' : '')}>
      <span className="t-hoja-agarre" aria-hidden />
      <button className="t-atras-hoja" onClick={onAtras} aria-label="Atrás">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Atrás</span>
      </button>
      {titulo && <b className="t-hoja-titulo">{titulo}</b>}
    </div>
  );
}
