/**
 * Modal / Drawer de formulario.
 *
 *   <Modal open={abierto} onClose={cerrar} title="Nueva especialidad" footer={<>...</>}>
 *     ...campos...
 *   </Modal>
 *
 *   <Modal variant="drawer" ...>  → panel lateral (en mobile ocupa todo el ancho)
 *
 * Cierra con Escape y con click en el fondo (salvo `bloqueado`, ej. mientras guarda).
 * Bloquea el scroll del body mientras está abierto y enfoca el panel al abrir.
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'dialog',
  size = 'md',
  bloqueado = false,
}) {
  const panel = useRef(null)
  // Refs para que el efecto dependa sólo de `open` (onClose suele ser inline
  // y re-ejecutar el efecto en cada render le robaría el foco a los inputs).
  const onCloseRef = useRef(onClose)
  const bloqueadoRef = useRef(bloqueado)
  onCloseRef.current = onClose
  bloqueadoRef.current = bloqueado

  useEffect(() => {
    if (!open) return undefined
    const previo = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape' && !bloqueadoRef.current) onCloseRef.current?.()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previo?.focus?.()
    }
  }, [open])

  if (!open) return null

  const esDrawer = variant === 'drawer'

  return createPortal(
    <div
      className={`ui-backdrop${esDrawer ? ' ui-backdrop--drawer' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !bloqueado) onClose?.()
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-modal-title"
        className={esDrawer ? 'ui-drawer' : `ui-dialog ui-dialog--${size}`}
      >
        <div className="ui-dialog__head">
          <div style={{ minWidth: 0 }}>
            <h2 id="ui-modal-title" className="ui-dialog__title">{title}</h2>
            {description && <p className="ui-help" style={{ marginTop: 4 }}>{description}</p>}
          </div>
          <button
            type="button"
            className="ui-btn ui-btn--quiet ui-btn--sm"
            onClick={onClose}
            disabled={bloqueado}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
        <div className="ui-dialog__body">{children}</div>
        {footer && <div className="ui-dialog__foot ui-dialog__foot--sticky">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
