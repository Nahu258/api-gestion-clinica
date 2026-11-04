/**
 * Toast - Avisos breves apilados abajo a la derecha.
 *
 *   const toast = useToast()
 *   toast.ok('Institución creada')
 *   toast.error('No se pudo guardar')
 *
 * El proveedor vive en App.jsx, así un toast sobrevive a la navegación
 * (ej. alta → redirección al detalle).
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react'

const ToastContext = createContext(null)

const DURACION_MS = 4500

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const contador = useRef(0)

  const cerrar = useCallback((id) => setToasts((lista) => lista.filter((t) => t.id !== id)), [])

  const mostrar = useCallback(
    (mensaje, tono = 'ok') => {
      contador.current += 1
      const id = contador.current
      setToasts((lista) => [...lista.slice(-2), { id, mensaje, tono }])
      setTimeout(() => cerrar(id), DURACION_MS)
    },
    [cerrar]
  )

  const api = useMemo(
    () => ({
      ok: (mensaje) => mostrar(mensaje, 'ok'),
      error: (mensaje) => mostrar(mensaje, 'error'),
    }),
    [mostrar]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ui-toast ui-toast--stacked${t.tono === 'error' ? ' ui-toast--error' : ''}`}>
            {t.tono === 'error' ? <WarningCircle size={18} /> : <CheckCircle size={18} />}
            <span>{t.mensaje}</span>
            <button type="button" className="ui-toast__close" onClick={() => cerrar(t.id)} aria-label="Cerrar aviso">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de un ToastProvider')
  return ctx
}
