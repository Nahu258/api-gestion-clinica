/**
 * DetalleCentro.jsx — Pantalla de detalle del centro de emergencia y solicitud.
 *
 * AE4-09 (issue #18):
 *   - Muestra datos del centro (nombre, dirección, teléfono link tel:, distancia, 24h)
 *   - Botón grande rojo "🚨 Voy en camino - Avisarles" visible sin scroll en 360px
 *   - Botón secundario "📅 Solicitar atención urgente"
 *   - Formulario modal con nombre (validado para invitados), motivo breve (max 200 chars)
 *   - Prevención de doble submit con spinner y botón deshabilitado
 *   - Manejo de errores de red con reintento
 *   - Redirige a /seguimiento/:id tras creación exitosa
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'

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

export default function DetalleCentro() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  // Datos previos pasados por navegación
  const centroInicial = location.state?.centro || null
  const ubicacionUsuario = location.state?.ubicacionUsuario || null

  const [centro, setCentro] = useState(centroInicial)
  const [cargando, setCargando] = useState(!centroInicial)
  const [errorCarga, setErrorCarga] = useState(null)

  // Estado del modal de solicitud
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

  // Cargar centro si no vino en el router state (ej. recarga de página)
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

  const handleEnviarSolicitud = async (e) => {
    e.preventDefault()
    setErrorValidacion('')
    setErrorEnvio(null)

    // Criterio de aceptación: validar que el nombre no esté vacío si es invitado y quiere seguimiento
    if (esInvitado && !nombreInvitado.trim()) {
      setErrorValidacion('Por favor ingresá tu nombre para que el centro pueda identificarte.')
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
      // Redirigir a pantalla de seguimiento (AE3-10) con el id de la solicitud
      navigate(`/seguimiento/${solicitudCreada.id}`, {
        state: { solicitud: solicitudCreada, centro },
      })
    } catch (err) {
      setEnviando(false)
      setErrorEnvio(err.message || 'Error al enviar la solicitud. Por favor reintentá.')
    }
  }

  if (cargando) {
    return (
      <div className="detalle-page">
        <header className="detalle-topbar">
          <button className="btn-volver" onClick={() => navigate('/mapa')}>
            ← Volver al mapa
          </button>
        </header>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '1rem' }}>
          <div className="spinner" style={{ borderColor: 'rgba(230, 57, 70, 0.3)', borderTopColor: '#e63946', width: '32px', height: '32px' }} />
          <p style={{ color: '#6c757d', fontWeight: 600 }}>Cargando datos del centro...</p>
        </div>
      </div>
    )
  }

  if (errorCarga || !centro) {
    return (
      <div className="detalle-page">
        <header className="detalle-topbar">
          <button className="btn-volver" onClick={() => navigate('/mapa')}>
            ← Volver al mapa
          </button>
        </header>
        <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
          <p style={{ color: '#c92a2a', fontWeight: 700 }}>⚠️ {errorCarga || 'Centro no encontrado'}</p>
          <button className="btn btn--invitado" onClick={() => navigate('/mapa')} style={{ marginTop: '1rem' }}>
            Volver al mapa
          </button>
        </div>
      </div>
    )
  }

  const iconoTipo = TIPOS_EMOJI[centro.tipo] || '📍'

  return (
    <div className="detalle-page">
      {/* ── Barra superior con botón volver ── */}
      <header className="detalle-topbar">
        <button
          className="btn-volver"
          onClick={() => navigate('/mapa')}
          aria-label="Volver al mapa de centros"
        >
          ← Volver
        </button>
        <h1 className="detalle-topbar-titulo">{centro.nombre}</h1>
      </header>

      {/* ── Contenido de la pantalla ── */}
      <main className="detalle-content">
        <section className="detalle-card-info">
          <div className="detalle-header-centro">
            <span className="detalle-icono-grande" aria-hidden="true">
              {iconoTipo}
            </span>
            <div>
              <h2 className="detalle-nombre-centro">{centro.nombre}</h2>
              <div className="detalle-meta-row">
                <span className="badge badge--tipo">{centro.tipo_legible || centro.tipo}</span>
                <span className={`badge ${centro.atiende_24h ? 'badge--green' : 'badge--gray'}`}>
                  {centro.atiende_24h ? '⏰ Abierto las 24 horas' : 'Horario limitado'}
                </span>
                {centro.distancia_km != null && (
                  <span className="distancia-badge">📱 Distancia: {centro.distancia_km} km</span>
                )}
              </div>
            </div>
          </div>

          <div className="detalle-info-items">
            <div className="detalle-item">
              <span aria-hidden="true">📍</span>
              <span><strong>Dirección:</strong> {centro.direccion}, {centro.ciudad}</span>
            </div>

            {centro.telefono ? (
              <div className="detalle-item">
                <span aria-hidden="true">📞</span>
                <span>
                  <strong>Teléfono:</strong>{' '}
                  <a href={`tel:${centro.telefono}`} title={`Llamar a ${centro.nombre}`}>
                    {centro.telefono}
                  </a>
                </span>
              </div>
            ) : null}
          </div>
        </section>

        {/* ── Botones de Acción de Emergencia ── */}
        {/* El botón "Voy en camino" es grande, rojo y visible sin scroll en 360px */}
        <section className="detalle-acciones-emergencia" aria-label="Acciones de atención inmediata">
          <button
            type="button"
            className="btn btn-voy-en-camino"
            onClick={() => abrirModal('aviso')}
            id="btn-voy-en-camino"
          >
            🚨 Voy en camino - Avisarles
          </button>

          <button
            type="button"
            className="btn btn-solicitar-urgente"
            onClick={() => abrirModal('solicitud')}
            id="btn-solicitar-urgente"
          >
            📅 Solicitar atención urgente
          </button>
        </section>
      </main>

      {/* ── Modal Bottom Sheet de Formulario de Solicitud ── */}
      {modalAbierto && (
        <div
          className="modal-overlay"
          onClick={cerrarModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-solicitud-titulo"
        >
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="modal-solicitud-titulo">
                {modoSeleccionado === 'aviso'
                  ? '🚨 Avisar que voy en camino'
                  : '📅 Solicitar atención urgente'}
              </h3>
              <button
                type="button"
                className="btn-close"
                onClick={cerrarModal}
                disabled={enviando}
                aria-label="Cerrar formulario"
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#6c757d' }}>
              Destino: <strong>{centro.nombre}</strong>
            </p>

            {errorEnvio && (
              <div className="centros-error" role="alert">
                <span>⚠️ {errorEnvio}</span>
              </div>
            )}

            {errorValidacion && (
              <div className="centros-error" role="alert">
                <span>⚠️ {errorValidacion}</span>
              </div>
            )}

            <form onSubmit={handleEnviarSolicitud} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Si es invitado, campo de nombre requerido para seguimiento */}
              {esInvitado && (
                <div className="form-grupo">
                  <label htmlFor="input-nombre-invitado" className="form-label">
                    Tu nombre <span style={{ color: '#e63946' }}>*</span>
                  </label>
                  <input
                    id="input-nombre-invitado"
                    type="text"
                    className="form-input"
                    placeholder="Ej. Juan Pérez"
                    value={nombreInvitado}
                    onChange={(e) => setNombreInvitado(e.target.value)}
                    disabled={enviando}
                    autoFocus
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: '#868e96' }}>
                    Necesario para identificarte en el centro de salud.
                  </span>
                </div>
              )}

              <div className="form-grupo">
                <label htmlFor="input-telefono-contacto" className="form-label">
                  Teléfono de contacto (opcional)
                </label>
                <input
                  id="input-telefono-contacto"
                  type="tel"
                  className="form-input"
                  placeholder="Ej. 376 412-3456"
                  value={telefonoContacto}
                  onChange={(e) => setTelefonoContacto(e.target.value)}
                  disabled={enviando}
                />
              </div>

              <div className="form-grupo">
                <label htmlFor="input-motivo-consulta" className="form-label">
                  Motivo breve (opcional)
                </label>
                <textarea
                  id="input-motivo-consulta"
                  className="form-textarea"
                  placeholder="Ej. Caída de moto con dolor agudo en el brazo derecho..."
                  maxLength={200}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={enviando}
                />
                <span className="char-counter">
                  {motivo.length} / 200 caracteres
                </span>
              </div>

              <div className="modal-acciones">
                <button
                  type="button"
                  className="btn btn--secundario"
                  onClick={cerrarModal}
                  disabled={enviando}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="btn btn--invitado"
                  disabled={enviando}
                  id="btn-confirmar-solicitud"
                >
                  {enviando ? (
                    <>
                      <div className="spinner" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <span>Confirmar y enviar</span>
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
