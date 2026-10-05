/**
 * SeguimientoSolicitud.jsx — Pantalla de seguimiento en tiempo real con polling.
 *
 * AE4-10 (issue #19):
 *   - Polling cada 10s a GET /api/v1/atencion/solicitudes/{id}/
 *   - El polling se detiene automáticamente en 'atendido' o 'cancelado'
 *   - Limpieza adecuada del interval al desmontar el componente (evita memory leaks)
 *   - Transición a 'aceptado': animación de checkmark + audio (Web Audio API) + vibración
 *   - Persistencia: guarda y recupera solicitud_id de sessionStorage ante recarga
 *   - Botón directo de llamada telefónica al centro (tel:)
 *   - Navegación de vuelta al mapa
 */

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'

import {
  obtenerSolicitud,
  cancelarSolicitud,
  KEY_SOLICITUD_ID,
  obtenerUltimaSolicitudGuardada,
} from '../api/atencion.js'

// Helper de audio con Web Audio API (autónomo, sin assets externos, funciona 100% offline)
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

    // Secuencia de dos tonos alegres: Do (523Hz) -> Sol (784Hz)
    osc1.frequency.setValueAtTime(523.25, ahora)
    osc1.frequency.exponentialRampToValueAtTime(783.99, ahora + 0.15)

    osc2.frequency.setValueAtTime(659.25, ahora + 0.05)
    osc2.frequency.exponentialRampToValueAtTime(1046.50, ahora + 0.2)

    gainNode.gain.setValueAtTime(0.3, ahora)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ahora + 0.45)

    osc1.connect(gainNode)
    osc2.connect(gainNode)
    gainNode.connect(ctx.destination)

    osc1.start(ahora)
    osc2.start(ahora + 0.05)
    osc1.stop(ahora + 0.45)
    osc2.stop(ahora + 0.45)
  } catch {
    // Si el navegador bloquea audio sin interacción previa, ignorar silenciosamente
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

// Estados posibles según el backend (SolicitudAtencion.Estado)
const ESTADOS = {
  PENDIENTE:   'pendiente',
  ACEPTADO:    'aceptado',
  EN_ATENCION: 'en_atencion',
  ATENDIDO:    'atendido',
  CANCELADO:   'cancelado',
}

const PASOS_STEPPER = [
  { key: ESTADOS.PENDIENTE,   label: 'Pendiente' },
  { key: ESTADOS.ACEPTADO,    label: 'Aceptado' },
  { key: ESTADOS.EN_ATENCION, label: 'En atención' },
  { key: ESTADOS.ATENDIDO,    label: 'Atendido' },
]

export default function SeguimientoSolicitud() {
  const { id: paramId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  // Determinar el ID de la solicitud: del param, del router state o de sessionStorage
  const [solicitudId, setSolicitudId] = useState(() => {
    if (paramId) return paramId
    if (location.state?.solicitud?.id) return String(location.state.solicitud.id)
    return sessionStorage.getItem(KEY_SOLICITUD_ID) || null
  })

  const [solicitud, setSolicitud] = useState(location.state?.solicitud || null)
  const [cargando, setCargando] = useState(!solicitud)
  const [error, setError] = useState(null)
  const [cancelando, setCancelando] = useState(false)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(new Date())

  // Referencia para detectar transición a 'aceptado'
  const estadoAnteriorRef = useRef(solicitud?.estado || null)
  const pollingIntervalRef = useRef(null)

  // Guardar solicitudId en sessionStorage cuando se determine
  useEffect(() => {
    if (solicitudId) {
      sessionStorage.setItem(KEY_SOLICITUD_ID, String(solicitudId))
    }
  }, [solicitudId])

  // Carga inicial y configuración del polling cada 10 segundos
  useEffect(() => {
    if (!solicitudId) {
      // Intentar leer de sessionStorage
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

        // Detectar si cambió a 'aceptado'
        if (
          data.estado === ESTADOS.ACEPTADO &&
          estadoAnteriorRef.current &&
          estadoAnteriorRef.current !== ESTADOS.ACEPTADO
        ) {
          reproducirSonidoAceptado()
          vibrarDispositivo()
        }

        estadoAnteriorRef.current = data.estado

        // Criterio de aceptación: detener polling si llega a ATENDIDO o CANCELADO
        if (data.estado === ESTADOS.ATENDIDO || data.estado === ESTADOS.CANCELADO) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
        }
      } catch (err) {
        if (!activo) return
        // Si no hay red, mantener el último dato conocido
        setCargando(false)
      }
    }

    // Consulta inicial inmediata
    consultarEstado()

    // Configurar polling cada 10 segundos
    pollingIntervalRef.current = setInterval(consultarEstado, 10000)

    // Criterio de aceptación: cleanup del interval si navega fuera
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
    const confirmar = window.confirm('¿Seguro que querés cancelar esta solicitud de atención?')
    if (!confirmar) return

    setCancelando(true)
    try {
      const data = await cancelarSolicitud(solicitudId)
      setSolicitud(data)
      setCancelando(false)
      // Detener polling al cancelar
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    } catch (err) {
      setCancelando(false)
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
      <div className="seguimiento-page">
        <div className="seguimiento-card">
          <div className="spinner" style={{ borderColor: 'rgba(230, 57, 70, 0.3)', borderTopColor: '#e63946', width: '36px', height: '36px', margin: '1rem auto' }} />
          <h3>Cargando seguimiento...</h3>
          <p style={{ color: '#6c757d', fontSize: '0.85rem' }}>Conectando con el centro de salud.</p>
        </div>
      </div>
    )
  }

  if (error || !solicitud) {
    return (
      <div className="seguimiento-page">
        <div className="seguimiento-card">
          <span style={{ fontSize: '3rem' }}>🔍</span>
          <h2>Sin solicitud activa</h2>
          <p style={{ color: '#6c757d', fontSize: '0.9rem' }}>
            {error || 'No se encontró ninguna solicitud activa en este momento.'}
          </p>
          <button className="btn btn--invitado" onClick={() => navigate('/mapa')} style={{ marginTop: '1rem' }}>
            Ver mapa de centros
          </button>
        </div>
      </div>
    )
  }

  const estado = solicitud.estado
  const esAceptado = estado === ESTADOS.ACEPTADO
  const esCancelado = estado === ESTADOS.CANCELADO
  const esAtendido = estado === ESTADOS.ATENDIDO
  const esEnAtencion = estado === ESTADOS.EN_ATENCION

  // Índice para el stepper
  const indiceActual = PASOS_STEPPER.findIndex((p) => p.key === estado)

  return (
    <div className="seguimiento-page">
      <main className="seguimiento-card" role="main" aria-live="polite">
        {/* ── Encabezado de Estado con Ícono y Animación ── */}
        <div className="seguimiento-header-status">
          {esAceptado && (
            <div className="status-animation-icon status-animation-icon--checkmark" aria-hidden="true">
              ✅
            </div>
          )}
          {estado === ESTADOS.PENDIENTE && (
            <div className="status-animation-icon status-animation-icon--pulse" aria-hidden="true">
              ⏳
            </div>
          )}
          {esEnAtencion && (
            <div className="status-animation-icon status-animation-icon--pulse" aria-hidden="true">
              🩺
            </div>
          )}
          {esAtendido && (
            <div className="status-animation-icon status-animation-icon--checkmark" aria-hidden="true">
              🎉
            </div>
          )}
          {esCancelado && (
            <div className="status-animation-icon" aria-hidden="true">
              ❌
            </div>
          )}

          <h1 className="seguimiento-titulo-estado">
            {esAceptado && '¡Solicitud aceptada!'}
            {estado === ESTADOS.PENDIENTE && 'Solicitud enviada'}
            {esEnAtencion && 'En atención'}
            {esAtendido && 'Atención completada'}
            {esCancelado && 'Solicitud cancelada'}
          </h1>

          <h2 className="seguimiento-centro-nombre">
            {solicitud.centro_nombre || 'Centro de Emergencia'}
          </h2>

          <span className="seguimiento-hora">
            Solicitado a las {formatearHora(solicitud.creado_en) || 'recientemente'}
          </span>
        </div>

        {/* ── Stepper Visual de Progreso (si no está cancelado) ── */}
        {!esCancelado && (
          <div className="seguimiento-stepper" aria-label="Progreso del estado de atención">
            {PASOS_STEPPER.map((paso, idx) => {
              const completado = indiceActual > idx
              const activo = indiceActual === idx
              return (
                <div
                  key={paso.key}
                  className={`step-item ${completado ? 'step-item--completado' : ''} ${activo ? 'step-item--activo' : ''}`}
                >
                  <div className="step-dot">
                    {completado ? '✓' : idx + 1}
                  </div>
                  <span className="step-label">{paso.label}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Mensaje descriptivo con datos de contacto ── */}
        <div
          className="seguimiento-mensaje-box"
          style={{
            borderLeftColor: esCancelado
              ? '#e63946'
              : esAceptado || esAtendido
              ? '#20c997'
              : '#f59f00',
          }}
        >
          {estado === ESTADOS.PENDIENTE && (
            <p>
              "Tu solicitud fue recibida. El centro te contactará
              {solicitud.centro_telefono ? ` al ${solicitud.centro_telefono}` : ''}."
            </p>
          )}

          {esAceptado && (
            <p>
              <strong>¡El centro aceptó tu solicitud!</strong> El equipo médico ya fue alertado de tu llegada.
              {solicitud.centro_direccion && (
                <span> Dirección: <em>{solicitud.centro_direccion}</em>.</span>
              )}
            </p>
          )}

          {esEnAtencion && (
            <p>
              <strong>Estás en atención.</strong> El personal del centro está asistiendo tu caso de emergencia.
            </p>
          )}

          {esAtendido && (
            <p>
              <strong>Atención finalizada.</strong> La guardia ha registrado tu consulta como completada. Esperamos tu pronta recuperación.
            </p>
          )}

          {esCancelado && (
            <p>
              <strong>La solicitud fue cancelada.</strong> Si todavía necesitás ayuda médica urgente, podés buscar otro centro cercano disponible.
            </p>
          )}
        </div>

        {/* ── Indicador de Polling activo ── */}
        {!esAtendido && !esCancelado && (
          <div className="seguimiento-polling-badge">
            <span className="punto-verde" />
            <span>Actualizando en vivo cada 10s</span>
          </div>
        )}

        {/* ── Botones de Acción ── */}
        <div className="seguimiento-acciones">
          {/* Botón de llamada directa si hay teléfono */}
          {solicitud.centro_telefono && !esAtendido && (
            <a
              href={`tel:${solicitud.centro_telefono}`}
              className="btn-tel-grande"
              title={`Llamar al centro: ${solicitud.centro_telefono}`}
            >
              📞 Llamar al centro ({solicitud.centro_telefono})
            </a>
          )}

          {/* Botón para volver al mapa */}
          <button
            type="button"
            className="btn btn--secundario"
            onClick={() => navigate('/mapa')}
          >
            🗺️ Volver al mapa
          </button>

          {/* Opción de cancelar si está pendiente o aceptado */}
          {(estado === ESTADOS.PENDIENTE || estado === ESTADOS.ACEPTADO) && (
            <button
              type="button"
              className="btn-cancelar-solicitud"
              onClick={handleCancelar}
              disabled={cancelando}
            >
              {cancelando ? 'Cancelando...' : 'Cancelar solicitud'}
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
