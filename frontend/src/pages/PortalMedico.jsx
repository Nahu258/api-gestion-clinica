/**
 * PortalMedico.jsx - Panel de control del médico de guardia.
 *
 * - Disponibilidad en tiempo real (Redis): disponible, en consulta, fuera de guardia.
 * - Cola de pacientes derivados por la administración, ordenada por prioridad.
 * - Llamar al paciente pasa la solicitud a EN_ATENCION y abre la ficha clínica.
 * - Agenda semanal de guardias y últimas atenciones cerradas.
 * Se refresca cada 6 segundos.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Buildings,
  CalendarBlank,
  Clock,
  IdentificationCard,
  Megaphone,
  Stethoscope,
  WarningCircle,
} from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext.jsx'
import Navbar from '../components/Navbar.jsx'
import {
  obtenerMiDisponibilidad,
  actualizarMiDisponibilidad,
  obtenerColaMedico,
  iniciarAtencion,
} from '../api/atencion.js'

const ESTADOS = [
  { id: 'DISPONIBLE', label: 'Disponible', dot: 'ui-dot--ok' },
  { id: 'EN_ATENCION', label: 'En consulta', dot: 'ui-dot--warn' },
  { id: 'FUERA_DE_GUARDIA', label: 'Fuera de guardia', dot: '' },
]

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const ORDEN_PRIORIDAD = { urgente: 0, alta: 1, media: 2, baja: 3 }

function haceCuanto(fecha) {
  if (!fecha) return ''
  const min = Math.max(0, Math.floor((Date.now() - new Date(fecha)) / 60000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  return `hace ${Math.floor(min / 60)} h ${min % 60} min`
}

function fechaCorta(fecha) {
  if (!fecha) return ''
  return new Date(fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

// 0 = lunes, igual que DisponibilidadMedico.dia_semana
function diaHoy() {
  return (new Date().getDay() + 6) % 7
}

function proximaGuardia(guardias) {
  if (!guardias.length) return null
  const ahora = new Date()
  const hoy = diaHoy()
  const hhmm = ahora.toTimeString().slice(0, 5)

  const actual = guardias.find((g) => g.dia_semana === hoy && g.hora_inicio <= hhmm && hhmm <= g.hora_fin)
  if (actual) return { enCurso: true, texto: `Hasta las ${actual.hora_fin}` }

  for (let i = 0; i < 8; i += 1) {
    const dia = (hoy + i) % 7
    const delDia = guardias
      .filter((g) => g.dia_semana === dia && (i > 0 || g.hora_inicio > hhmm))
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
    if (delDia.length) {
      const cuando = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : delDia[0].dia_nombre
      return { enCurso: false, texto: `${cuando}, ${delDia[0].hora_inicio}` }
    }
  }
  return null
}

function nombrePaciente(s) {
  return s.paciente_nombre || s.nombre_invitado || 'Paciente sin nombre'
}

export default function PortalMedico() {
  const { usuario } = useAuth()
  const navigate = useNavigate()

  const [perfil, setPerfil] = useState(null)
  const [disponibilidad, setDisponibilidad] = useState(null)
  const [cambiandoEstado, setCambiandoEstado] = useState(false)
  const [cola, setCola] = useState([])
  const [atendidosHoy, setAtendidosHoy] = useState(0)
  const [ultimas, setUltimas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [iniciandoId, setIniciandoId] = useState(null)

  const cargarPerfil = useCallback(async () => {
    try {
      const data = await obtenerMiDisponibilidad()
      setPerfil(data)
      setDisponibilidad(data.disponibilidad_actual)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const cargarCola = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true)
    try {
      const [activos, cerrados] = await Promise.all([
        obtenerColaMedico('derivado,en_atencion'),
        obtenerColaMedico('atendido'),
      ])
      setCola(activos.solicitudes || [])
      setAtendidosHoy(activos.atendidos_hoy || 0)
      setUltimas(
        (cerrados.solicitudes || [])
          .sort((a, b) => new Date(b.atendido_en) - new Date(a.atendido_en))
          .slice(0, 6)
      )
      setError(null)
    } catch (err) {
      if (!silencioso) setError(err.message || 'No se pudo cargar la cola de pacientes.')
    } finally {
      if (!silencioso) setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarPerfil()
    cargarCola()
    const t = setInterval(() => cargarCola(true), 6000)
    return () => clearInterval(t)
  }, [cargarPerfil, cargarCola])

  const cambiarDisponibilidad = async (estado) => {
    if (cambiandoEstado || estado === disponibilidad) return
    const anterior = disponibilidad
    setDisponibilidad(estado)
    setCambiandoEstado(true)
    try {
      const res = await actualizarMiDisponibilidad(estado)
      setDisponibilidad(res.disponibilidad_actual)
    } catch (err) {
      setDisponibilidad(anterior)
      setError(err.message || 'No se pudo actualizar tu estado.')
    } finally {
      setCambiandoEstado(false)
    }
  }

  const llamarPaciente = async (id) => {
    setIniciandoId(id)
    try {
      await iniciarAtencion(id)
      setDisponibilidad('EN_ATENCION')
      navigate(`/portal-medico/atencion/${id}`)
    } catch (err) {
      setError(err.message || 'No se pudo iniciar la atención.')
      setIniciandoId(null)
    }
  }

  const colaOrdenada = useMemo(
    () =>
      [...cola].sort(
        (a, b) =>
          (a.estado === 'en_atencion' ? -1 : 0) - (b.estado === 'en_atencion' ? -1 : 0) ||
          (ORDEN_PRIORIDAD[a.prioridad] ?? 9) - (ORDEN_PRIORIDAD[b.prioridad] ?? 9) ||
          new Date(a.fecha_derivacion || a.creado_en) - new Date(b.fecha_derivacion || b.creado_en)
      ),
    [cola]
  )

  const guardias = perfil?.guardias || []
  const proxima = proximaGuardia(guardias)
  const enConsulta = cola.filter((s) => s.estado === 'en_atencion').length
  const centroNombre = usuario?.centro_nombre || guardias[0]?.centro_nombre

  return (
    <div className="ui-shell">
      <Navbar />

      <main className="ui-page">
        <div className="ui-pagehead">
          <div>
            <h1 className="ui-pagehead__title">{perfil?.nombre || usuario?.medico_nombre || usuario?.nombre || 'Mi guardia'}</h1>
            <div className="ui-pagehead__meta">
              {usuario?.medico_especialidad && <span><Stethoscope size={15} />{usuario.medico_especialidad}</span>}
              {perfil?.matricula && <span className="ui-mono"><IdentificationCard size={15} />{perfil.matricula}</span>}
              {centroNombre && <span><Buildings size={15} />{centroNombre}</span>}
            </div>
          </div>
          <div className="ui-pagehead__actions">
            <div className="ui-segmented" role="group" aria-label="Mi disponibilidad">
              {ESTADOS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={disponibilidad === e.id ? 'is-active' : ''}
                  onClick={() => cambiarDisponibilidad(e.id)}
                  disabled={cambiandoEstado}
                  aria-pressed={disponibilidad === e.id}
                >
                  <span className={`ui-dot ${e.dot}`} />
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="ui-alert" role="alert">
            <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <section className="ui-stats" aria-label="Resumen de mi guardia">
          <div className="ui-stat">
            <div className="ui-stat__label">Derivados esperando</div>
            <div className={`ui-stat__value${cola.length - enConsulta ? ' ui-stat__value--accent' : ''}`}>
              {cargando ? '-' : cola.length - enConsulta}
            </div>
            <div className="ui-stat__hint">
              {cola.some((s) => s.prioridad === 'urgente' && s.estado === 'derivado') ? 'Hay pacientes urgentes' : 'Ordenados por prioridad'}
            </div>
          </div>
          <div className="ui-stat">
            <div className="ui-stat__label">En consulta</div>
            <div className="ui-stat__value">{cargando ? '-' : enConsulta}</div>
          </div>
          <div className="ui-stat">
            <div className="ui-stat__label">Atendidos hoy</div>
            <div className="ui-stat__value">{cargando ? '-' : atendidosHoy}</div>
          </div>
          <div className="ui-stat">
            <div className="ui-stat__label">{proxima?.enCurso ? 'De guardia' : 'Próxima guardia'}</div>
            <div className="ui-stat__value" style={{ fontSize: '1.25rem', marginTop: 12, fontFamily: 'var(--font-ui)', letterSpacing: '-0.02em', fontWeight: 600 }}>
              {proxima ? proxima.texto : 'Sin guardias'}
            </div>
          </div>
        </section>

        <div className="ui-split">
          <section className="ui-card" aria-label="Pacientes derivados">
            <div className="ui-card__head">
              <h2 className="ui-h2">Pacientes derivados</h2>
              <span className="ui-muted" style={{ fontSize: '0.82rem' }}>Se actualiza solo</span>
            </div>

            {cargando && cola.length === 0 ? (
              <div className="ui-rows" aria-busy="true">
                {[0, 1].map((i) => (
                  <div key={i} className="ui-skel-row">
                    <div className="ui-skeleton" style={{ height: 16, width: '45%' }} />
                    <div className="ui-skeleton" style={{ height: 14, width: '90%' }} />
                    <div className="ui-skeleton" style={{ height: 40, width: '100%' }} />
                  </div>
                ))}
              </div>
            ) : colaOrdenada.length === 0 ? (
              <div className="ui-empty">
                <div className="ui-empty__icon"><Stethoscope size={22} /></div>
                <p className="ui-empty__title">No tenés pacientes derivados</p>
                <p className="ui-empty__text">Cuando la administración del centro te derive a alguien, aparece acá con las notas de triage.</p>
              </div>
            ) : (
              <div className="ui-rows">
                {colaOrdenada.map((s) => {
                  const enCurso = s.estado === 'en_atencion'
                  return (
                    <article key={s.id} className={`ui-row ui-row--prio ui-row--prio-${s.prioridad}`}>
                      <div style={{ minWidth: 0 }}>
                        <div className="ui-row__title">
                          {nombrePaciente(s)}
                          {enCurso && <span className="ui-chip ui-chip--ok">En consulta</span>}
                          {s.prioridad === 'urgente' && <span className="ui-chip ui-chip--alert">Urgente</span>}
                          {s.prioridad === 'alta' && <span className="ui-chip ui-chip--warn">Prioridad alta</span>}
                        </div>
                        <p className="ui-row__body">{s.motivo || 'Sin motivo informado.'}</p>
                        {s.observaciones_triage && (
                          <div className="ui-quote" style={{ marginTop: 10 }}>
                            <strong style={{ color: 'var(--ink)' }}>Triage: </strong>{s.observaciones_triage}
                          </div>
                        )}
                        <div className="ui-row__meta">
                          <span><Clock size={14} />Derivado {haceCuanto(s.fecha_derivacion || s.creado_en)}</span>
                          <span>{s.usuario_id ? 'Con historial en la red' : 'Sin cuenta'}</span>
                        </div>
                      </div>
                      <div className="ui-row__aside">
                        {enCurso ? (
                          <button type="button" className="ui-btn ui-btn--dark" onClick={() => navigate(`/portal-medico/atencion/${s.id}`)}>
                            Continuar
                            <ArrowRight size={16} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ui-btn ui-btn--primary"
                            disabled={iniciandoId === s.id}
                            onClick={() => llamarPaciente(s.id)}
                          >
                            <Megaphone size={16} />
                            {iniciandoId === s.id ? 'Llamando...' : 'Llamar'}
                          </button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <aside className="ui-card" aria-label="Últimas atenciones">
            <div className="ui-card__head">
              <h2 className="ui-h2">Últimas atenciones</h2>
            </div>
            {ultimas.length === 0 ? (
              <div className="ui-empty">
                <p className="ui-empty__text">Todavía no cerraste atenciones.</p>
              </div>
            ) : (
              <div className="ui-rows">
                {ultimas.map((s) => (
                  <div key={s.id} style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span className="ui-person__name">{nombrePaciente(s)}</span>
                      <span className="ui-mono ui-muted" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{fechaCorta(s.atendido_en)}</span>
                    </div>
                    <p style={{ fontSize: '0.86rem', color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.45 }}>{s.diagnostico}</p>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>

        <section className="ui-card" style={{ marginTop: 20 }} aria-label="Mis guardias">
          <div className="ui-card__head">
            <h2 className="ui-h2">Mis guardias de la semana</h2>
            <span className="ui-muted" style={{ fontSize: '0.82rem', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <CalendarBlank size={15} />{centroNombre}
            </span>
          </div>
          <div className="ui-card__pad">
            <div className="ui-week">
              {DIAS.map((dia, i) => {
                const delDia = guardias.filter((g) => g.dia_semana === i)
                return (
                  <div key={dia} className={`ui-week__day${i === diaHoy() ? ' is-today' : ''}`}>
                    <div className="ui-week__name">{i === diaHoy() ? `${dia}, hoy` : dia}</div>
                    {delDia.length === 0 ? (
                      <div className="ui-week__none">Libre</div>
                    ) : (
                      delDia.map((g) => (
                        <div key={g.id} className="ui-week__slot">{g.hora_inicio} a {g.hora_fin}</div>
                      ))
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
