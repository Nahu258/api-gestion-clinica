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
import {
  ArrowLeft,
  CheckCircle,
  ClockCounterClockwise,
  FloppyDisk,
  Warning,
} from '@phosphor-icons/react'
import Navbar from '../components/Navbar.jsx'
import { obtenerFichaClinica, completarAtencion } from '../api/atencion.js'

const fechaCorta = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

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
      setErrorValidacion('El diagnóstico es obligatorio y debe tener al menos 5 caracteres.')
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
      setErrorValidacion(err.message || 'No se pudo guardar el diagnóstico ni cerrar la atención.')
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div className="ui-shell">
        <Navbar />
        <main className="ui-page" aria-busy="true">
          <div className="ui-skeleton" style={{ height: 14, width: 180, marginBottom: 18 }} />
          <div className="ui-skeleton" style={{ height: 30, width: 320, marginBottom: 28 }} />
          <div className="ui-split">
            <div className="ui-stack">
              <div className="ui-card ui-skel-row">
                <div className="ui-skeleton" style={{ height: 16, width: '40%' }} />
                <div className="ui-skeleton" style={{ height: 12, width: '70%' }} />
                <div className="ui-skeleton" style={{ height: 12, width: '55%' }} />
              </div>
              <div className="ui-card ui-skel-row">
                <div className="ui-skeleton" style={{ height: 16, width: '30%' }} />
                <div className="ui-skeleton" style={{ height: 60, width: '100%' }} />
              </div>
            </div>
            <div className="ui-card ui-skel-row">
              <div className="ui-skeleton" style={{ height: 16, width: '50%' }} />
              <div className="ui-skeleton" style={{ height: 110, width: '100%' }} />
              <div className="ui-skeleton" style={{ height: 110, width: '100%' }} />
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !ficha) {
    return (
      <div className="ui-shell">
        <Navbar />
        <main className="ui-page">
          <div className="ui-card consulta-error">
            <div className="ui-empty">
              <div className="ui-empty__icon">
                <Warning size={22} />
              </div>
              <p className="ui-empty__title">No se pudo abrir la atención #{id}</p>
              <p className="ui-empty__text">
                {error || 'La solicitud no existe o no está asignada a tu usuario.'}
              </p>
              <Link to="/portal-medico" className="ui-btn ui-btn--dark" style={{ marginTop: 20 }}>
                Volver al portal médico
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const paciente = ficha.paciente || {}
  const esInvitado = paciente.es_invitado
  const historialPrevio = ficha.historial_previo || []
  const finalizada = ficha.estado === 'atendido'
  const prioridad = (ficha.prioridad || 'alta').toLowerCase()
  const chipPrioridad =
    prioridad === 'urgente' ? 'ui-chip--alert' : prioridad === 'alta' ? 'ui-chip--warn' : ''

  return (
    <div className="ui-shell">
      <Navbar />

      {finalizadoExito && (
        <div className="ui-backdrop" role="dialog" aria-modal="true" aria-labelledby="consulta-ok-title">
          <div className="ui-dialog" style={{ maxWidth: 420 }}>
            <div className="ui-empty">
              <div className="ui-empty__icon consulta-ok-icon">
                <CheckCircle size={24} weight="fill" />
              </div>
              <p id="consulta-ok-title" className="ui-empty__title">Atención finalizada</p>
              <p className="ui-empty__text">
                El diagnóstico y las indicaciones quedaron registrados. Volviendo a tu cola de pacientes.
              </p>
            </div>
          </div>
        </div>
      )}

      <main className="ui-page">
        <Link to="/portal-medico" className="ui-btn ui-btn--quiet ui-btn--sm consulta-back">
          <ArrowLeft size={16} />
          Cola de pacientes
        </Link>

        <header className="ui-pagehead">
          <div>
            <h1 className="ui-pagehead__title">{paciente.nombre || 'Paciente de guardia'}</h1>
            <div className="ui-pagehead__meta">
              <span className="ui-mono">Atención #{ficha.id}</span>
              <span>{ficha.centro_nombre}</span>
              <span>{esInvitado ? 'Ingresó como invitado' : 'Paciente con cuenta'}</span>
            </div>
          </div>
          <div className="ui-pagehead__actions">
            <span className={`ui-chip ${chipPrioridad}`}>Prioridad {prioridad}</span>
            <span className={`ui-chip ${finalizada ? 'ui-chip--ok' : 'ui-chip--ink'}`}>
              {finalizada ? 'Atención finalizada' : 'Consulta en curso'}
            </span>
          </div>
        </header>

        <div className="ui-split">
          {/* Columna izquierda: ficha clínica */}
          <div className="ui-stack">
            <section className="ui-card ui-card__pad">
              <h2 className="ui-h2" style={{ marginBottom: 12 }}>Motivo de ingreso</h2>
              <p className="ui-quote">
                {ficha.motivo || 'El paciente no dejó una descripción al pedir atención.'}
              </p>

              {ficha.observaciones_triage ? (
                <div className="consulta-triage">
                  <p className="ui-label">Notas de triage</p>
                  <p>{ficha.observaciones_triage}</p>
                </div>
              ) : null}

              <dl className="ui-kv consulta-datos">
                {paciente.telefono && (
                  <>
                    <dt>Teléfono</dt>
                    <dd className="ui-mono">{paciente.telefono}</dd>
                  </>
                )}
                {paciente.email && (
                  <>
                    <dt>Email</dt>
                    <dd>{paciente.email}</dd>
                  </>
                )}
                <dt>Centro</dt>
                <dd>{ficha.centro_nombre}</dd>
                {ficha.creado_en && (
                  <>
                    <dt>Ingreso</dt>
                    <dd className="ui-mono">
                      {new Date(ficha.creado_en).toLocaleString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </dd>
                  </>
                )}
              </dl>
            </section>

            <section className="ui-card">
              <div className="ui-card__head">
                <h2 className="ui-h2">Consultas previas</h2>
                {historialPrevio.length > 0 && (
                  <button
                    type="button"
                    className="ui-btn ui-btn--quiet ui-btn--sm"
                    onClick={() => setMostrarHistorialPrevio(!mostrarHistorialPrevio)}
                  >
                    {mostrarHistorialPrevio ? 'Ocultar' : 'Mostrar'} ({historialPrevio.length})
                  </button>
                )}
              </div>

              {esInvitado ? (
                <div className="ui-empty">
                  <div className="ui-empty__icon">
                    <ClockCounterClockwise size={22} />
                  </div>
                  <p className="ui-empty__text">
                    Ingresó como invitado, así que no hay historial asociado a una cuenta.
                  </p>
                </div>
              ) : historialPrevio.length === 0 ? (
                <div className="ui-empty">
                  <div className="ui-empty__icon">
                    <ClockCounterClockwise size={22} />
                  </div>
                  <p className="ui-empty__text">Es la primera atención registrada de este paciente.</p>
                </div>
              ) : mostrarHistorialPrevio ? (
                <ol className="ui-rows consulta-previas">
                  {historialPrevio.map((prev) => (
                    <li key={prev.id} className="ui-row" style={{ gridTemplateColumns: '1fr' }}>
                      <div>
                        <div className="ui-row__meta" style={{ marginTop: 0 }}>
                          <span className="ui-mono">{fechaCorta(prev.atendido_en)}</span>
                          <span>{prev.centro_nombre}</span>
                          <span>{prev.especialidad_nombre || 'Guardia'}</span>
                          {prev.medico_nombre && <span>{prev.medico_nombre}</span>}
                        </div>
                        <p className="ui-row__title" style={{ marginTop: 6 }}>{prev.diagnostico}</p>
                        {prev.indicaciones && <p className="ui-row__body">{prev.indicaciones}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          </div>

          {/* Columna derecha: cierre de la consulta */}
          <section className="ui-card ui-card__pad consulta-cierre">
            <h2 className="ui-h2">Cierre de la consulta</h2>
            <p className="ui-help" style={{ margin: '4px 0 18px' }}>
              Al finalizar, la solicitud pasa a Atendido y queda en el historial del paciente.
            </p>

            {errorValidacion && (
              <div className="ui-alert" role="alert">
                <Warning size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{errorValidacion}</span>
              </div>
            )}

            <form onSubmit={handleFinalizarAtencion} className="ui-form">
              <div className="ui-field">
                <label htmlFor="diagnostico" className="ui-label">Diagnóstico (obligatorio)</label>
                <textarea
                  id="diagnostico"
                  className="ui-textarea"
                  value={diagnostico}
                  onChange={(e) => setDiagnostico(e.target.value)}
                  placeholder="Ej: Esguince de tobillo derecho grado II"
                  rows={4}
                  required
                />
                <span className="ui-help">Mínimo 5 caracteres.</span>
              </div>

              <div className="ui-field">
                <label htmlFor="indicaciones" className="ui-label">Indicaciones y pautas de alarma</label>
                <textarea
                  id="indicaciones"
                  className="ui-textarea"
                  value={indicaciones}
                  onChange={(e) => setIndicaciones(e.target.value)}
                  placeholder="Ej: Ibuprofeno 400 mg cada 8 h por 3 días. Hielo local 15 min, 3 veces al día."
                  rows={6}
                />
                <span className="ui-help">Opcional. El paciente las ve en su historial.</span>
              </div>

              <button
                type="submit"
                className="ui-btn ui-btn--primary ui-btn--lg ui-btn--block"
                disabled={guardando}
              >
                <FloppyDisk size={18} />
                {guardando ? 'Guardando...' : 'Finalizar atención'}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}
