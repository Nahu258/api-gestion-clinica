/**
 * Bienvenida.jsx — Pantalla de bienvenida de EmergenciaYA.
 *
 * Épica 2, issue #16 (AE3-07).
 *
 * Criterios de aceptación cubiertos:
 *   ✓ Carga en < 1s (no hace llamadas bloqueantes al backend en el mount)
 *   ✓ Botón de Google usa Google Identity Services SDK (no el deprecado gapi)
 *   ✓ Si Google falla → muestra toast de error no bloqueante
 *   ✓ "no necesitás registrarte" visible sin scroll en 360px
 *   ✓ Redirige al mapa después del login exitoso
 *   ✓ Spinner en el botón mientras se procesa (evita doble click)
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginConGoogle, loginComoInvitado } from '../api/auth.js'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

export default function Bienvenida() {
  const navigate = useNavigate()

  const [cargandoGoogle,   setCargandoGoogle]   = useState(false)
  const [cargandoInvitado, setCargandoInvitado] = useState(false)
  const [toast,            setToast]            = useState(null)

  const mostrarToast = useCallback((mensaje, tipo = 'error') => {
    setToast({ mensaje, tipo })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const irAlMapa = useCallback(() => {
    navigate('/mapa', { replace: true })
  }, [navigate])

  const onGoogleCredential = useCallback(async (response) => {
    setCargandoGoogle(true)
    try {
      await loginConGoogle(response.credential)
      irAlMapa()
    } catch (err) {
      mostrarToast('Error al conectar con Google. Intentá de nuevo.')
    } finally {
      setCargandoGoogle(false)
    }
  }, [irAlMapa, mostrarToast])

  const inicializarGoogle = useCallback(() => {
    if (!GOOGLE_CLIENT_ID) {
      console.warn('[EmergenciaYA] VITE_GOOGLE_CLIENT_ID no está configurado.')
      return
    }
    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: onGoogleCredential,
        ux_mode: 'popup',
        auto_select: false,
      })
      window.google.accounts.id.renderButton(
        document.getElementById('google-btn-container'),
        {
          type: 'standard',
          shape: 'pill',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          locale: 'es_AR',
          width: 280,
        },
      )
    } catch (err) {
      console.error('[EmergenciaYA] Error al inicializar Google Identity Services:', err)
    }
  }, [onGoogleCredential])

  useEffect(() => {
    if (window.google?.accounts?.id) {
      inicializarGoogle()
    } else {
      const script = document.querySelector('script[src*="accounts.google.com/gsi/client"]')
      if (script) {
        script.addEventListener('load', inicializarGoogle)
        return () => script.removeEventListener('load', inicializarGoogle)
      }
    }
  }, [inicializarGoogle])

  const handleInvitado = async () => {
    setCargandoInvitado(true)
    try {
      await loginComoInvitado()
      irAlMapa()
    } catch (err) {
      mostrarToast('No se pudo crear la sesión. Verificá tu conexión e intentá de nuevo.')
    } finally {
      setCargandoInvitado(false)
    }
  }

  const cargando = cargandoGoogle || cargandoInvitado

  return (
    <div className="bienvenida-container">
      {toast && (
        <div className={`toast toast--${toast.tipo}`} role="alert" aria-live="assertive">
          {toast.mensaje}
        </div>
      )}

      <main className="bienvenida-card">
        <div className="bienvenida-header">
          <span className="bienvenida-emoji" aria-hidden="true">🚨</span>
          <h1 className="bienvenida-titulo">EmergenciaYA</h1>
          <p className="bienvenida-subtitulo">Encontrá ayuda cerca tuyo</p>
        </div>

        <div className="bienvenida-acciones">
          <div className="google-btn-wrapper">
            <div
              id="google-btn-container"
              aria-label="Iniciar sesión con Google"
              className={cargandoGoogle ? 'google-btn-loading' : ''}
            />
            {!GOOGLE_CLIENT_ID && (
              <button
                className="btn btn--google btn--disabled"
                disabled
                aria-label="Entrar con Google (no configurado)"
              >
                <span className="btn-icon" aria-hidden="true">G</span>
                Entrar con Google
                <span className="btn-badge">Config. pendiente</span>
              </button>
            )}
          </div>

          <div className="bienvenida-separador" aria-hidden="true">
            <span>o</span>
          </div>

          <button
            id="btn-invitado"
            className="btn btn--invitado"
            onClick={handleInvitado}
            disabled={cargando}
            aria-busy={cargandoInvitado}
            aria-label="Continuar sin cuenta"
          >
            {cargandoInvitado ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Creando sesión...
              </>
            ) : (
              'Continuar sin cuenta'
            )}
          </button>

          <p className="bienvenida-aviso">
            no necesitás registrarte
          </p>
        </div>
      </main>
    </div>
  )
}
