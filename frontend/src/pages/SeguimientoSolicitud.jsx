/**
 * SeguimientoSolicitud.jsx - Centro de Seguimiento y Despacho de Guardia en Vivo.
 *
 * Épica 4 (AE4-10, issue #19) rediseñado bajo los más altos estándares visuales:
 *   - Polling cada 10s con indicador de latido activo en tiempo real.
 *   - Transición a 'aceptado': animación de confirmación médica + audio Web Audio API + vibración háptica.
 *   - Stepper de progreso clínico con barra continua e íconos de estado.
 *   - Instrucciones claras para el paciente al momento de ingresar a la guardia.
 *   - Enlace directo a Google Maps para navegación GPS paso a paso.
 *   - Botón directo de llamado telefónico al centro médico.
 */

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'

import {
  obtenerSolicitud,
  cancelarSolicitud,
  KEY_SOLICITUD_ID,
  obtenerUltimaSolicitudGuardada,
} from '../api/atencion.js'

// Web Audio API sintético para confirmación sonora
function reproducirSonidoAceptado() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()

    const ahora = ctx.currentTime
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gainNode = ctx.createGain()

    osc1.type = 'sine'
    osc2.type = 'triangle'

    osc1.frequency.setValueAtTime(523.25, ahora)
    osc1.frequency.exponentialRampToValueAtTime(783.99, ahora + 0.15)

    osc2.frequency.setValueAtTime(659.25, ahora + 0.05)
    osc2.frequency.exponentialRampToValueAtTime(1046.5, ahora + 0.2)

    gainNode.gain.setValueAtTime(0.25, ahora)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ahora + 0.45)

    osc1.connect(gainNode)
    osc2.connect(gainNode)
    gainNode.connect(ctx.destination)

    osc1.start(ahora)
    osc2.start(ahora + 0.05)
    osc1.stop(ahora + 0.45)
    osc2.stop(ahora + 0.45)
  } catch {
    // Si el navegador bloquea audio sin interacción, ignorar silenciosamente
  }
}

function vibrarDispositivo() {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([100, 50, 150])
    } catch {
      // Ignorar fallos de vibración
    }
  }
}

const ESTADOS = {
  PENDIENTE:   'pendiente',
  ACEPTADO:    'aceptado',
  EN_ATENCION: 'en_atencion',
  ATENDIDO:    'atendido',
  CANCELADO:   'cancelado',
}

const PASOS_STEPPER = [
  { key: ESTADOS.PENDIENTE,   label: 'Aviso enviado',       icon: '📨' },
  { key: ESTADOS.ACEPTADO,    label: 'Guardia alertada',   icon: '🩺' },
  { key: ESTADOS.EN_ATENCION, label: 'En triage/atención', icon: '🏥' },
  { key: ESTADOS.ATENDIDO,    label: 'Atención completada',icon: '✅' },
]

export default function SeguimientoSolicitud() {
  const { id: paramId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [solicitudId, setSolicitudId] = useState(() => {
    if (paramId) return paramId
    if (location.state?.solicitud?.id) return String(location.state.solicitud.id)
    return sessionStorage.getItem(KEY_SOLICITUD_ID) || null
  })

  const [solicitud, setSolicitud] = useState(location.state?.solicitud || null)
  const [cargando, setCargando] = useState(!solicitud)
  const [error, setError] = useState(null)
  const [cancelando, setCancelando] = useState(false)
  const [mostrarConfirmacionCancelar, setMostrarConfirmacionCancelar] = useState(false)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(new Date())

  const estadoAnteriorRef = useRef(solicitud?.estado || null)
  const pollingIntervalRef = useRef(null)

  useEffect(() => {
    if (solicitudId) {
      sessionStorage.setItem(KEY_SOLICITUD_ID, String(solicitudId))
    }
  }, [solicitudId])

  useEffect(() => {
    if (!solicitudId) {
      const guardadoId = sessionStorage.getItem(KEY_SOLICITUD_ID)
      if (guardadoId) {
        setSolicitudId(guardadoId)
        return
      }
      const ultima = obtenerUltimaSolicitudGuardada()
      if (ultima) {
        setSolicitud(ultima)
        setSolicitudId(String(ultima.id))
        return
      }
      setError('No se encontró ninguna solicitud activa para realizar el seguimiento.')
      setCargando(false)
      return
    }

    let activo = true

    const consultarEstado = async () => {
      try {
        const data = await obtenerSolicitud(solicitudId)
        if (!activo) return

        setSolicitud(data)
        setCargando(false)
        setUltimaActualizacion(new Date())

        if (
          data.estado === ESTADOS.ACEPTADO &&
          estadoAnteriorRef.current &&
          estadoAnteriorRef.current !== ESTADOS.ACEPTADO
        ) {
          reproducirSonidoAceptado()
          vibrarDispositivo()
        }

        estadoAnteriorRef.current = data.estado

        if (data.estado === ESTADOS.ATENDIDO || data.estado === ESTADOS.CANCELADO) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
        }
      } catch (err) {
        if (!activo) return
        setCargando(false)
      }
    }

    consultarEstado()
    pollingIntervalRef.current = setInterval(consultarEstado, 10000)

    return () => {
      activo = false
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [solicitudId])

  const handleCancelar = async () => {
    if (!solicitudId) return
    setCancelando(true)
    try {
      const data = await cancelarSolicitud(solicitudId)
      setSolicitud(data)
      setCancelando(false)
      setMostrarConfirmacionCancelar(false)
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    } catch (err) {
      setCancelando(false)
      setMostrarConfirmacionCancelar(false)
      alert(err.message || 'No se pudo cancelar la solicitud.')
    }
  }

  const formatearHora = (isoDate) => {
    if (!isoDate) return ''
    try {
      const date = new Date(isoDate)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  if (cargando) {
    return (
      <div className="seguimiento-screen-layout">
        <div className="seguimiento-hub-card">
          <div className="seguimiento-loading-pulse">
            <span className="action-spinner action-spinner--red" aria-hidden="true" />
            <h3>Conectando con la guardia médica...</h3>
            <p>Sincronizando estado en vivo.</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !solicitud) {
    return (
      <div className="seguimiento-screen-layout">
        <div className="seguimiento-hub-card">
          <span style={{ fontSize: '3rem' }}>🔍</span>
          <h2>Sin aviso activo</h2>
          <p style={{ color: '#64748b' }}>
            {error || 'No tenés ningún aviso o solicitud de guardia activa en este momento.'}
          </p>
          <Link to="/mapa" className="btn btn--hero-primary" style={{ marginTop: '1rem' }}>
            Ver mapa de centros
          </Link>
        </div>
      </div>
    )
  }

  const estado = solicitud.estado
  const esAceptado = estado === ESTADOS.ACEPTADO
  const esCancelado = estado === ESTADOS.CANCELADO
  const esAtendido = estado === ESTADOS.ATENDIDO
  const esEnAtencion = estado === ESTADOS.EN_ATENCION

  const indiceActual = PASOS_STEPPER.findIndex((p) => p.key === estado)

  return (
    <div className="seguimiento-screen-layout">
      {/* ── Topbar de navegación ── */}
      <header className="seguimiento-topbar">
        <Link to="/mapa" className="seguimiento-back-link">
          <span aria-hidden="true">←</span>
          <span>Volver al mapa</span>
        </Link>
        <span className="live-heartbeat-pill">
          <span className="pulse-green-dot" aria-hidden="true" />
          <span>Canal de guardia activo</span>
        </span>
      </header>

      <main className="seguimiento-content-container">
        <article className="seguimiento-hub-card">
          {/* ── Header de Estado Dinámico ── */}
          <div className="status-hero-banner">
            <div className={`status-radar-ring ${esAceptado ? 'status-radar-ring--success' : ''}`}>
              <span className="status-radar-icon">
                {esAceptado && '✅'}
                {estado === ESTADOS.PENDIENTE && '⏳'}
                {esEnAtencion && '🩺'}
                {esAtendido && '🎉'}
                {esCancelado && '❌'}
              </span>
            </div>

            <div className="status-hero-text">
              <span className="status-category-pill">
                {esAceptado && 'Guardia Confirmada'}
                {estado === ESTADOS.PENDIENTE && 'Aviso en Transmisión'}
                {esEnAtencion && 'Atención Médica en Curso'}
                {esAtendido && 'Guardia Finalizada'}
                {esCancelado && 'Aviso Cancelado'}
              </span>

              <h1 className="status-headline">
                {esAceptado && '¡El centro médico confirmó tu llegada!'}
                {estado === ESTADOS.PENDIENTE && 'Aviso enviado al centro de salud'}
                {esEnAtencion && 'Atención médica en curso'}
                {esAtendido && 'Atención médica completada'}
                {esCancelado && 'Solicitud cancelada'}
              </h1>

              <h2 className="status-center-title">
                {solicitud.centro_nombre || 'Centro de Emergencia'}
              </h2>

              <p className="status-timestamp">
                Registrado a las {formatearHora(solicitud.creado_en) || 'recientemente'} · Posadas
              </p>
            </div>
          </div>

          {/* ── Stepper de Progreso Clínico ── */}
          {!esCancelado && (
            <div className="clinical-stepper" aria-label="Progreso de atención de emergencia">
              <div className="stepper-track-bar">
                <div
                  className="stepper-progress-fill"
                  style={{
                    width: `${Math.max(0, Math.min(100, (indiceActual / (PASOS_STEPPER.length - 1)) * 100))}%`,
                  }}
                />
              </div>

              <div className="stepper-nodes-row">
                {PASOS_STEPPER.map((paso, idx) => {
                  const completado = indiceActual > idx
                  const activo = indiceActual === idx
                  return (
                    <div
                      key={paso.key}
                      className={`stepper-node ${completado ? 'stepper-node--completed' : ''} ${activo ? 'stepper-node--active' : ''}`}
                    >
                      <div className="node-bubble">
                        {completado ? '✓' : paso.icon}
                      </div>
                      <span className="node-caption">{paso.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Mensaje e Instrucciones Médicas ── */}
          <div className="triage-instruction-card">
            <h3 className="triage-instruction-title">
              <span aria-hidden="true">📋</span>
              <span>Instrucciones de recepción en guardia:</span>
            </h3>

            {estado === ESTADOS.PENDIENTE && (
              <p className="triage-instruction-desc">
                Tu aviso fue transmitido. Si te dirigís en vehículo, conducí con precaución. Al llegar, acercate a la mesa de triage e identificá tu nombre.
              </p>
            )}

            {esAceptado && (
              <p className="triage-instruction-desc">
                <strong>El equipo de triage ya fue alertado.</strong> Tené a mano tu DNI o credencial de obra social si contás con ella. Ingresá por el acceso principal de guardia.
              </p>
            )}

            {esEnAtencion && (
              <p className="triage-instruction-desc">
                El equipo médico está asistiendo tu caso. Por favor seguí las indicaciones de los profesionales de la salud.
              </p>
            )}

            {esAtendido && (
              <p className="triage-instruction-desc">
                La consulta ha concluido exitosamente. Te deseamos una pronta recuperación.
              </p>
            )}

            {esCancelado && (
              <p className="triage-instruction-desc">
                El aviso de atención fue cancelado. Si aún requerís asistencia urgente, podés buscar otro centro disponible en el mapa o llamar al 107.
              </p>
            )}

            {solicitud.centro_direccion && (
              <div className="destination-address-chip">
                <span>📍 Dirección de destino:</span>
                <strong>{solicitud.centro_direccion}</strong>
              </div>
            )}
          </div>

          {/* ── Indicador de Polling en vivo ── */}
          {!esAtendido && !esCancelado && (
            <div className="live-heartbeat-box">
              <span className="pulse-green-dot" aria-hidden="true" />
              <span>Canal seguro con el centro médico · Actualización cada 10s</span>
            </div>
          )}

          {/* ── Banner de Conversión de Invitado a Registrado (Épica 4 issue #30) ── */}
          {!solicitud.usuario_id && (
            <div
              className="guest-conversion-banner"
              style={{
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '12px',
                padding: '1.25rem',
                margin: '1.25rem 0',
                textAlign: 'center',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
              }}
            >
              <span style={{ fontSize: '1.75rem', display: 'block', marginBottom: '0.35rem' }}>📂</span>
              <h4 style={{ color: '#f8fafc', fontWeight: 800, fontSize: '1.05rem', margin: '0 0 0.35rem' }}>
                ¿Querés guardar esta atención en tu ficha clínica?
              </h4>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.4, margin: '0 0 1rem' }}>
                Creá tu cuenta o ingresá con Google para no perder tu historial, diagnósticos e indicaciones médicas recibidas.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Link
                  to="/ingreso"
                  className="btn btn--hero-primary"
                  style={{ fontSize: '0.88rem', padding: '0.65rem 1.25rem', textDecoration: 'none' }}
                >
                  <span>🔒 Vincular y Guardar mi Historial</span>
                </Link>
              </div>
            </div>
          )}

          {/* ── Botones de Acción Inmediata ── */}
          <div className="tracking-actions-stack">
            {solicitud.centro_telefono && !esAtendido && (
              <a
                href={`tel:${solicitud.centro_telefono}`}
                className="btn btn--action-phone"
                title={`Llamar al centro médico: ${solicitud.centro_telefono}`}
              >
                <span>📞 Llamar al centro médico ({solicitud.centro_telefono})</span>
              </a>
            )}

            <Link to="/mapa" className="btn btn--hero-secondary">
              <span>🗺️ Ver otros centros en el mapa</span>
            </Link>

            {(estado === ESTADOS.PENDIENTE || estado === ESTADOS.ACEPTADO) && (
              <button
                type="button"
                className="btn-cancel-link"
                onClick={() => setMostrarConfirmacionCancelar(true)}
                disabled={cancelando}
              >
                {cancelando ? 'Cancelando...' : 'Cancelar aviso de guardia'}
              </button>
            )}
          </div>
        </article>
      </main>

      {/* Modal de Confirmación de Cancelación */}
      {mostrarConfirmacionCancelar && (
        <div
          className="emergency-modal-backdrop"
          onClick={() => setMostrarConfirmacionCancelar(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="cancel-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>¿Querés cancelar este aviso de guardia?</h3>
            <p>Si cancelás, el centro médico liberará el turno previo de triage.</p>
            <div className="cancel-dialog-actions">
              <button
                type="button"
                className="btn btn--hero-secondary btn--sm"
                onClick={() => setMostrarConfirmacionCancelar(false)}
              >
                Mantener activo
              </button>
              <button
                type="button"
                className="btn btn--hero-primary btn--sm"
                onClick={handleCancelar}
                disabled={cancelando}
              >
                Sí, cancelar aviso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
