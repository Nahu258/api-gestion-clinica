/**
 * ConsultaMedica.jsx - Atención Médica, Ficha Clínica y Cierre con Diagnóstico.
 *
 * Épica 4 (AE4-19):
 * - Consulta de la ficha clínica del paciente (antecedentes registrados vs invitado).
 * - Visualización de motivo de urgencia y triage del operador.
 * - Formulario clínico de cierre con diagnóstico obligatorio e indicaciones terapéuticas.
 * - Finalización de la atención médica y retorno a la cola de guardia.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { obtenerFichaClinica, completarAtencion } from '../api/atencion.js'

export default function ConsultaMedica() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [ficha, setFicha] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // Formulario de cierre
  const [diagnostico, setDiagnostico] = useState('')
  const [indicaciones, setIndicaciones] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorValidacion, setErrorValidacion] = useState(null)
  const [finalizadoExito, setFinalizadoExito] = useState(false)
  const [mostrarHistorialPrevio, setMostrarHistorialPrevio] = useState(true)

  // Cargar ficha clínica
  const cargarFicha = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const data = await obtenerFichaClinica(id)
      setFicha(data)
      if (data.diagnostico) setDiagnostico(data.diagnostico)
      if (data.indicaciones) setIndicaciones(data.indicaciones)
    } catch (err) {
      setError(err.message || 'No se pudo cargar la ficha clínica de esta atención.')
    } finally {
      setCargando(false)
    }
  }, [id])

  useEffect(() => {
    cargarFicha()
  }, [cargarFicha])

  // Finalizar atención
  const handleFinalizarAtencion = async (e) => {
    e.preventDefault()

    if (!diagnostico || diagnostico.trim().length < 5) {
      setErrorValidacion('El diagnóstico médico es obligatorio y debe tener al menos 5 caracteres.')
      return
    }

    setGuardando(true)
    setErrorValidacion(null)

    try {
      await completarAtencion(id, {
        diagnostico: diagnostico.trim(),
        indicaciones: indicaciones.trim(),
      })

      setFinalizadoExito(true)
      setTimeout(() => {
        navigate('/portal-medico', { replace: true })
      }, 2000)
    } catch (err) {
      setErrorValidacion(err.message || 'Error al guardar el diagnóstico y cerrar la atención.')
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div className="login-viewport" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#94a3b8' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem', width: '36px', height: '36px', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p>Accediendo a la ficha clínica del paciente #{id}...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !ficha) {
    return (
      <div className="login-viewport" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main style={{ maxWidth: '600px', margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
          <div className="login-card">
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>⚠️</span>
            <h2 style={{ color: '#f8fafc', marginBottom: '0.75rem' }}>No se pudo acceder a la atención</h2>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>{error || 'La solicitud no existe o no tiene permisos asignados.'}</p>
            <Link to="/portal-medico" className="btn-ingreso btn-ingreso--google" style={{ justifyContent: 'center', background: '#0284c7', color: '#fff', border: 'none' }}>
              Volver al Portal Médico
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const paciente = ficha.paciente || {}
  const esInvitado = paciente.es_invitado
  const historialPrevio = ficha.historial_previo || []

  return (
    <div className="login-viewport" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      {/* Modal de Éxito al finalizar */}
      {finalizadoExito && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 4000,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #10b981',
            borderRadius: '16px',
            padding: '2.5rem 2rem',
            textAlign: 'center',
            maxWidth: '440px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)'
          }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 0.5rem' }}>
              Atención Finalizada
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', margin: '0 0 1.5rem' }}>
              El diagnóstico e indicaciones se registraron correctamente. Redirigiendo a tu cola de guardia...
            </p>
            <div className="spinner" style={{ margin: '0 auto', width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        </div>
      )}

      <main style={{ maxWidth: '1100px', width: '100%', margin: '1.5rem auto', padding: '0 1rem', flex: 1 }}>
        {/* Barra superior de retorno */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <Link to="/portal-medico" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#38bdf8', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>
            <span>←</span>
            <span>Volver a la cola de pacientes</span>
          </Link>

          <span style={{
            textTransform: 'uppercase',
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '0.25rem 0.65rem',
            borderRadius: '9999px',
            background: ficha.estado === 'atendido' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(234, 179, 8, 0.2)',
            color: ficha.estado === 'atendido' ? '#34d399' : '#facc15'
          }}>
            {ficha.estado === 'atendido' ? '✅ Atención Finalizada' : '🟡 Consulta en Curso'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
          {/* Columna Izquierda: Ficha Clínica y Antecedentes del Paciente */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Tarjeta de Datos del Paciente */}
            <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(51, 65, 85, 0.6)', borderRadius: '12px', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 0.25rem' }}>
                    {paciente.nombre || 'Paciente de Guardia'}
                  </h2>
                  <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                    Atención de Emergencia #{ficha.id}
                  </span>
                </div>

                {esInvitado ? (
                  <span style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                    ⚡ Invitado (Sin cuenta)
                  </span>
                ) : (
                  <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                    👤 Paciente Registrado
                  </span>
                )}
              </div>

              {paciente.telefono && (
                <div style={{ fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                  📞 <strong>Contacto: </strong>{paciente.telefono}
                </div>
              )}
              {paciente.email && (
                <div style={{ fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '0.75rem' }}>
                  ✉️ <strong>Email: </strong>{paciente.email}
                </div>
              )}

              <div style={{ fontSize: '0.82rem', color: '#94a3b8', borderTop: '1px solid rgba(51, 65, 85, 0.5)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>Centro: <strong>{ficha.centro_nombre}</strong></span>
                <span>Prioridad: <strong style={{ textTransform: 'uppercase', color: '#f97316' }}>{ficha.prioridad || 'Alta'}</strong></span>
              </div>
            </div>

            {/* Motivo de Consulta Actual y Triage */}
            <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(51, 65, 85, 0.6)', borderRadius: '12px', padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>🚨</span>
                <span>Motivo de Ingreso a Guardia</span>
              </h3>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.85rem 1rem', borderRadius: '8px', color: '#f1f5f9', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                {ficha.motivo || 'No se registraron notas preliminares del paciente.'}
              </div>

              {ficha.observaciones_triage ? (
                <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#fef3c7' }}>
                  <strong>Notas del Triage de Guardia: </strong>
                  {ficha.observaciones_triage}
                </div>
              ) : null}
            </div>

            {/* Historial Clínico Previo en la Red */}
            <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(51, 65, 85, 0.6)', borderRadius: '12px', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>📂</span>
                  <span>Antecedentes y Consultas Previas</span>
                </h3>

                {historialPrevio.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMostrarHistorialPrevio(!mostrarHistorialPrevio)}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    {mostrarHistorialPrevio ? 'Ocultar' : 'Mostrar'} ({historialPrevio.length})
                  </button>
                )}
              </div>

              {esInvitado ? (
                <div style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(51, 65, 85, 0.6)', borderRadius: '8px', padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  ℹ️ Este paciente ingresó como <strong>invitado</strong> temporal. No posee historial previo registrado en la red.
                </div>
              ) : historialPrevio.length === 0 ? (
                <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '8px', padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  Es la primera consulta registrada de este paciente en la red médica.
                </div>
              ) : mostrarHistorialPrevio ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '280px', overflowY: 'auto' }}>
                  {historialPrevio.map((prev) => (
                    <div
                      key={prev.id}
                      style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(51, 65, 85, 0.4)',
                        borderRadius: '8px',
                        padding: '0.75rem',
                        fontSize: '0.82rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginBottom: '0.25rem' }}>
                        <span>{prev.centro_nombre} · {prev.especialidad_nombre || 'Guardia'}</span>
                        <span>{prev.atendido_en ? new Date(prev.atendido_en).toLocaleDateString('es-AR') : ''}</span>
                      </div>
                      <div style={{ color: '#f8fafc', fontWeight: 600, marginBottom: '0.2rem' }}>
                        Dx: {prev.diagnostico}
                      </div>
                      {prev.indicaciones && (
                        <div style={{ color: '#94a3b8' }}>
                          Indicaciones: {prev.indicaciones}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Columna Derecha: Formulario de Registro Médico (Cierre) */}
          <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(51, 65, 85, 0.6)', borderRadius: '12px', padding: '1.75rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 0.5rem' }}>
              Registro Médico y Cierre de Consulta
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#94a3b8', margin: '0 0 1.5rem', lineHeight: 1.4 }}>
              Asiente el diagnóstico médico definitivo y las indicaciones terapéuticas para el paciente.
            </p>

            {errorValidacion && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                {errorValidacion}
              </div>
            )}

            <form onSubmit={handleFinalizarAtencion} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Diagnóstico */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.4rem' }}>
                  Diagnóstico Médico * <span style={{ color: '#f87171' }}>(requerido)</span>
                </label>
                <textarea
                  value={diagnostico}
                  onChange={(e) => setDiagnostico(e.target.value)}
                  placeholder="Ej: Traumatismo cerrado de tobillo derecho con esguince grado II del ligamento peroneoastragalino..."
                  rows={4}
                  required
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    color: '#f8fafc',
                    border: '1px solid rgba(51, 65, 85, 0.8)',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    fontSize: '0.9rem',
                    lineHeight: 1.5,
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Indicaciones y Tratamiento */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.4rem' }}>
                  Indicaciones, Tratamiento y Pautas de Alarma
                </label>
                <textarea
                  value={indicaciones}
                  onChange={(e) => setIndicaciones(e.target.value)}
                  placeholder="Ej: Ibuprofeno 400mg cada 8hs con las comidas por 3 días. Crioterapia local 15 min 3 veces al día. Reposo deportivo por 10 días. Consultar nuevamente ante aumento brusco de edema o cambio de coloración..."
                  rows={5}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    color: '#f8fafc',
                    border: '1px solid rgba(51, 65, 85, 0.8)',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    fontSize: '0.9rem',
                    lineHeight: 1.5,
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Botón de Finalización */}
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  type="submit"
                  disabled={guardando}
                  style={{
                    background: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.85rem',
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    cursor: guardando ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    opacity: guardando ? 0.7 : 1,
                    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  <span>💾</span>
                  <span>{guardando ? 'Guardando atención...' : 'Finalizar Atención Médica'}</span>
                </button>

                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                  Al finalizar, la solicitud pasará a estado Atendido y quedará registrada en el historial del paciente.
                </p>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
