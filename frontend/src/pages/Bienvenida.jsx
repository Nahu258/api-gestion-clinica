/**
 * Bienvenida.jsx - Ingreso a EmergenciaYA.
 *
 * - Acceso sin cuenta (modo invitado) como acción principal: en una urgencia no se pide registro.
 * - Email y contraseña para personal del centro, médicos y pacientes registrados.
 * - El login con Google queda apagado con GOOGLE_HABILITADO hasta nuevo aviso.
 */

import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Phone, WarningCircle } from '@phosphor-icons/react'
import Logo from '../components/Logo.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { rutaInicio } from '../utils/roles.js'

// Deshabilitado temporalmente: el botón no se renderiza ni se carga el SDK de Google.
const GOOGLE_HABILITADO = false
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

const LINEAS = [
  { numero: '107', nombre: 'SAME' },
  { numero: '911', nombre: 'Policía' },
  { numero: '100', nombre: 'Bomberos' },
]

export default function Bienvenida() {
  const navigate = useNavigate()
  const location = useLocation()
  const { loginGoogle, loginPassword, loginInvitado } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [cargandoInvitado, setCargandoInvitado] = useState(false)

  const irSegunRol = useCallback(
    (rol) => {
      const desde = location.state?.from?.pathname
      navigate(desde && desde !== '/ingreso' ? desde : rutaInicio(rol), { replace: true })
    },
    [location.state, navigate]
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (enviando) return
    if (!email.trim() || !password) {
      setError('Completá el email y la contraseña.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const perfil = await loginPassword(email.trim(), password)
      irSegunRol(perfil?.rol)
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.')
    } finally {
      setEnviando(false)
    }
  }

  const handleInvitado = async () => {
    if (cargandoInvitado) return
    setCargandoInvitado(true)
    try {
      await loginInvitado()
    } finally {
      setCargandoInvitado(false)
      navigate('/mapa', { replace: true })
    }
  }

  // Google Identity Services: sólo se inicializa si se vuelve a habilitar
  useEffect(() => {
    if (!GOOGLE_HABILITADO || !GOOGLE_CLIENT_ID || !window.google?.accounts?.id) return
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const perfil = await loginGoogle(response.credential)
          irSegunRol(perfil?.rol)
        } catch {
          setError('No se pudo ingresar con Google.')
        }
      },
      ux_mode: 'popup',
    })
    const contenedor = document.getElementById('google-btn-container')
    if (contenedor) {
      window.google.accounts.id.renderButton(contenedor, { theme: 'outline', size: 'large', locale: 'es_AR', width: 360 })
    }
  }, [irSegunRol, loginGoogle])

  return (
    <div className="ingreso">
      <div className="ingreso__panel">
        <header className="ingreso__top">
          <Link to="/" className="ui-brand">
            <Logo />
          </Link>
          <Link to="/" className="ui-btn ui-btn--quiet ui-btn--sm">
            <ArrowLeft size={16} />
            Inicio
          </Link>
        </header>

        <main className="ingreso__main">
          <h1 className="ingreso__title">Ingresar</h1>
          <p className="ingreso__lead">Si es una emergencia, no necesitás cuenta.</p>

          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--lg ui-btn--block"
            onClick={handleInvitado}
            disabled={cargandoInvitado}
          >
            {cargandoInvitado ? 'Abriendo el mapa...' : 'Continuar sin cuenta'}
            {!cargandoInvitado && <ArrowRight size={18} />}
          </button>
          <p className="ui-help" style={{ marginTop: 8 }}>
            Buscás la guardia más cercana y avisás que vas en camino.
          </p>

          <div className="ingreso__divider"><span>o con tu cuenta</span></div>

          <form className="ui-form" onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="ui-alert" role="alert" style={{ marginBottom: 0 }}>
                <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            <div className="ui-field">
              <label className="ui-label" htmlFor="email">Email</label>
              <input
                id="email"
                className="ui-input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@boratti.com.ar"
              />
            </div>

            <div className="ui-field">
              <label className="ui-label" htmlFor="password">Contraseña</label>
              <input
                id="password"
                className="ui-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="ui-btn ui-btn--dark ui-btn--lg ui-btn--block" disabled={enviando}>
              {enviando ? 'Verificando...' : 'Iniciar sesión'}
            </button>

            {GOOGLE_HABILITADO ? (
              <div id="google-btn-container" />
            ) : (
              <p className="ui-help">El ingreso con Google está deshabilitado temporalmente.</p>
            )}
          </form>

          <section className="ingreso__lineas" aria-label="Líneas de emergencia">
            <p className="ui-help">Riesgo de vida: llamá primero.</p>
            <div className="ingreso__lineas-row">
              {LINEAS.map((l) => (
                <a key={l.numero} href={`tel:${l.numero}`} className="ingreso__linea">
                  <Phone size={16} />
                  <span className="ui-mono">{l.numero}</span>
                  <span className="ui-muted">{l.nombre}</span>
                </a>
              ))}
            </div>
          </section>
        </main>
      </div>

      <div className="ingreso__media" aria-hidden="true">
        <img src="/triage-consulta.jpg" alt="" />
      </div>
    </div>
  )
}
