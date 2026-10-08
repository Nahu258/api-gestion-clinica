/**
 * PortalMedico.jsx - Portal del Doctor / Especialista.
 *
 * Épica 4 (AE4-18):
 * - Control de disponibilidad en tiempo real con Redis (Disponible, En atención, Fuera de guardia).
 * - Cola de pacientes derivados en orden de prioridad y espera.
 * - Acción de "Llamar paciente / Iniciar atención" que transiciona a EN_ATENCION y abre la ficha clínica.
 * - Resumen de guardia con pacientes atendidos en el día.
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Navbar from '../components/Navbar.jsx'
import {
  obtenerMiDisponibilidad,
  actualizarMiDisponibilidad,
  obtenerColaMedico,
  iniciarAtencion,
} from '../api/atencion.js'

export default function PortalMedico() {
  const { usuario } = useAuth()
  const navigate = useNavigate()

  // Datos del médico y guardia
  const [disponibilidad, setDisponibilidad] = useState('DISPONIBLE')
  const [cambiandoEstado, setCambiandoEstado] = useState(false)
  const [atendidosHoy, setAtendidosHoy] = useState(0)
  const [colaPacientes, setColaPacientes] = useState([])
  const [cargandoCola, setCargandoCola] = useState(true)
  const [error, setError] = useState(null)
  const [iniciandoId, setIniciandoId] = useState(null)

  // Cargar disponibilidad y guardias
  const cargarDisponibilidad = useCallback(async () => {
    try {
      const data = await obtenerMiDisponibilidad()
      if (data?.disponibilidad_actual) {
        setDisponibilidad(data.disponibilidad_actual)
      }
    } catch {
      // Ignorar fallback
    }
  }, [])

  // Cargar cola de derivados y resumen
  const cargarCola = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargandoCola(true)
    try {
      const data = await obtenerColaMedico('derivado,en_atencion')
      setColaPacientes(data.solicitudes || [])
      setAtendidosHoy(data.atendidos_hoy || 0)
      setError(null)
    } catch (err) {
      if (!silencioso) {
        setError('No se pudo sincronizar la cola de derivados.')
      }
    } finally {
      if (!silencioso) setCargandoCola(false)
    }
  }, [])

  useEffect(() => {
    cargarDisponibilidad()
    cargarCola()

    const interval = setInterval(() => {
      cargarCola(true)
    }, 6000)

    return () => clearInterval(interval)
  }, [cargarDisponibilidad, cargarCola])

  // Cambio de disponibilidad
  const handleCambiarDisponibilidad = async (nuevoEstado) => {
    if (cambiandoEstado || nuevoEstado === disponibilidad) return
    setCambiandoEstado(true)
    try {
      const res = await actualizarMiDisponibilidad(nuevoEstado)
      setDisponibilidad(res.disponibilidad_actual)
    } catch (err) {
      setError(err.message || 'Error al actualizar disponibilidad.')
    } finally {
      setCambiandoEstado(false)
    }
  }

  // Llamar paciente / Iniciar atención
  const handleIniciarAtencion = async (solicitudId) => {
    setIniciandoId(solicitudId)
    try {
      await iniciarAtencion(solicitudId)
      setDisponibilidad('EN_ATENCION')
      navigate(`/portal-medico/atencion/${solicitudId}`)
    } catch (err) {
      setError(err.message || 'Error al iniciar la atención.')
    } finally {
      setIniciandoId(null)
    }
  }

  // Formato de tiempo relativo
  const tiempoRelativo = (fechaStr) => {
    if (!fechaStr) return ''
    const min = Math.floor((new Date() - new Date(fechaStr)) / 60000)
    if (min < 1) return 'Hace instantes'
    if (min === 1) return 'Hace 1 min'
    if (min < 60) return `Hace ${min} min`
    const horas = Math.floor(min / 60)
    return `Hace ${horas} h ${min % 60} min`
  }

  return (
    <div className="login-viewport" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main style={{ maxWidth: '1240px', width: '100%', margin: '1.5rem auto', padding: '0 1rem', flex: 1 }}>
        {/* Banner Superior: Bienvenida al Doctor y Control de Guardia */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.7)',
          border: '1px solid rgba(51, 65, 85, 0.6)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1.5rem',
          marginBottom: '1.75rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '1.5rem' }}>👨‍⚕️</span>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                {usuario?.medico_nombre || usuario?.nombre || 'Portal Médico'}
              </h1>
              <span className="navbar-role-badge navbar-role-badge--medico" style={{ fontSize: '0.75rem' }}>
                Especialista
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#94a3b8' }}>
              Gestión de disponibilidad y llamada a consulta de pacientes de emergencia.
            </p>
          </div>

          {/* Selector de Disponibilidad en Tiempo Real */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(51, 65, 85, 0.6)',
            borderRadius: '10px',
            padding: '0.6rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              Estado:
            </span>

            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                disabled={cambiandoEstado}
                onClick={() => handleCambiarDisponibilidad('DISPONIBLE')}
                style={{
                  background: disponibilidad === 'DISPONIBLE' ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
                  color: disponibilidad === 'DISPONIBLE' ? '#34d399' : '#94a3b8',
                  border: '1px solid',
                  borderColor: disponibilidad === 'DISPONIBLE' ? 'rgba(16, 185, 129, 0.6)' : 'rgba(51, 65, 85, 0.4)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.7rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <span>🟢</span>
                <span>Disponible</span>
              </button>

              <button
                type="button"
                disabled={cambiandoEstado}
                onClick={() => handleCambiarDisponibilidad('EN_ATENCION')}
                style={{
                  background: disponibilidad === 'EN_ATENCION' ? 'rgba(234, 179, 8, 0.25)' : 'transparent',
                  color: disponibilidad === 'EN_ATENCION' ? '#facc15' : '#94a3b8',
                  border: '1px solid',
                  borderColor: disponibilidad === 'EN_ATENCION' ? 'rgba(234, 179, 8, 0.6)' : 'rgba(51, 65, 85, 0.4)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.7rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <span>🟡</span>
                <span>En Consulta</span>
              </button>

              <button
                type="button"
                disabled={cambiandoEstado}
                onClick={() => handleCambiarDisponibilidad('FUERA_DE_GUARDIA')}
                style={{
                  background: disponibilidad === 'FUERA_DE_GUARDIA' ? 'rgba(239, 68, 68, 0.25)' : 'transparent',
                  color: disponibilidad === 'FUERA_DE_GUARDIA' ? '#f87171' : '#94a3b8',
                  border: '1px solid',
                  borderColor: disponibilidad === 'FUERA_DE_GUARDIA' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(51, 65, 85, 0.4)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.7rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <span>🔴</span>
                <span>Fin Guardia</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tarjetas de Resumen de Guardia */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
          <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: '10px', padding: '1rem 1.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              Pacientes Atendidos Hoy
            </span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.25rem' }}>
              {atendidosHoy}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Turno y guardia médica actual</span>
          </div>

          <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: '10px', padding: '1rem 1.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              En Espera para Consulta
            </span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: colaPacientes.length > 0 ? '#f59e0b' : '#34d399', marginTop: '0.25rem' }}>
              {colaPacientes.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Derivados pendientes de llamado</span>
          </div>

          <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: '10px', padding: '1rem 1.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              Estado del Especialista
            </span>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: disponibilidad === 'DISPONIBLE' ? '#34d399' : disponibilidad === 'EN_ATENCION' ? '#facc15' : '#f87171', marginTop: '0.5rem' }}>
              {disponibilidad === 'DISPONIBLE' ? '🟢 Listo para atender' : disponibilidad === 'EN_ATENCION' ? '🟡 Ocupado en atención' : '🔴 No disponible'}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sincronizado en tiempo real con Redis</span>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
            {error}
          </div>
        )}

        {/* Sección: Cola de Pacientes Derivados */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              Pacientes Asignados a Consulta
            </h2>
            <button
              onClick={() => cargarCola(false)}
              className="btn-navbar-logout"
              style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.4)' }}
            >
              🔄 Refrescar Cola
            </button>
          </div>

          {cargandoCola && colaPacientes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94a3b8' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem', width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <p>Cargando pacientes asignados...</p>
            </div>
          ) : colaPacientes.length === 0 ? (
            <div style={{
              background: 'rgba(30, 41, 59, 0.4)',
              border: '1px dashed rgba(51, 65, 85, 0.6)',
              borderRadius: '12px',
              padding: '3rem 1.5rem',
              textAlign: 'center',
              color: '#94a3b8'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>☕</div>
              <h3 style={{ color: '#f8fafc', fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                No tenés pacientes derivados en espera
              </h3>
              <p style={{ maxWidth: '420px', margin: '0 auto', fontSize: '0.9rem' }}>
                Cuando el operador del centro derive una emergencia a tu especialidad, aparecerá inmediatamente aquí.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {colaPacientes.map((s) => {
                const esInvitado = !s.usuario_id
                const enConsulta = s.estado === 'en_atencion'

                // Colores según prioridad
                const colorPrioridad =
                  s.prioridad === 'urgente' ? '#ef4444' : s.prioridad === 'alta' ? '#f97316' : s.prioridad === 'media' ? '#f59e0b' : '#10b981'

                return (
                  <div
                    key={s.id}
                    style={{
                      background: enConsulta ? 'rgba(56, 189, 248, 0.08)' : 'rgba(30, 41, 59, 0.7)',
                      border: '1px solid',
                      borderColor: enConsulta ? 'rgba(56, 189, 248, 0.4)' : 'rgba(51, 65, 85, 0.6)',
                      borderRadius: '12px',
                      padding: '1.25rem 1.5rem',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1.25rem',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
                    }}
                  >
                    {/* Datos del Paciente y Motivo */}
                    <div style={{ flex: '1 1 320px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 800, color: '#f8fafc', fontSize: '1.1rem' }}>
                          #{s.id} · {esInvitado ? (s.nombre_invitado || 'Paciente Invitado') : 'Paciente Registrado'}
                        </span>
                        <span style={{
                          background: `${colorPrioridad}22`,
                          color: colorPrioridad,
                          border: `1px solid ${colorPrioridad}44`,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'uppercase'
                        }}>
                          {s.prioridad || 'Alta'}
                        </span>
                        {enConsulta && (
                          <span style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#facc15', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                            🟡 En Atención
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '0.4rem' }}>
                        <strong style={{ color: '#94a3b8' }}>Motivo: </strong>
                        {s.motivo || 'Sin descripción aportada.'}
                      </div>

                      {s.observaciones_triage && (
                        <div style={{ fontSize: '0.82rem', color: '#fcd34d', background: 'rgba(245, 158, 11, 0.1)', padding: '0.35rem 0.65rem', borderRadius: '6px', marginBottom: '0.4rem' }}>
                          📝 <strong>Triage operador: </strong>{s.observaciones_triage}
                        </div>
                      )}

                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        Derivado {tiempoRelativo(s.fecha_derivacion || s.creado_en)}
                      </div>
                    </div>

                    {/* Botón de Llamar Paciente / Iniciar Atención */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {enConsulta ? (
                        <button
                          onClick={() => navigate(`/portal-medico/atencion/${s.id}`)}
                          style={{
                            background: 'var(--primary, #0284c7)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.75rem 1.25rem',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Continuar Consulta ➔
                        </button>
                      ) : (
                        <button
                          disabled={iniciandoId === s.id}
                          onClick={() => handleIniciarAtencion(s.id)}
                          style={{
                            background: '#10b981',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.75rem 1.25rem',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            cursor: iniciandoId === s.id ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            opacity: iniciandoId === s.id ? 0.7 : 1
                          }}
                        >
                          <span>📢</span>
                          <span>{iniciandoId === s.id ? 'Llamando...' : 'Llamar Paciente / Iniciar'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
