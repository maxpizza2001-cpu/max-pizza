// Gráfica de progreso: anillo (celular) o barra (vistas compactas)
export function Anillo({ listas, total, size = 150 }: { listas: number; total: number; size?: number }) {
  const pct = total ? Math.round((100 * listas) / total) : 0;
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div style={{ display: 'grid', placeItems: 'center' }} role="img"
      aria-label={total ? `${listas} de ${total} tareas listas, ${pct} por ciento` : 'Sin tareas asignadas'}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#E8E3D8" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="#E3A21A" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dasharray .5s ease' }} />
        <text x="60" y="58" textAnchor="middle" fontFamily="Montserrat" fontWeight="800" fontSize="26" fill="#141414">
          {total ? `${pct} %` : '—'}
        </text>
        <text x="60" y="78" textAnchor="middle" fontFamily="Plus Jakarta Sans" fontWeight="600" fontSize="10.5" fill="#6B665D">
          {total ? `${listas} de ${total} listas` : 'Sin tareas'}
        </text>
      </svg>
    </div>
  );
}

export function Barra({ listas, total }: { listas: number; total: number }) {
  const pct = total ? Math.round((100 * listas) / total) : 0;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="fila entre" style={{ fontSize: 13, fontWeight: 700 }}>
        <span>{total ? `${listas} de ${total} listas` : 'Sin tareas asignadas'}</span>
        <span>{total ? `${pct} %` : ''}</span>
      </div>
      <div style={{ height: 10, borderRadius: 10, background: '#E8E3D8', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#E3A21A', transition: 'width .5s ease' }} />
      </div>
    </div>
  );
}
