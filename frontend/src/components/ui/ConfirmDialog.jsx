/**
 * ConfirmDialog - Confirmación de acciones destructivas o con efectos (bajas, resets).
 *
 *   <ConfirmDialog
 *     open={!!aDesactivar}
 *     title="Desactivar institución"
 *     confirmLabel="Desactivar"
 *     tone="danger"
 *     onConfirm={desactivar}
 *     onCancel={() => setADesactivar(null)}
 *     loading={guardando}
 *   >
 *     Deja de aparecer en el mapa público...
 *   </ConfirmDialog>
 *
 * Si `onConfirm` lanza un error, se muestra dentro del diálogo.
 */

import { useEffect, useState } from 'react'
import { WarningCircle } from '@phosphor-icons/react'
import Modal from './Modal.jsx'

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  onConfirm,
  onCancel,
  loading = false,
}) {
  const [error, setError] = useState(null)
  const [enCurso, setEnCurso] = useState(false)

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  const ocupado = loading || enCurso

  const confirmar = async () => {
    setError(null)
    setEnCurso(true)
    try {
      await onConfirm?.()
    } catch (err) {
      setError(err?.message || 'No se pudo completar la acción.')
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      bloqueado={ocupado}
      footer={
        <>
          <button type="button" className="ui-btn ui-btn--quiet" onClick={onCancel} disabled={ocupado}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`ui-btn ${tone === 'danger' ? 'ui-btn--primary' : 'ui-btn--dark'}`}
            onClick={confirmar}
            disabled={ocupado}
          >
            {ocupado ? 'Procesando…' : confirmLabel}
          </button>
        </>
      }
    >
      {error && (
        <div className="ui-alert" role="alert">
          <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
      <div className="ui-confirm__text">{children}</div>
    </Modal>
  )
}
