/**
 * StatusBadge - Chip de estado activo / inactivo.
 *
 *   <StatusBadge activo={centro.activo} />
 *   <StatusBadge activo={u.activo} labels={['Habilitada', 'Deshabilitada']} />
 */

export default function StatusBadge({ activo, labels = ['Activo', 'Inactivo'] }) {
  return (
    <span className={`ui-chip${activo ? ' ui-chip--ok' : ''}`}>
      <span className={`ui-dot${activo ? ' ui-dot--ok' : ''}`} aria-hidden="true" />
      {activo ? labels[0] : labels[1]}
    </span>
  )
}
