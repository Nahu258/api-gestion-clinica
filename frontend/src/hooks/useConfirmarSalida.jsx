/**
 * useConfirmarSalida - Pide confirmación al salir de un formulario con cambios sin guardar.
 *
 *   const { dialogo, salir } = useConfirmarSalida(hayCambios)
 *   ...
 *   <button onClick={() => salir('/admin/instituciones')}>Cancelar</button>
 *   {dialogo}
 *
 * Cubre:
 *   - recarga / cierre de pestaña (beforeunload),
 *   - clicks en links internos de la app (barra, navegación lateral, migas),
 *   - navegación programática que pase por `salir(destino)`.
 *
 * La app usa <BrowserRouter> (sin data router), por eso no hay useBlocker:
 * los links se interceptan en fase de captura a nivel documento.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'

export default function useConfirmarSalida(hayCambios) {
  const navigate = useNavigate()
  const [destino, setDestino] = useState(null)
  const sucio = useRef(hayCambios)
  sucio.current = hayCambios

  useEffect(() => {
    const antesDeSalir = (e) => {
      if (!sucio.current) return
      e.preventDefault()
      e.returnValue = ''
    }

    const alClickear = (e) => {
      if (!sucio.current || e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target.closest?.('a[href]')
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      const ruta = url.pathname + url.search + url.hash
      if (ruta === window.location.pathname + window.location.search + window.location.hash) return
      e.preventDefault()
      e.stopPropagation()
      setDestino(ruta)
    }

    window.addEventListener('beforeunload', antesDeSalir)
    document.addEventListener('click', alClickear, true)
    return () => {
      window.removeEventListener('beforeunload', antesDeSalir)
      document.removeEventListener('click', alClickear, true)
    }
  }, [])

  const salir = useCallback(
    (ruta) => {
      if (sucio.current) setDestino(ruta)
      else navigate(ruta)
    },
    [navigate]
  )

  /** Navega sin preguntar (ej. después de guardar con éxito). */
  const salirSinPreguntar = useCallback(
    (ruta, opciones) => {
      sucio.current = false
      navigate(ruta, opciones)
    },
    [navigate]
  )

  const dialogo = (
    <ConfirmDialog
      open={destino !== null}
      title="Descartar cambios"
      confirmLabel="Salir sin guardar"
      cancelLabel="Seguir editando"
      onCancel={() => setDestino(null)}
      onConfirm={() => {
        const ruta = destino
        sucio.current = false
        setDestino(null)
        navigate(ruta)
      }}
    >
      <p>Hay cambios que todavía no guardaste. Si salís ahora se pierden.</p>
    </ConfirmDialog>
  )

  return { dialogo, salir, salirSinPreguntar }
}
