/**
 * Bienvenida.jsx - Portal de Acceso Inmediato a Guardias de EmergenciaYA.
 *
 * Épica 2 (AE3-07) rediseñada con altos estándares de diseño clínico:
 *   - Acceso inmediato en 1 toque (modo invitado prioritario sin barreras)
 *   - Google Identity Services SDK con fallback claro y reactivo
 *   - Líneas de auxilio telefónico directo (107, 911, 100) en el propio portal
 *   - Carga instantánea, feedback táctil y prevención de doble submit
 */

import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

export default function Bienvenida() {
  const navigate = useNavigate()
  const { loginGoogle, loginInvitado } = useAuth()

  const [cargandoGoogle, setCargandoGoogle] = useState(false)
  const [cargandoInvitado, setCargandoInvitado] = useState(false)
  const [toast, setToast] = useState(null)

  const mostrarToast = useCallback((mensaje, tipo = 'error') => {
    setToast({ mensaje, tipo })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const irAlMapa = useCallback(() => {
    navigate('/mapa', { replace: true })
  }, [navigate])

  const onGoogleCredential = useCallback(
    async (response) => {
      setCargandoGoogle(true)
      try {
        const perfil = await loginGoogle(response.credential)
        const rolDestino = perfil?.rol
        if (rolDestino === 'MEDICO') {
          navigate('/portal-medico', { replace: true })
        } else if (rolDestino === 'OPERADOR_CENTRO') {
          navigate('/panel-centro', { replace: true })
        } else {
          irAlMapa()
        }
      } catch (err) {
        mostrarToast('Error al conectar con Google. Podés entrar como invitado sin esperas.')
      } finally {
        setCargandoGoogle(false)
      }
    },
    [irAlMapa, loginGoogle, navigate, mostrarToast]
  )

  const inicializarGoogle = useCallback(() => {
    if (!GOOGLE_CLIENT_ID) return

    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: onGoogleCredential,
        ux_mode: 'popup',
        auto_select: false,
      })
      const container = document.getElementById('google-btn-container')
      if (container) {
        window.google.accounts.id.renderButton(container, {
          type: 'standard',
          shape: 'pill',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          locale: 'es_AR',
          width: 320,
        })
      }
    } catch (err) {
      console.error('[EmergenciaYA] Error al inicializar Google Identity Services:', err)
    }
  }, [onGoogleCredential])

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return

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
    if (cargandoInvitado) return
    setCargandoInvitado(true)
    try {
      await loginInvitado()
      irAlMapa()
    } catch (err) {
      mostrarToast('Ingresando en modo desconectado...')
      irAlMapa()
    } finally {
      setCargandoInvitado(false)
    }
  }

  const cargando = cargandoGoogle || cargandoInvitado

  return (
    <div className="login-viewport">
      {toast && (
        <div className={`login-toast login-toast--${toast.tipo}`} role="alert" aria-live="assertive">
          <span>{toast.mensaje}</span>
        </div>
      )}

      {/* Barra superior con navegación de retorno */}
      <header className="login-topbar">
        <Link to="/" className="login-back-link" aria-label="Volver a la portada de EmergenciaYA">
          <span aria-hidden="true">←</span>
          <span>Volver al inicio</span>
        </Link>
        <div className="login-topbar-status">
          <span className="live-status-dot" aria-hidden="true" />
          <span>Guardias disponibles 24h</span>
        </div>
      </header>

      <main className="login-container">
        <div className="login-card">
          {/* Header con identidad visual de guardia médica */}
          <div className="login-header">
            <div className="login-emblem-wrap">
              <span className="login-emblem-icon" aria-hidden="true">🚨</span>
            </div>
            <span className="login-badge-pill">Red de Salud Posadas</span>
            <h1 className="login-title">Ingreso Inmediato a Guardia</h1>
            <p className="login-subtitle">
              En una urgencia médica cada segundo cuenta. Entrá en 1 toque sin completar formularios.
            </p>
          </div>

          {/* Bloque de Acciones Principales */}
          <div className="login-actions">
            {/* Botón Principal: Acceso Instantáneo Invitado */}
            <button
              id="btn-invitado"
              type="button"
              className="btn btn--login-guest"
              onClick={handleInvitado}
              disabled={cargando}
              aria-busy={cargandoInvitado}
              aria-label="Acceder inmediatamente como invitado"
            >
              {cargandoInvitado ? (
                <>
                  <span className="action-spinner" aria-hidden="true" />
                  <span>Conectando con guardia...</span>
                </>
              ) : (
                <>
                  <span className="btn-bolt-icon" aria-hidden="true">⚡</span>
                  <div className="btn-guest-text">
                    <strong>Acceder ahora sin registro</strong>
                    <small>Modo invitado instantáneo</small>
                  </div>
                </>
              )}
            </button>

            {/* Separador estilizado */}
            <div className="login-divider" aria-hidden="true">
              <span>o identificarte con tu cuenta</span>
            </div>

            {/* Contenedor Google OAuth */}
            <div className="google-section">
              <div
                id="google-btn-container"
                aria-label="Iniciar sesión con Google"
                className={`google-slot ${cargandoGoogle ? 'google-slot--loading' : ''}`}
              />
              {!GOOGLE_CLIENT_ID && (
                <button
                  type="button"
                  className="btn btn--google-styled"
                  onClick={handleInvitado}
                  disabled={cargando}
                  aria-label="Continuar con acceso rápido"
                >
                  <svg className="google-svg-logo" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Entrar con Google</span>
                </button>
              )}
            </div>
          </div>

          {/* Garantías de seguridad para el paciente */}
          <div className="login-security-notice">
            <span className="security-icon" aria-hidden="true">🔒</span>
            <span>Tus datos de ubicación se usan únicamente para calcular el centro más cercano.</span>
          </div>

          {/* Líneas Telefónicas Directas en Caso de Emergencia Extrema */}
          <section className="login-direct-phones" aria-label="Llamadas directas de emergencia">
            <p className="direct-phones-title">Líneas de llamada gratuita inmediata:</p>
            <div className="direct-phones-grid">
              <a href="tel:107" className="direct-phone-chip direct-phone-chip--same" title="Llamar al 107">
                <span className="phone-num">107</span>
                <span className="phone-tag">SAME</span>
              </a>
              <a href="tel:911" className="direct-phone-chip direct-phone-chip--policia" title="Llamar al 911">
                <span className="phone-num">911</span>
                <span className="phone-tag">Policía</span>
              </a>
              <a href="tel:100" className="direct-phone-chip direct-phone-chip--bomberos" title="Llamar al 100">
                <span className="phone-num">100</span>
                <span className="phone-tag">Bomberos</span>
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
