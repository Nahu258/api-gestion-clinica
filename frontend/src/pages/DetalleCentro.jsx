/**
 * DetalleCentro.jsx - Ficha Médica y Solicitud de Atención Inmediata.
 *
 * Épica 3 (AE4-09, issue #18) rediseñada para situaciones críticas de salud:
 *   - Ficha del centro con badge de guardia 24h, distancia y tiempo estimado de viaje.
 *   - Enlace directo a navegación GPS (Google Maps / Waze).
 *   - Botón de llamada directa de 1 toque con el número del hospital.
 *   - Botón heroico "🚨 Voy en camino - Avisar a la guardia" visible sin scroll.
 *   - Modal de solicitud rápida con chips de síntomas frecuentes (1 toque para emergencias).
 *   - Validación clara, prevención de doble envío y redirección a seguimiento.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'

import { obtenerCentroPorId } from '../api/centros.js'
import { crearSolicitud } from '../api/atencion.js'
import { getAuthHeaders } from '../api/auth.js'

const TIPOS_EMOJI = {
  hospital: '🏥',
  same:     '🚑',
  upa:      '🩺',
  bomberos: '🚒',
  policia:  '🚓',
  otro:     '📍',
}

const SINTOMAS_RAPIDOS = [
  'Accidente / Traumatismo',
  'Dificultad respiratoria',
  'Dolor agudo en el pecho',
  'Fiebre alta / Pediatría',
  'Hemorragia o corte',
  'Desmayo / Pérdida de conocimiento',
]

export default function DetalleCentro() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  // Datos previos pasados por la navegación
  const centroInicial = location.state?.centro || null
  const ubicacionUsuario = location.state?.ubicacionUsuario || null

  const [centro, setCentro] = useState(centroInicial)
  const [cargando, setCargando] = useState(!centroInicial)
  const [errorCarga, setErrorCarga] = useState(null)

  // Modal de solicitud
  const [modalAbierto, setModalAbierto] = useState(false)
  const [modoSeleccionado, setModoSeleccionado] = useState('aviso') // 'aviso' | 'solicitud'
  const [nombreInvitado, setNombreInvitado] = useState('')
  const [telefonoContacto, setTelefonoContacto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [errorValidacion, setErrorValidacion] = useState('')

  // Estado de envío
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState(null)

  const headers = getAuthHeaders()
  const esInvitado = !!headers['X-Guest-Token']

  // Cargar centro si se entra directo por URL o recarga
  useEffect(() => {
    if (!centro && id) {
      setCargando(true)
      setErrorCarga(null)
      obtenerCentroPorId(id)
        .then((data) => {
          setCentro(data)
          setCargando(false)
        })
        .catch((err) => {
          setErrorCarga(err.message || 'No se pudo cargar la información del centro.')
          setCargando(false)
        })
    }
  }, [centro, id])

  const abrirModal = (modo) => {
    setModoSeleccionado(modo)
    setErrorValidacion('')
    setErrorEnvio(null)
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    if (enviando) return
    setModalAbierto(false)
    setErrorValidacion('')
    setErrorEnvio(null)
  }

  const seleccionarSintoma = (sintoma) => {
    if (motivo) {
      if (!motivo.includes(sintoma)) {
        setMotivo(`${motivo}, ${sintoma}`.slice(0, 200))
      }
    } else {
      setMotivo(sintoma)
    }
  }

  const handleEnviarSolicitud = async (e) => {
    e.preventDefault()
    setErrorValidacion('')
    setErrorEnvio(null)

    if (esInvitado && !nombreInvitado.trim()) {
      setErrorValidacion('Por favor ingresá tu nombre para que los médicos te identifiquen.')
      return
    }

    if (motivo.length > 200) {
      setErrorValidacion('El motivo no puede superar los 200 caracteres.')
      return
    }

    setEnviando(true)

    const payload = {
      centro_id: centro.id,
      modo: modoSeleccionado,
      motivo: motivo.trim() || undefined,
      nombre_invitado: esInvitado ? nombreInvitado.trim() : undefined,
      telefono_invitado: telefonoContacto.trim() || undefined,
      lat_usuario: ubicacionUsuario?.lat,
      lon_usuario: ubicacionUsuario?.lon,
    }

    try {
      const solicitudCreada = await crearSolicitud(payload)
      setEnviando(false)
      setModalAbierto(false)
      navigate(`/seguimiento/${solicitudCreada.id}`, {
        state: { solicitud: solicitudCreada, centro },
      })
    } catch (err) {
      setEnviando(false)
      setErrorEnvio(err.message || 'Error al procesar el aviso. Por favor reintentá.')
    }
  }

  if (cargando) {
    return (
      <div className="detalle-screen-layout">
        <header className="detalle-nav-bar">
          <Link to="/mapa" className="detalle-back-btn">
            ← Volver al mapa
          </Link>
        </header>
        <div className="detalle-loading-box">
          <span className="action-spinner action-spinner--red" aria-hidden="true" />
          <p>Conectando con la guardia del centro médico...</p>
        </div>
      </div>
    )
  }

  if (errorCarga || !centro) {
    return (
      <div className="detalle-screen-layout">
        <header className="detalle-nav-bar">
          <Link to="/mapa" className="detalle-back-btn">
            ← Volver al mapa
          </Link>
        </header>
        <div className="detalle-error-box">
          <p>⚠️ {errorCarga || 'Centro médico no encontrado'}</p>
          <Link to="/mapa" className="btn btn--hero-primary btn--sm">
            Volver a la lista de centros
          </Link>
        </div>
      </div>
    )
  }

  const iconoTipo = TIPOS_EMOJI[centro.tipo] || '📍'
  const minutosEstimados =
    centro.distancia_km != null
      ? Math.max(3, Math.round(centro.distancia_km * 2.2))
      : null

  const urlGoogleMaps = `https://www.google.com/maps/dir/?api=1&destination=${centro.latitud},${centro.longitud}`

  return (
    <div className="detalle-screen-layout">
      {/* ── Topbar de navegación ── */}
      <header className="detalle-nav-bar" role="banner">
        <div className="detalle-nav-inner">
          <Link to="/mapa" className="detalle-back-btn" aria-label="Volver al mapa">
            <span aria-hidden="true">←</span>
            <span>Volver al mapa</span>
          </Link>
          <div className="detalle-guardia-indicator">
            <span className="pulse-green-dot" aria-hidden="true" />
            <span>Guardia activa en Posadas</span>
          </div>
        </div>
      </header>

      {/* ── Contenido Principal ── */}
      <main className="detalle-main-content">
        <div className="detalle-content-wrapper">
          {/* Card Principal del Centro Médico */}
          <article className="medical-profile-card">
            <div className="profile-badge-row">
              <span className="profile-icon-large" aria-hidden="true">
                {iconoTipo}
              </span>
              <div className="profile-badges-wrap">
                <span className="badge badge--tipo">
                  {centro.tipo_legible || 'Centro de Salud'}
                </span>
                <span className={`badge ${centro.atiende_24h ? 'badge--green' : 'badge--gray'}`}>
                  {centro.atiende_24h ? '⏰ Abierto 24 Horas' : 'Horario limitado'}
                </span>
              </div>
            </div>

            <h1 className="profile-title">{centro.nombre}</h1>

            {/* Métrica de distancia y tiempo */}
            <div className="profile-metrics-strip">
              {centro.distancia_km != null && (
                <div className="metric-pill">
                  <span className="metric-icon" aria-hidden="true">📍</span>
                  <span className="metric-data">{centro.distancia_km} km de distancia</span>
                </div>
              )}
              {minutosEstimados != null && (
                <div className="metric-pill metric-pill--time">
                  <span className="metric-icon" aria-hidden="true">🚗</span>
                  <span className="metric-data">~{minutosEstimados} min en vehículo</span>
                </div>
              )}
            </div>

            {/* Datos de contacto y ubicación */}
            <div className="profile-details-list">
              <div className="detail-row">
                <span className="detail-row-icon" aria-hidden="true">📍</span>
                <div className="detail-row-text">
                  <strong>Dirección:</strong>
                  <span>{centro.direccion}, {centro.ciudad || 'Posadas'}</span>
                </div>
              </div>

              {centro.telefono && (
                <div className="detail-row">
                  <span className="detail-row-icon" aria-hidden="true">📞</span>
                  <div className="detail-row-text">
                    <strong>Teléfono de guardia:</strong>
                    <a href={`tel:${centro.telefono}`} className="profile-phone-link">
                      {centro.telefono}
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Botón de cómo llegar con GPS */}
            <a
              href={urlGoogleMaps}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--maps-direct"
              title="Abrir indicaciones en Google Maps"
            >
              <span>🧭 Cómo llegar (Abrir GPS)</span>
            </a>
          </article>

          {/* ── Botones de Acción de Emergencia Inmediata ── */}
          <section className="emergency-actions-hub" aria-label="Acciones prioritarias de guardia">
            <button
              id="btn-voy-en-camino"
              type="button"
              className="btn btn--emergency-hero"
              onClick={() => abrirModal('aviso')}
            >
              <div className="emergency-btn-inner">
                <span className="emergency-btn-icon" aria-hidden="true">🚨</span>
                <div className="emergency-btn-copy">
                  <strong>Voy en camino - Avisar a la guardia</strong>
                  <small>Alerta inmediata al equipo de recepción médica</small>
                </div>
              </div>
            </button>

            <button
              id="btn-solicitar-urgente"
              type="button"
              className="btn btn--emergency-secondary"
              onClick={() => abrirModal('solicitud')}
            >
              <span>📅 Solicitar atención médica en el centro</span>
            </button>

            {centro.telefono && (
              <a href={`tel:${centro.telefono}`} className="btn btn--call-center">
                <span>📞 Llamar al centro médico ({centro.telefono})</span>
              </a>
            )}
          </section>
        </div>
      </main>

      {/* ── Modal Bottom Sheet de Solicitud Rápida ── */}
      {modalAbierto && (
        <div
          className="emergency-modal-backdrop"
          onClick={cerrarModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-emergency-title"
        >
          <div className="emergency-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top-bar">
              <div className="modal-header-text">
                <h3 id="modal-emergency-title">
                  {modoSeleccionado === 'aviso'
                    ? '🚨 Avisar que voy en camino'
                    : '📅 Solicitar atención médica'}
                </h3>
                <p className="modal-target-center">Destino: <strong>{centro.nombre}</strong></p>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={cerrarModal}
                disabled={enviando}
                aria-label="Cerrar ventana"
              >
                ✕
              </button>
            </div>

            {errorEnvio && (
              <div className="modal-error-alert" role="alert">
                <span>⚠️ {errorEnvio}</span>
              </div>
            )}

            {errorValidacion && (
              <div className="modal-error-alert" role="alert">
                <span>⚠️ {errorValidacion}</span>
              </div>
            )}

            <form onSubmit={handleEnviarSolicitud} className="modal-form-body">
              {/* Selector de Síntomas Rápidos (1 toque) */}
              <div className="form-field-group">
                <label className="form-field-label">
                  Motivo de la urgencia (seleccioná o escribí):
                </label>
                <div className="quick-symptoms-chips" role="group" aria-label="Síntomas comunes">
                  {SINTOMAS_RAPIDOS.map((sintoma) => (
                    <button
                      key={sintoma}
                      type="button"
                      className={`symptom-chip ${motivo.includes(sintoma) ? 'symptom-chip--active' : ''}`}
                      onClick={() => seleccionarSintoma(sintoma)}
                    >
                      + {sintoma}
                    </button>
                  ))}
                </div>

                <textarea
                  id="input-motivo-consulta"
                  className="form-textarea-custom"
                  placeholder="Detalle breve del cuadro o síntomas..."
                  maxLength={200}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={enviando}
                />
                <span className="char-count-text">
                  {motivo.length} / 200 caracteres
                </span>
              </div>

              {/* Nombre si es invitado */}
              {esInvitado && (
                <div className="form-field-group">
                  <label htmlFor="input-nombre-invitado" className="form-field-label">
                    Tu nombre y apellido <span style={{ color: '#e63946' }}>*</span>
                  </label>
                  <input
                    id="input-nombre-invitado"
                    type="text"
                    className="form-input-custom"
                    placeholder="Ej. Juan Gómez"
                    value={nombreInvitado}
                    onChange={(e) => setNombreInvitado(e.target.value)}
                    disabled={enviando}
                    required
                  />
                  <span className="form-field-helper">
                    Necesario para identificarte al ingresar por la guardia.
                  </span>
                </div>
              )}

              {/* Teléfono opcional */}
              <div className="form-field-group">
                <label htmlFor="input-telefono-contacto" className="form-field-label">
                  Teléfono de contacto (opcional)
                </label>
                <input
                  id="input-telefono-contacto"
                  type="tel"
                  className="form-input-custom"
                  placeholder="Ej. 376 412-3456"
                  value={telefonoContacto}
                  onChange={(e) => setTelefonoContacto(e.target.value)}
                  disabled={enviando}
                />
              </div>

              {/* Acciones del Modal */}
              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="btn btn--modal-cancel"
                  onClick={cerrarModal}
                  disabled={enviando}
                >
                  Cancelar
                </button>

                <button
                  id="btn-confirmar-solicitud"
                  type="submit"
                  className="btn btn--modal-confirm"
                  disabled={enviando}
                >
                  {enviando ? (
                    <>
                      <span className="action-spinner" aria-hidden="true" />
                      <span>Transmitiendo a guardia...</span>
                    </>
                  ) : (
                    <span>Confirmar y enviar aviso</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
