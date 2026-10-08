/**
 * PanelCentro.jsx - Consola Operativa y Triage de Guardia Médica.
 *
 * Épica 4 (AE4-17):
 * - Consola operativa en tiempo real para Operadores de Centro.
 * - Bandeja de emergencias entrantes con filtros y modo "Voy en camino" vs "Solicitud urgente".
 * - Modal de Triage para derivación a especialistas según disponibilidad en Redis.
 * - Polling reactivo cada 6 segundos y reloj operativo en vivo.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Navbar from '../components/Navbar.jsx'
import {
  listarSolicitudesCentro,
  listarEspecialidadesCentro,
  listarEspecialistasDisponiblesCentro,
  derivarSolicitud,
} from '../api/atencion.js'

export default function PanelCentro() {
  const { usuario, centroId } = useAuth()

  // Centro ID efectivo (fallback al centro del operador o centro 1 para test)
  const idCentro = centroId || usuario?.centro_id || 1
  const nombreCentro = usuario?.centro_nombre || 'Centro de Guardia Posadas'

  // Estados principales
  const [solicitudes, setSolicitudes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [reloj, setReloj] = useState(new Date().toLocaleTimeString('es-AR'))

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState('activas') // 'activas', 'todos', 'pendiente', 'aceptado', 'derivado'
  const [filtroModo, setFiltroModo] = useState('todos') // 'todos', 'aviso', 'solicitud'

  // Modal de Derivación (Triage)
  const [solicitudTriage, setSolicitudTriage] = useState(null)
  const [especialidades, setEspecialidades] = useState([])
  const [especialidadSeleccionada, setEspecialidadSeleccionada] = useState('')
  const [doctores, setDoctores] = useState([])
  const [doctorSeleccionado, setDoctorSeleccionado] = useState('')
  const [prioridadTriage, setPrioridadTriage] = useState('alta')
  const [observacionesTriage, setObservacionesTriage] = useState('')
  const [derivando, setDerivando] = useState(false)
  const [errorModal, setErrorModal] = useState(null)
  const [exitoToast, setExitoToast] = useState(null)

  // Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => {
      setReloj(new Date().toLocaleTimeString('es-AR'))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Cargar solicitudes con polling
  const cargarSolicitudes = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true)
    try {
      const data = await listarSolicitudesCentro(idCentro)
      setSolicitudes(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      if (!silencioso) {
        setError('No se pudo sincronizar la bandeja de solicitudes. Reintentando...')
      }
    } finally {
      if (!silencioso) setCargando(false)
    }
  }, [idCentro])

  useEffect(() => {
    cargarSolicitudes()
    const interval = setInterval(() => cargarSolicitudes(true), 6000)
    return () => clearInterval(interval)
  }, [cargarSolicitudes])

  // Cargar especialidades del centro al abrir modal
  const abrirModalTriage = async (solicitud) => {
    setSolicitudTriage(solicitud)
    setErrorModal(null)
    setEspecialidadSeleccionada('')
    setDoctorSeleccionado('')
    setPrioridadTriage(solicitud.prioridad || 'alta')
    setObservacionesTriage('')

    try {
      const esps = await listarEspecialidadesCentro(idCentro)
      setEspecialidades(esps)
      if (esps.length > 0) {
        setEspecialidadSeleccionada(String(esps[0].id))
        cargarDoctoresDeEspecialidad(esps[0].id)
      }
    } catch {
      setErrorModal('Error al cargar especialidades del centro.')
    }
  }

  // Cargar especialistas según la especialidad seleccionada
  const cargarDoctoresDeEspecialidad = async (espId) => {
    try {
      const docs = await listarEspecialistasDisponiblesCentro(idCentro, espId)
      setDoctores(docs)
      // Auto-seleccionar el primer doctor disponible si hay
      const primerDisponible = docs.find((d) => d.disponibilidad === 'DISPONIBLE')
      if (primerDisponible) {
        setDoctorSeleccionado(String(primerDisponible.medico_id))
      } else if (docs.length > 0) {
        setDoctorSeleccionado(String(docs[0].medico_id))
      } else {
        setDoctorSeleccionado('')
      }
    } catch {
      setDoctores([])
    }
  }

  const handleCambioEspecialidad = (e) => {
    const espId = e.target.value
    setEspecialidadSeleccionada(espId)
    cargarDoctoresDeEspecialidad(espId)
  }

  // Ejecutar derivación
  const handleConfirmarDerivacion = async (e) => {
    e.preventDefault()
    if (!solicitudTriage || !especialidadSeleccionada || !doctorSeleccionado) {
      setErrorModal('Debe seleccionar la especialidad y el médico especialista.')
      return
    }

    setDerivando(true)
    setErrorModal(null)

    try {
      await derivarSolicitud(solicitudTriage.id, {
        especialidad_id: Number(especialidadSeleccionada),
        medico_id: Number(doctorSeleccionado),
        prioridad: prioridadTriage,
        observaciones: observacionesTriage,
      })

      setExitoToast(`Paciente #${solicitudTriage.id} derivado exitosamente.`)
      setTimeout(() => setExitoToast(null), 4000)
      setSolicitudTriage(null)
      cargarSolicitudes(true)
    } catch (err) {
      setErrorModal(err.message || 'Error al procesar la derivación.')
    } finally {
      setDerivando(false)
    }
  }

  // Filtrado de solicitudes
  const solicitudesFiltradas = useMemo(() => {
    return solicitudes.filter((item) => {
      // Filtro de Estado
      if (filtroEstado === 'activas') {
        if (!['pendiente', 'aceptado'].includes(item.estado)) return false
      } else if (filtroEstado !== 'todos') {
        if (item.estado !== filtroEstado) return false
      }

      // Filtro de Modo
      if (filtroModo !== 'todos') {
        if (item.modo !== filtroModo) return false
      }

      return true
    })
  }, [solicitudes, filtroEstado, filtroModo])

  return (
    <div className="login-viewport" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      {/* Toast de confirmación */}
      {exitoToast && (
        <div className="login-toast login-toast--success" role="alert" style={{ zIndex: 2000 }}>
          <span>{exitoToast}</span>
        </div>
      )}

      <main style={{ maxWidth: '1240px', width: '100%', margin: '1.5rem auto', padding: '0 1rem', flex: 1 }}>
        {/* Header Operativo de Guardia */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.7)',
          border: '1px solid rgba(51, 65, 85, 0.6)',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '1.3rem' }}>🏥</span>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                {nombreCentro}
              </h1>
              <span className="navbar-role-badge navbar-role-badge--operador" style={{ fontSize: '0.75rem' }}>
                Guardia Central
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#94a3b8' }}>
              Consola de Triage y Asignación de Especialistas en Tiempo Real
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
                Hora Operativa
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>
                {reloj}
              </div>
            </div>

            <button
              onClick={() => cargarSolicitudes(false)}
              className="btn-navbar-logout"
              style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.4)' }}
              title="Refrescar solicitudes"
            >
              🔄 Actualizar
            </button>
          </div>
        </div>

        {/* Barra de Filtros y Estadísticas Rápidas */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.25rem'
        }}>
          {/* Tabs de Filtro de Estado */}
          <div style={{ display: 'flex', gap: '0.4rem', background: 'rgba(15, 23, 42, 0.6)', padding: '0.3rem', borderRadius: '8px', border: '1px solid rgba(51, 65, 85, 0.4)' }}>
            {[
              { id: 'activas', label: '⚡ En Espera / Activas' },
              { id: 'todos', label: 'Todas' },
              { id: 'pendiente', label: 'Pendientes' },
              { id: 'aceptado', label: 'Aceptadas' },
              { id: 'derivado', label: 'Derivadas' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFiltroEstado(tab.id)}
                style={{
                  background: filtroEstado === tab.id ? 'var(--primary, #0284c7)' : 'transparent',
                  color: filtroEstado === tab.id ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.82rem',
                  fontWeight: filtroEstado === tab.id ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Selector de Modo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Modo:</span>
            <select
              value={filtroModo}
              onChange={(e) => setFiltroModo(e.target.value)}
              style={{
                background: 'rgba(30, 41, 59, 0.8)',
                color: '#f8fafc',
                border: '1px solid rgba(51, 65, 85, 0.6)',
                borderRadius: '6px',
                padding: '0.4rem 0.75rem',
                fontSize: '0.82rem'
              }}
            >
              <option value="todos">Todos los modos</option>
              <option value="aviso">🚗 Voy en camino</option>
              <option value="solicitud">🚨 Solicitud urgente</option>
            </select>
          </div>
        </div>

        {/* Mensaje de Error si lo hay */}
        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.88rem' }}>
            {error}
          </div>
        )}

        {/* Lista / Grilla de Solicitudes */}
        {cargando && solicitudes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94a3b8' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem', width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p>Sincronizando emergencias entrantes...</p>
          </div>
        ) : solicitudesFiltradas.length === 0 ? (
          <div style={{
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px dashed rgba(51, 65, 85, 0.6)',
            borderRadius: '12px',
            padding: '3.5rem 1.5rem',
            textAlign: 'center',
            color: '#94a3b8'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🩺</div>
            <h3 style={{ color: '#f8fafc', fontSize: '1.2rem', marginBottom: '0.5rem' }}>
              No hay solicitudes con los filtros aplicados
            </h3>
            <p style={{ maxWidth: '420px', margin: '0 auto', fontSize: '0.9rem' }}>
              La guardia se encuentra al día. Las nuevas solicitudes que envíen los pacientes aparecerán automáticamente aquí.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem' }}>
            {solicitudesFiltradas.map((s) => {
              const esModoCamino = s.modo === 'aviso'
              const esInvitado = !s.usuario_id

              return (
                <div
                  key={s.id}
                  style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(51, 65, 85, 0.6)',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  {/* Fila Superior: ID, Modo y Estado */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 800, color: '#f8fafc', fontSize: '1rem' }}>
                        #{s.id}
                      </span>
                      {esModoCamino ? (
                        <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                          🚗 Voy en camino
                        </span>
                      ) : (
                        <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                          🚨 Urgente
                        </span>
                      )}
                    </div>

                    <span style={{
                      textTransform: 'uppercase',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '9999px',
                      background: s.estado === 'pendiente' ? 'rgba(234, 179, 8, 0.15)' : s.estado === 'derivado' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      color: s.estado === 'pendiente' ? '#facc15' : s.estado === 'derivado' ? '#c084fc' : '#60a5fa'
                    }}>
                      {s.estado_legible || s.estado}
                    </span>
                  </div>

                  {/* Datos del Paciente */}
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                      {esInvitado ? (s.nombre_invitado || 'Paciente Invitado (Sin cuenta)') : 'Paciente Registrado'}
                    </div>
                    {s.telefono_invitado && (
                      <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                        📞 Tel: {s.telefono_invitado}
                      </div>
                    )}
                  </div>

                  {/* Motivo de Consulta */}
                  <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '0.65rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                    <strong style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block', marginBottom: '0.15rem' }}>
                      MOTIVO DE CONSULTA:
                    </strong>
                    {s.motivo || 'Sin descripción detallada aportada.'}
                  </div>

                  {/* Si ya está derivado: mostrar especialista asignado */}
                  {s.medico_nombre && (
                    <div style={{ fontSize: '0.82rem', color: '#a78bfa', background: 'rgba(168, 85, 247, 0.1)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                      👨‍⚕️ Asignado a: <strong>{s.medico_nombre}</strong> ({s.especialidad_nombre || 'Especialista'})
                    </div>
                  )}

                  {/* Acciones del Operador */}
                  <div style={{ marginTop: 'auto', paddingTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                    {['pendiente', 'aceptado', 'en_camino'].includes(s.estado) && (
                      <button
                        onClick={() => abrirModalTriage(s)}
                        style={{
                          flex: 1,
                          background: 'var(--primary, #0284c7)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.55rem',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <span>🩺</span>
                        <span>Derivar a Especialista</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Modal de Derivación (Triage) */}
      {solicitudTriage && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 3000
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(51, 65, 85, 0.8)',
            borderRadius: '14px',
            maxWidth: '520px',
            width: '100%',
            padding: '1.5rem',
            color: '#f8fafc',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                Triage y Derivación Médica
              </h2>
              <button
                onClick={() => setSolicitudTriage(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: '#94a3b8', margin: '0 0 1.25rem' }}>
              Derivando paciente de emergencia <strong>#{solicitudTriage.id}</strong> ({solicitudTriage.nombre_invitado || 'Paciente'})
            </p>

            {errorModal && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '0.65rem 0.85rem', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '1rem' }}>
                {errorModal}
              </div>
            )}

            <form onSubmit={handleConfirmarDerivacion} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* 1. Selector de Especialidad */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Especialidad Requerida
                </label>
                <select
                  value={especialidadSeleccionada}
                  onChange={handleCambioEspecialidad}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    color: '#f8fafc',
                    border: '1px solid rgba(51, 65, 85, 0.8)',
                    borderRadius: '6px',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.9rem'
                  }}
                  required
                >
                  {especialidades.map((esp) => (
                    <option key={esp.id} value={esp.id}>
                      {esp.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Selector de Especialista Disponible en Tiempo Real */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Médico Especialista de Guardia
                </label>
                {doctores.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '6px' }}>
                    No hay médicos registrados en esta especialidad para el centro.
                  </div>
                ) : (
                  <select
                    value={doctorSeleccionado}
                    onChange={(e) => setDoctorSeleccionado(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      color: '#f8fafc',
                      border: '1px solid rgba(51, 65, 85, 0.8)',
                      borderRadius: '6px',
                      padding: '0.6rem 0.75rem',
                      fontSize: '0.9rem'
                    }}
                    required
                  >
                    {doctores.map((doc) => {
                      const icon = doc.disponibilidad === 'DISPONIBLE' ? '🟢' : doc.disponibilidad === 'EN_ATENCION' ? '🟡' : '🔴'
                      return (
                        <option key={doc.medico_id} value={doc.medico_id}>
                          {icon} {doc.nombre} ({doc.matricula}) - {doc.disponibilidad}
                        </option>
                      )
                    })}
                  </select>
                )}
              </div>

              {/* 3. Prioridad de Triage */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Prioridad de Triage
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                  {[
                    { id: 'baja', label: 'Baja', color: '#10b981' },
                    { id: 'media', label: 'Media', color: '#f59e0b' },
                    { id: 'alta', label: 'Alta', color: '#f97316' },
                    { id: 'urgente', label: 'Urgente', color: '#ef4444' },
                  ].map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setPrioridadTriage(p.id)}
                      style={{
                        padding: '0.45rem',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: prioridadTriage === p.id ? p.color : 'rgba(51, 65, 85, 0.6)',
                        background: prioridadTriage === p.id ? `${p.color}22` : 'transparent',
                        color: prioridadTriage === p.id ? p.color : '#94a3b8',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Observaciones de Triage */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Observaciones de Triage / Notas del Operador
                </label>
                <textarea
                  value={observacionesTriage}
                  onChange={(e) => setObservacionesTriage(e.target.value)}
                  placeholder="Ej: Paciente con dolor torácico intenso, sin antecedentes previos..."
                  rows={3}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    color: '#f8fafc',
                    border: '1px solid rgba(51, 65, 85, 0.8)',
                    borderRadius: '6px',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.85rem',
                    resize: 'none'
                  }}
                />
              </div>

              {/* Botones de acción */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setSolicitudTriage(null)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: '1px solid rgba(51, 65, 85, 0.8)',
                    color: '#94a3b8',
                    borderRadius: '6px',
                    padding: '0.6rem',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={derivando || doctores.length === 0}
                  style={{
                    flex: 2,
                    background: 'var(--primary, #0284c7)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.6rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: derivando || doctores.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: derivando || doctores.length === 0 ? 0.6 : 1
                  }}
                >
                  {derivando ? 'Derivando...' : 'Confirmar Derivación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
