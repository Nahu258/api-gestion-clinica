/**
 * PanelCentro.jsx - Panel de control de la administración de un centro de salud.
 *
 * - Resumen de la guardia: en espera, en curso, cerradas hoy y médicos disponibles.
 * - Bandeja de solicitudes ordenada por prioridad, con derivación al especialista.
 * - Equipo médico con disponibilidad en tiempo real (Redis) y carga de cada médico.
 * - Registro de atenciones cerradas con diagnóstico.
 * - El rol ADMIN entra al panel de un centro con ?centro=<id> desde la consola
 *   de administración (Épica 5, AE5-05).
 * Se refresca cada 6 segundos.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowClockwise,
  ChartLineUp,
  CheckCircle,
  Clock,
  MapPin,
  Phone,
  Stethoscope,
  Tray,
  UserCircle,
  Users,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext.jsx'
import Navbar from '../components/Navbar.jsx'
import {
  listarSolicitudesCentro,
  listarEspecialidadesCentro,
  listarEspecialistasDisponiblesCentro,
  derivarSolicitud,
  cambiarEstadoSolicitud,
} from '../api/atencion.js'
import { obtenerCentroPorId } from '../api/centros.js'
import { iniciales } from '../utils/roles.js'

const ORDEN_PRIORIDAD = { urgente: 0, alta: 1, media: 2, baja: 3 }
const PRIORIDADES = [
  { id: 'baja', label: 'Baja' },
  { id: 'media', label: 'Media' },
  { id: 'alta', label: 'Alta' },
  { id: 'urgente', label: 'Urgente' },
]
const EN_ESPERA = ['pendiente', 'aceptado', 'en_camino']
const EN_CURSO = ['derivado', 'en_atencion']

const DISPONIBILIDAD = {
  DISPONIBLE: { label: 'Disponible', dot: 'ui-dot--ok', chip: 'ui-chip--ok' },
  EN_ATENCION: { label: 'En consulta', dot: 'ui-dot--warn', chip: 'ui-chip--warn' },
  FUERA_DE_GUARDIA: { label: 'Fuera de guardia', dot: '', chip: '' },
}

const CHIP_ESTADO = {
  pendiente: 'ui-chip--alert',
  aceptado: 'ui-chip--warn',
  en_camino: 'ui-chip--warn',
  derivado: 'ui-chip--ink',
  en_atencion: 'ui-chip--ok',
  atendido: '',
  cancelado: '',
}

function haceCuanto(fecha) {
  if (!fecha) return ''
  const min = Math.max(0, Math.floor((Date.now() - new Date(fecha)) / 60000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h ${min % 60} min`
  return new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function esHoy(fecha) {
  return fecha && new Date(fecha).toDateString() === new Date().toDateString()
}

function fechaHora(fecha) {
  if (!fecha) return ''
  return new Date(fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

function nombrePaciente(s) {
  return s.paciente_nombre || s.nombre_invitado || 'Paciente sin nombre'
}

export default function PanelCentro() {
  const { usuario, rol, centroId } = useAuth()
  const esAdminGlobal = rol === 'ADMIN'

  const [params] = useSearchParams()
  const centroUrl = Number(params.get('centro')) || null
  const [centro, setCentro] = useState(null)

  const [solicitudes, setSolicitudes] = useState([])
  const [equipo, setEquipo] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [reloj, setReloj] = useState(() => new Date())

  const [tab, setTab] = useState('guardia')
  const [filtro, setFiltro] = useState('espera')

  // Derivación
  const [solicitudTriage, setSolicitudTriage] = useState(null)
  const [especialidades, setEspecialidades] = useState([])
  const [especialidadSel, setEspecialidadSel] = useState('')
  const [doctores, setDoctores] = useState([])
  const [doctorSel, setDoctorSel] = useState('')
  const [prioridadTriage, setPrioridadTriage] = useState('alta')
  const [observaciones, setObservaciones] = useState('')
  const [derivando, setDerivando] = useState(false)
  const [errorModal, setErrorModal] = useState(null)
  const [toast, setToast] = useState(null)

  // El ADMIN no tiene centro propio: lo elige desde /admin/instituciones
  const idCentro = esAdminGlobal ? centroUrl : centroId

  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!idCentro) return
    obtenerCentroPorId(idCentro).then(setCentro).catch(() => setCentro(null))
  }, [idCentro])

  const cargar = useCallback(async (silencioso = false) => {
    if (!idCentro) return
    if (!silencioso) setCargando(true)
    try {
      const [sols, docs] = await Promise.all([
        listarSolicitudesCentro(idCentro),
        listarEspecialistasDisponiblesCentro(idCentro).catch(() => []),
      ])
      setSolicitudes(Array.isArray(sols) ? sols : [])
      setEquipo(Array.isArray(docs) ? docs : [])
      setError(null)
    } catch (err) {
      if (!silencioso) setError(err.message || 'No se pudo cargar la guardia.')
    } finally {
      if (!silencioso) setCargando(false)
    }
  }, [idCentro])

  useEffect(() => {
    cargar()
    const t = setInterval(() => cargar(true), 6000)
    return () => clearInterval(t)
  }, [cargar])

  // ── Datos derivados ───────────────────────────────────────────────────────

  const resumen = useMemo(() => {
    const espera = solicitudes.filter((s) => EN_ESPERA.includes(s.estado))
    const curso = solicitudes.filter((s) => EN_CURSO.includes(s.estado))
    const cerradasHoy = solicitudes.filter((s) => s.estado === 'atendido' && esHoy(s.atendido_en))
    return {
      espera,
      curso,
      cerradasHoy,
      urgentes: espera.filter((s) => s.prioridad === 'urgente').length,
      disponibles: equipo.filter((m) => m.disponibilidad === 'DISPONIBLE').length,
    }
  }, [solicitudes, equipo])

  const bandeja = useMemo(() => {
    const base =
      filtro === 'espera' ? resumen.espera
      : filtro === 'curso' ? resumen.curso
      : solicitudes.filter((s) => s.estado !== 'atendido' && s.estado !== 'cancelado')
    return [...base].sort(
      (a, b) =>
        (ORDEN_PRIORIDAD[a.prioridad] ?? 9) - (ORDEN_PRIORIDAD[b.prioridad] ?? 9) ||
        new Date(a.creado_en) - new Date(b.creado_en)
    )
  }, [filtro, resumen, solicitudes])

  const atendidas = useMemo(
    () =>
      solicitudes
        .filter((s) => s.estado === 'atendido')
        .sort((a, b) => new Date(b.atendido_en) - new Date(a.atendido_en)),
    [solicitudes]
  )

  const cargaPorMedico = useMemo(() => {
    const mapa = {}
    solicitudes.forEach((s) => {
      if (!s.medico_id) return
      mapa[s.medico_id] ??= { curso: 0, hoy: 0, total: 0 }
      if (EN_CURSO.includes(s.estado)) mapa[s.medico_id].curso += 1
      if (s.estado === 'atendido') {
        mapa[s.medico_id].total += 1
        if (esHoy(s.atendido_en)) mapa[s.medico_id].hoy += 1
      }
    })
    return mapa
  }, [solicitudes])

  // ── Derivación ────────────────────────────────────────────────────────────

  const cargarDoctores = async (espId) => {
    let docs = []
    try {
      docs = await listarEspecialistasDisponiblesCentro(idCentro, espId)
    } catch {
      setErrorModal('No se pudieron cargar los médicos de la especialidad.')
    }
    setDoctores(docs)
    const libre = docs.find((d) => d.disponibilidad === 'DISPONIBLE') || docs[0]
    setDoctorSel(libre ? String(libre.id) : '')
  }

  const abrirDerivacion = async (solicitud) => {
    setSolicitudTriage(solicitud)
    setErrorModal(null)
    setPrioridadTriage(solicitud.prioridad || 'alta')
    setObservaciones('')
    setDoctores([])
    try {
      const esps = await listarEspecialidadesCentro(idCentro)
      setEspecialidades(esps)
      if (esps.length) {
        setEspecialidadSel(String(esps[0].id))
        await cargarDoctores(esps[0].id)
      }
    } catch {
      setErrorModal('No se pudieron cargar las especialidades del centro.')
    }
  }

  const confirmarDerivacion = async (e) => {
    e.preventDefault()
    if (!especialidadSel || !doctorSel) {
      setErrorModal('Elegí la especialidad y el médico.')
      return
    }
    setDerivando(true)
    setErrorModal(null)
    try {
      await derivarSolicitud(solicitudTriage.id, {
        especialidad_id: Number(especialidadSel),
        medico_id: Number(doctorSel),
        prioridad: prioridadTriage,
        observaciones,
      })
      const medico = doctores.find((d) => String(d.id) === doctorSel)
      setToast(`${nombrePaciente(solicitudTriage)} derivado a ${medico?.nombre || 'especialista'}.`)
      setTimeout(() => setToast(null), 4000)
      setSolicitudTriage(null)
      cargar(true)
    } catch (err) {
      setErrorModal(err.message || 'No se pudo derivar la solicitud.')
    } finally {
      setDerivando(false)
    }
  }

  const avisar = (texto) => {
    setToast(texto)
    setTimeout(() => setToast(null), 4000)
  }

  // El centro confirma que recibió el aviso: el paciente lo ve en su seguimiento
  const aceptar = async (solicitud) => {
    try {
      await cambiarEstadoSolicitud(solicitud.id, 'aceptado')
      avisar(`Aviso de ${nombrePaciente(solicitud)} confirmado.`)
      cargar(true)
    } catch (err) {
      setError(err.message || 'No se pudo confirmar el aviso.')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const nombreCentro = centro?.nombre || usuario?.centro_nombre || 'Centro de salud'

  if (!idCentro) {
    return (
      <div className="ui-shell">
        <Navbar />
        <main className="ui-page">
          <div className="ui-card">
            <div className="ui-empty">
              <div className="ui-empty__icon"><Tray size={22} /></div>
              <p className="ui-empty__title">
                {esAdminGlobal ? 'Elegí una institución' : 'Tu cuenta no tiene un centro asignado'}
              </p>
              <p className="ui-empty__text">
                {esAdminGlobal
                  ? 'El panel de guardia se abre desde el listado o el detalle de cada institución.'
                  : 'Pedile al administrador general que te asigne a una institución.'}
              </p>
              {esAdminGlobal && (
                <Link to="/admin/instituciones" className="ui-btn ui-btn--dark" style={{ marginTop: 16 }}>
                  Ir a instituciones
                </Link>
              )}
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="ui-shell">
      <Navbar />

      <main className="ui-page">
        <div className="ui-pagehead">
          <div>
            <h1 className="ui-pagehead__title">{nombreCentro}</h1>
            <div className="ui-pagehead__meta">
              {centro?.direccion && <span><MapPin size={15} />{centro.direccion}</span>}
              {centro?.telefono && <span><Phone size={15} />{centro.telefono}</span>}
              <span><Clock size={15} />Guardia al {reloj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            </div>
          </div>
          <div className="ui-pagehead__actions">
            {esAdminGlobal && (
              <Link to={`/admin/instituciones/${idCentro}`} className="ui-btn ui-btn--quiet">
                Ver institución
              </Link>
            )}
            <button type="button" className="ui-btn" onClick={() => cargar(false)}>
              <ArrowClockwise size={16} />
              Actualizar
            </button>
            <Link to={`/panel-centro/gestion${esAdminGlobal ? `?centro=${idCentro}` : ''}`} className="ui-btn ui-btn--dark">
              <ChartLineUp size={16} />
              Tablero
            </Link>
          </div>
        </div>

        {error && (
          <div className="ui-alert" role="alert">
            <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <section className="ui-stats" aria-label="Resumen de la guardia">
          <div className="ui-stat">
            <div className="ui-stat__label">En espera de triage</div>
            <div className={`ui-stat__value${resumen.espera.length ? ' ui-stat__value--accent' : ''}`}>
              {cargando ? '-' : resumen.espera.length}
            </div>
            <div className="ui-stat__hint">
              {resumen.urgentes ? `${resumen.urgentes} con prioridad urgente` : 'Sin urgencias pendientes'}
            </div>
          </div>
          <div className="ui-stat">
            <div className="ui-stat__label">Derivados o en consulta</div>
            <div className="ui-stat__value">{cargando ? '-' : resumen.curso.length}</div>
          </div>
          <div className="ui-stat">
            <div className="ui-stat__label">Cerradas hoy</div>
            <div className="ui-stat__value">{cargando ? '-' : resumen.cerradasHoy.length}</div>
          </div>
          <div className="ui-stat">
            <div className="ui-stat__label">Médicos disponibles</div>
            <div className="ui-stat__value">
              {cargando ? '-' : resumen.disponibles}
              <span className="ui-muted" style={{ fontSize: '1rem' }}> / {equipo.length}</span>
            </div>
          </div>
        </section>

        <div className="ui-tabs" role="tablist">
          {[
            { id: 'guardia', label: 'Guardia', count: resumen.espera.length + resumen.curso.length },
            { id: 'equipo', label: 'Equipo médico', count: equipo.length },
            { id: 'atenciones', label: 'Atenciones cerradas', count: atendidas.length },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`ui-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              <span className="ui-tab__count">{t.count}</span>
            </button>
          ))}
        </div>

        {tab === 'guardia' && (
          <div className="ui-split">
            <section className="ui-card" aria-label="Bandeja de solicitudes">
              <div className="ui-card__head">
                <h2 className="ui-h2">Bandeja</h2>
                <div className="ui-segmented" role="group" aria-label="Filtro">
                  {[
                    { id: 'espera', label: 'En espera' },
                    { id: 'curso', label: 'En curso' },
                    { id: 'todas', label: 'Todas' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={filtro === f.id ? 'is-active' : ''}
                      onClick={() => setFiltro(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {cargando && solicitudes.length === 0 ? (
                <FilasCargando />
              ) : bandeja.length === 0 ? (
                <div className="ui-empty">
                  <div className="ui-empty__icon"><Tray size={22} /></div>
                  <p className="ui-empty__title">No hay solicitudes en esta vista</p>
                  <p className="ui-empty__text">Los avisos nuevos de pacientes aparecen acá sin recargar la página.</p>
                </div>
              ) : (
                <div className="ui-rows">
                  {bandeja.map((s) => (
                    <FilaSolicitud key={s.id} s={s} onDerivar={() => abrirDerivacion(s)} onAceptar={() => aceptar(s)} />
                  ))}
                </div>
              )}
            </section>

            <aside className="ui-card" aria-label="Médicos de guardia">
              <div className="ui-card__head">
                <h2 className="ui-h2">Médicos ahora</h2>
                <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={() => setTab('equipo')}>
                  Ver equipo
                </button>
              </div>
              {equipo.length === 0 ? (
                <div className="ui-empty">
                  <p className="ui-empty__text">Este centro todavía no tiene médicos asignados.</p>
                </div>
              ) : (
                <div className="ui-rows">
                  {equipo.map((m) => {
                    const d = DISPONIBILIDAD[m.disponibilidad] || DISPONIBILIDAD.FUERA_DE_GUARDIA
                    return (
                      <div key={m.id} className="ui-row" style={{ padding: '12px 20px' }}>
                        <div className="ui-person">
                          <span className="ui-initials">{iniciales(m.nombre)}</span>
                          <div style={{ minWidth: 0 }}>
                            <div className="ui-person__name">{m.nombre}</div>
                            <div className="ui-person__sub">{m.especialidad}</div>
                          </div>
                        </div>
                        <span className="ui-row__aside" title={d.label} style={{ fontSize: '0.8rem', color: 'var(--ink-3)' }}>
                          <span className={`ui-dot ${d.dot}`} />
                          {d.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </aside>
          </div>
        )}

        {tab === 'equipo' && (
          <section className="ui-card" aria-label="Equipo médico">
            {equipo.length === 0 ? (
              <div className="ui-empty">
                <div className="ui-empty__icon"><Users size={22} /></div>
                <p className="ui-empty__title">Sin médicos asignados</p>
                <p className="ui-empty__text">La asignación de médicos por especialidad la hace la administración general.</p>
              </div>
            ) : (
              <div className="ui-table-wrap">
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th>Médico</th>
                      <th>Especialidad</th>
                      <th>Matrícula</th>
                      <th>Estado</th>
                      <th style={{ textAlign: 'right' }}>En curso</th>
                      <th style={{ textAlign: 'right' }}>Cerradas hoy</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipo.map((m) => {
                      const d = DISPONIBILIDAD[m.disponibilidad] || DISPONIBILIDAD.FUERA_DE_GUARDIA
                      const carga = cargaPorMedico[m.id] || { curso: 0, hoy: 0, total: 0 }
                      return (
                        <tr key={m.id}>
                          <td>
                            <div className="ui-person">
                              <span className="ui-initials">{iniciales(m.nombre)}</span>
                              <span className="ui-person__name">{m.nombre}</span>
                            </div>
                          </td>
                          <td>{m.especialidad}</td>
                          <td className="ui-mono">{m.matricula}</td>
                          <td><span className={`ui-chip ${d.chip}`}>{d.label}</span></td>
                          <td className="ui-mono" style={{ textAlign: 'right' }}>{carga.curso}</td>
                          <td className="ui-mono" style={{ textAlign: 'right' }}>{carga.hoy}</td>
                          <td className="ui-mono" style={{ textAlign: 'right' }}>{carga.total}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'atenciones' && (
          <section className="ui-card" aria-label="Atenciones cerradas">
            {atendidas.length === 0 ? (
              <div className="ui-empty">
                <div className="ui-empty__icon"><CheckCircle size={22} /></div>
                <p className="ui-empty__title">Todavía no hay atenciones cerradas</p>
                <p className="ui-empty__text">Cuando un médico cierra una consulta con diagnóstico, queda registrada acá.</p>
              </div>
            ) : (
              <div className="ui-table-wrap">
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Paciente</th>
                      <th>Atendió</th>
                      <th>Diagnóstico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atendidas.map((s) => (
                      <tr key={s.id}>
                        <td className="ui-mono" style={{ whiteSpace: 'nowrap' }}>{fechaHora(s.atendido_en)}</td>
                        <td style={{ minWidth: 160 }}>
                          <div className="ui-person__name">{nombrePaciente(s)}</div>
                          <div className="ui-person__sub">{s.usuario_id ? 'Con cuenta' : 'Sin cuenta'}</div>
                        </td>
                        <td style={{ minWidth: 160 }}>
                          <div>{s.medico_nombre || '-'}</div>
                          <div className="ui-person__sub">{s.especialidad_nombre}</div>
                        </td>
                        <td style={{ minWidth: 260, color: 'var(--ink-2)' }}>{s.diagnostico || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>

      {solicitudTriage && (
        <div className="ui-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setSolicitudTriage(null)}>
          <div className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="derivar-title">
            <div className="ui-dialog__head">
              <div>
                <h2 id="derivar-title" className="ui-dialog__title">Derivar a especialista</h2>
                <p className="ui-muted" style={{ fontSize: '0.88rem', marginTop: 4 }}>
                  {nombrePaciente(solicitudTriage)}, solicitud #{solicitudTriage.id}
                </p>
              </div>
              <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={() => setSolicitudTriage(null)} aria-label="Cerrar">
                <X size={16} />
              </button>
            </div>

            <form className="ui-dialog__body ui-form" onSubmit={confirmarDerivacion}>
              <div className="ui-quote">{solicitudTriage.motivo || 'Sin motivo informado.'}</div>

              {errorModal && (
                <div className="ui-alert" role="alert" style={{ marginBottom: 0 }}>
                  <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{errorModal}</span>
                </div>
              )}

              <div className="ui-field">
                <label className="ui-label" htmlFor="esp">Especialidad</label>
                <select
                  id="esp"
                  className="ui-select"
                  value={especialidadSel}
                  onChange={(e) => {
                    setEspecialidadSel(e.target.value)
                    cargarDoctores(e.target.value)
                  }}
                >
                  {especialidades.map((esp) => <option key={esp.id} value={esp.id}>{esp.nombre}</option>)}
                </select>
              </div>

              <div className="ui-field">
                <label className="ui-label" htmlFor="doc">Médico</label>
                {doctores.length === 0 ? (
                  <p className="ui-error-text">No hay médicos de esta especialidad en el centro.</p>
                ) : (
                  <select id="doc" className="ui-select" value={doctorSel} onChange={(e) => setDoctorSel(e.target.value)}>
                    {doctores.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre} ({(DISPONIBILIDAD[d.disponibilidad] || DISPONIBILIDAD.FUERA_DE_GUARDIA).label.toLowerCase()})
                      </option>
                    ))}
                  </select>
                )}
                <span className="ui-help">Se sugiere primero a quien está disponible.</span>
              </div>

              <div className="ui-field">
                <span className="ui-label" id="prio-label">Prioridad</span>
                <div className="ui-choice-grid" role="group" aria-labelledby="prio-label">
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`ui-choice${prioridadTriage === p.id ? ' is-active' : ''}`}
                      onClick={() => setPrioridadTriage(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ui-field">
                <label className="ui-label" htmlFor="obs">Notas de triage</label>
                <textarea
                  id="obs"
                  className="ui-textarea"
                  rows={3}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Signos vitales, antecedentes, lo que vea el médico al recibirlo"
                />
              </div>

              <div className="ui-dialog__foot">
                <button type="button" className="ui-btn ui-btn--quiet" onClick={() => setSolicitudTriage(null)}>Cancelar</button>
                <button type="submit" className="ui-btn ui-btn--primary" disabled={derivando || doctores.length === 0}>
                  {derivando ? 'Derivando...' : 'Derivar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="ui-toast" role="status">
          <CheckCircle size={18} />
          {toast}
        </div>
      )}
    </div>
  )
}

function FilaSolicitud({ s, onDerivar, onAceptar }) {
  const puedeDerivar = EN_ESPERA.includes(s.estado)
  return (
    <article className={`ui-row ui-row--prio ui-row--prio-${s.prioridad}`}>
      <div style={{ minWidth: 0 }}>
        <div className="ui-row__title">
          {nombrePaciente(s)}
          <span className={`ui-chip ${CHIP_ESTADO[s.estado] || ''}`}>{s.estado_legible || s.estado}</span>
          {s.prioridad === 'urgente' && <span className="ui-chip ui-chip--alert">Urgente</span>}
          {s.prioridad === 'alta' && <span className="ui-chip ui-chip--warn">Prioridad alta</span>}
        </div>
        <p className="ui-row__body">{s.motivo || 'Sin motivo informado.'}</p>
        <div className="ui-row__meta">
          <span><Clock size={14} />{haceCuanto(s.creado_en)}</span>
          <span>{s.modo === 'aviso' ? 'Viene en camino' : 'Pide turno de guardia'}</span>
          <span><UserCircle size={14} />{s.usuario_id ? 'Con cuenta' : 'Sin cuenta'}</span>
          {s.telefono_invitado && (
            <a href={`tel:${s.telefono_invitado}`} style={{ color: 'inherit', display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              <Phone size={14} />{s.telefono_invitado}
            </a>
          )}
          {s.medico_nombre && (
            <span style={{ color: 'var(--ink)' }}>
              <Stethoscope size={14} />{s.medico_nombre}, {s.especialidad_nombre}
            </span>
          )}
        </div>
      </div>
      {puedeDerivar && (
        <div className="ui-row__aside">
          {s.estado === 'pendiente' && (
            <button type="button" className="ui-btn ui-btn--sm" onClick={onAceptar}>
              Confirmar aviso
            </button>
          )}
          <button type="button" className="ui-btn ui-btn--sm ui-btn--dark" onClick={onDerivar}>
            Derivar
          </button>
        </div>
      )}
    </article>
  )
}

function FilasCargando() {
  return (
    <div className="ui-rows" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="ui-skel-row">
          <div className="ui-skeleton" style={{ height: 16, width: '40%' }} />
          <div className="ui-skeleton" style={{ height: 14, width: '85%' }} />
          <div className="ui-skeleton" style={{ height: 12, width: '30%' }} />
        </div>
      ))}
    </div>
  )
}
