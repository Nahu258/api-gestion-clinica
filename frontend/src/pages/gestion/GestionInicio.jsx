/**
 * GestionInicio.jsx - Tablero del administrador de la institución.
 *
 * Indicadores del centro para el período elegido (hoy, 7 días, 30 días o
 * todo el historial):
 *   - Demanda: solicitudes recibidas, atendidas, canceladas y en curso.
 *   - Tiempos: espera hasta la derivación y tiempo desde la derivación al cierre.
 *   - Métricas por médico: derivaciones, atenciones cerradas, casos en curso,
 *     tiempo de resolución, horas de guardia y disponibilidad actual.
 *   - Distribución por especialidad y por prioridad de triage.
 *   - Demanda por hora del día y por día.
 *
 * Todo se calcula en el navegador a partir de las solicitudes del centro.
 * El backend no registra el momento en que el médico inicia la consulta, por
 * eso el tiempo de atención se mide desde la derivación hasta el cierre.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowClockwise,
  ArrowRight,
  Buildings,
  CalendarDots,
  FirstAidKit,
  SquaresFour,
  Stethoscope,
  WarningCircle,
} from '@phosphor-icons/react'
import { useCentroGestion } from './GestionLayout.jsx'
import DataTable from '../../components/ui/DataTable.jsx'
import Columnas from '../../components/ui/Columnas.jsx'
import { listarEspecialistasDisponiblesCentro, listarSolicitudesCentro } from '../../api/atencion.js'
import { listarGuardias, listarPlantel } from '../../api/admin.js'
import { iniciales } from '../../utils/roles.js'
import {
  EN_CURSO,
  EN_ESPERA,
  ESTADO,
  PRIORIDADES,
  duracion,
  fechaHora,
  mediana,
  minutosEntre,
} from '../../utils/solicitudes.js'

const PERIODOS = [
  { id: 'hoy', label: 'Hoy', dias: 1 },
  { id: '7d', label: '7 días', dias: 7 },
  { id: '30d', label: '30 días', dias: 30 },
  { id: 'todo', label: 'Todo', dias: null },
]

const DISPONIBILIDAD = {
  DISPONIBLE: { label: 'Disponible', chip: 'ui-chip--ok', orden: 0 },
  EN_ATENCION: { label: 'En consulta', chip: 'ui-chip--warn', orden: 1 },
  FUERA_DE_GUARDIA: { label: 'Fuera de guardia', chip: '', orden: 2 },
}

const ACCESOS = [
  { seccion: 'medicos', titulo: 'Médicos', texto: 'Altas, especialidades y cuentas.', icon: Stethoscope },
  { seccion: 'guardias', titulo: 'Guardias', texto: 'Cronograma semanal y cobertura.', icon: CalendarDots },
  { seccion: 'especialidades', titulo: 'Especialidades', texto: 'Qué ofrece el centro.', icon: FirstAidKit },
  { seccion: 'institucion', titulo: 'Datos del centro', texto: 'Lo que ve el público en el mapa.', icon: Buildings },
]

const inicioDelDia = (fecha) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())

function horasDeGuardia(g) {
  const [hi, mi] = g.hora_inicio.split(':').map(Number)
  const [hf, mf] = g.hora_fin.split(':').map(Number)
  let min = hf * 60 + mf - (hi * 60 + mi)
  if (min <= 0) min += 24 * 60 // la guardia cruza la medianoche
  return min / 60
}

const porcentaje = (parte, total) => (total ? `${Math.round((parte / total) * 100)}%` : '-')

export default function GestionInicio() {
  const { ruta, centroId, centroNombre, esAdmin, sufijo } = useCentroGestion()

  const [periodo, setPeriodo] = useState('7d')
  const [solicitudes, setSolicitudes] = useState(null)
  const [plantel, setPlantel] = useState([])
  const [equipo, setEquipo] = useState([])
  const [guardias, setGuardias] = useState([])
  const [error, setError] = useState(null)
  const [actualizando, setActualizando] = useState(false)
  const [actualizado, setActualizado] = useState(null)

  const cargar = useCallback(async () => {
    if (!centroId) return
    setActualizando(true)
    try {
      const [sols, medicos, disponibles, turnos] = await Promise.all([
        listarSolicitudesCentro(centroId),
        listarPlantel(centroId).catch(() => null),
        listarEspecialistasDisponiblesCentro(centroId).catch(() => []),
        listarGuardias(centroId).catch(() => null),
      ])
      setSolicitudes(Array.isArray(sols) ? sols : [])
      setPlantel(medicos?.resultados || [])
      setEquipo(disponibles)
      setGuardias(turnos?.guardias || [])
      setActualizado(new Date())
      setError(null)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los indicadores.')
    } finally {
      setActualizando(false)
    }
  }, [centroId])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Solicitudes creadas dentro del período
  const delPeriodo = useMemo(() => {
    if (!solicitudes) return []
    const dias = PERIODOS.find((p) => p.id === periodo)?.dias
    if (!dias) return solicitudes
    const desde = inicioDelDia(new Date())
    desde.setDate(desde.getDate() - (dias - 1))
    return solicitudes.filter((s) => new Date(s.creado_en) >= desde)
  }, [solicitudes, periodo])

  const kpis = useMemo(() => {
    const atendidas = delPeriodo.filter((s) => s.estado === ESTADO.ATENDIDO)
    const canceladas = delPeriodo.filter((s) => s.estado === ESTADO.CANCELADO)
    const todas = solicitudes || []
    return {
      recibidas: delPeriodo.length,
      atendidas: atendidas.length,
      canceladas: canceladas.length,
      enEspera: todas.filter((s) => EN_ESPERA.includes(s.estado)).length,
      enCurso: todas.filter((s) => EN_CURSO.includes(s.estado)).length,
      espera: mediana(delPeriodo.map((s) => minutosEntre(s.creado_en, s.fecha_derivacion))),
      resolucion: mediana(atendidas.map((s) => minutosEntre(s.fecha_derivacion, s.atendido_en))),
      total: mediana(atendidas.map((s) => minutosEntre(s.creado_en, s.atendido_en))),
    }
  }, [delPeriodo, solicitudes])

  // Métricas por médico: plantel del centro + cualquier médico con derivaciones
  const medicos = useMemo(() => {
    const filas = new Map()
    const fila = (id, nombre) => {
      if (!filas.has(id)) {
        filas.set(id, {
          id, nombre: nombre || `Médico ${id}`, matricula: '', especialidades: '', activo: true,
          derivadas: 0, atendidas: 0, enCurso: 0, tiempos: [], ultima: null, horas: 0, disponibilidad: null,
        })
      }
      return filas.get(id)
    }

    plantel.forEach((m) => {
      const f = fila(m.id, m.nombre)
      f.matricula = m.matricula
      f.activo = m.activo
      f.especialidades = (m.especialidades || []).filter((e) => e.activo).map((e) => e.nombre).join(', ')
    })

    equipo.forEach((m) => {
      const f = fila(m.id, m.nombre)
      f.disponibilidad = m.disponibilidad
      if (!f.matricula) f.matricula = m.matricula
      if (!f.especialidades) f.especialidades = m.especialidad
    })

    guardias.forEach((g) => {
      if (g.en_guardia_activa !== false) fila(g.medico_id, g.medico_nombre).horas += horasDeGuardia(g)
    })

    delPeriodo.forEach((s) => {
      if (!s.medico_id) return
      const f = fila(s.medico_id, s.medico_nombre)
      f.derivadas += 1
      if (s.estado === ESTADO.ATENDIDO) {
        f.atendidas += 1
        const t = minutosEntre(s.fecha_derivacion, s.atendido_en)
        if (t != null) f.tiempos.push(t)
        if (!f.ultima || new Date(s.atendido_en) > new Date(f.ultima)) f.ultima = s.atendido_en
      }
    })

    ;(solicitudes || []).forEach((s) => {
      if (s.medico_id && EN_CURSO.includes(s.estado)) fila(s.medico_id, s.medico_nombre).enCurso += 1
    })

    return [...filas.values()].map((f) => ({ ...f, resolucion: mediana(f.tiempos) }))
  }, [plantel, equipo, guardias, delPeriodo, solicitudes])

  const totalAtendidas = kpis.atendidas

  const porEspecialidad = useMemo(() => {
    const conteo = new Map()
    delPeriodo.forEach((s) => {
      if (!s.especialidad_nombre) return
      const e = conteo.get(s.especialidad_nombre) || { nombre: s.especialidad_nombre, derivadas: 0, atendidas: 0 }
      e.derivadas += 1
      if (s.estado === ESTADO.ATENDIDO) e.atendidas += 1
      conteo.set(s.especialidad_nombre, e)
    })
    return [...conteo.values()].sort((a, b) => b.derivadas - a.derivadas)
  }, [delPeriodo])

  const porPrioridad = useMemo(() => {
    const derivadas = delPeriodo.filter((s) => s.fecha_derivacion)
    return [...PRIORIDADES].reverse().map((p) => ({
      ...p,
      cantidad: derivadas.filter((s) => s.prioridad === p.id).length,
      total: derivadas.length,
    }))
  }, [delPeriodo])

  const porHora = useMemo(() => {
    const horas = Array.from({ length: 24 }, (_, h) => ({
      etiqueta: String(h).padStart(2, '0'),
      detalle: `De ${String(h).padStart(2, '0')}:00 a ${String(h).padStart(2, '0')}:59`,
      valor: 0,
    }))
    delPeriodo.forEach((s) => {
      horas[new Date(s.creado_en).getHours()].valor += 1
    })
    return horas
  }, [delPeriodo])

  const porDia = useMemo(() => {
    const dias = periodo === '30d' || periodo === 'todo' ? 30 : 14
    const hoy = inicioDelDia(new Date())
    const serie = Array.from({ length: dias }, (_, i) => {
      const d = new Date(hoy)
      d.setDate(hoy.getDate() - (dias - 1 - i))
      return {
        clave: d.toDateString(),
        etiqueta: d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
        detalle: d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }),
        valor: 0,
      }
    })
    const indice = new Map(serie.map((d, i) => [d.clave, i]))
    ;(solicitudes || []).forEach((s) => {
      const i = indice.get(new Date(s.creado_en).toDateString())
      if (i != null) serie[i].valor += 1
    })
    return serie
  }, [solicitudes, periodo])

  const maxEspecialidad = Math.max(1, ...porEspecialidad.map((e) => e.derivadas))
  const etiquetaPeriodo = PERIODOS.find((p) => p.id === periodo)?.label.toLowerCase()
  const cargando = solicitudes === null && !error
  const v = (n) => (cargando ? '-' : n)

  const columnas = [
    {
      key: 'nombre',
      label: 'Médico',
      sortable: true,
      render: (m) => (
        <div className="ui-person tb-medico">
          <span className="ui-initials">{iniciales(m.nombre)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="ui-person__name">{m.nombre}</div>
            <div className="ui-person__sub">{[m.especialidades, m.matricula].filter(Boolean).join(', ')}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'disponibilidad',
      label: 'Ahora',
      sortable: true,
      sortValue: (m) => DISPONIBILIDAD[m.disponibilidad]?.orden ?? 3,
      render: (m) => {
        if (!m.activo) return <span className="ui-chip">Inactivo</span>
        const d = DISPONIBILIDAD[m.disponibilidad]
        return d ? <span className={`ui-chip ${d.chip}`}>{d.label}</span> : <span className="ui-muted">Sin dato</span>
      },
    },
    { key: 'enCurso', label: 'En curso', sortable: true, align: 'right', render: (m) => <span className={`ui-mono${m.enCurso ? ' ui-text-accent' : ''}`}>{m.enCurso}</span> },
    { key: 'derivadas', label: 'Derivaciones', mobileLabel: 'Derivadas', sortable: true, align: 'right', render: (m) => <span className="ui-mono">{m.derivadas}</span> },
    {
      key: 'atendidas',
      label: 'Atendidas',
      sortable: true,
      align: 'right',
      render: (m) => (
        <span className="ui-mono ui-nowrap">
          {m.atendidas}
          <span className="ui-muted"> ({porcentaje(m.atendidas, totalAtendidas)})</span>
        </span>
      ),
    },
    {
      key: 'resolucion',
      label: 'Derivación a cierre',
      mobileLabel: 'Resolución',
      sortable: true,
      align: 'right',
      sortValue: (m) => m.resolucion ?? Number.MAX_SAFE_INTEGER,
      render: (m) => <span className="ui-mono ui-nowrap">{duracion(m.resolucion)}</span>,
    },
    {
      key: 'horas',
      label: 'Guardia semanal',
      mobileLabel: 'Guardia',
      sortable: true,
      align: 'right',
      render: (m) => <span className="ui-mono ui-nowrap">{m.horas ? `${Math.round(m.horas)} h` : '-'}</span>,
    },
    {
      key: 'ultima',
      label: 'Última atención',
      mobileLabel: 'Última',
      sortable: true,
      align: 'right',
      sortValue: (m) => (m.ultima ? new Date(m.ultima).getTime() : 0),
      render: (m) => <span className="ui-mono ui-nowrap">{m.ultima ? fechaHora(m.ultima) : '-'}</span>,
    },
  ]

  return (
    <>
      <div className="ui-pagehead">
        <div>
          <h1 className="ui-pagehead__title">Tablero del centro</h1>
          <div className="ui-pagehead__meta">
            <span>{centroNombre || 'Indicadores de la institución'}</span>
            {actualizado && (
              <span>
                Actualizado a las {actualizado.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            )}
          </div>
        </div>
        <div className="ui-pagehead__actions">
          <div className="ui-segmented" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button key={p.id} type="button" className={periodo === p.id ? 'is-active' : ''} aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" className="ui-btn ui-btn--icon" onClick={cargar} disabled={actualizando} aria-label="Actualizar indicadores">
            {actualizando ? <span className="ui-spinner" aria-hidden="true" /> : <ArrowClockwise size={16} />}
          </button>
          <Link to={`/panel-centro${sufijo}`} className="ui-btn ui-btn--dark">
            <SquaresFour size={16} />
            Ir a la guardia
          </Link>
        </div>
      </div>

      {error && (
        <div className="ui-alert" role="alert">
          <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{solicitudes ? `No se pudo actualizar: ${error} Se muestran los últimos datos.` : error}</span>
        </div>
      )}

      <section className="ui-kpis ui-kpis--3x2" style={{ '--kpis': 3 }} aria-label="Indicadores del período">
        <div className="ui-stat">
          <div className="ui-stat__label">Solicitudes recibidas</div>
          <div className="ui-stat__value">{v(kpis.recibidas)}</div>
          <div className="ui-stat__hint">{periodo === 'todo' ? 'En todo el historial' : `En ${periodo === 'hoy' ? 'el día' : `los últimos ${etiquetaPeriodo}`}`}</div>
        </div>
        <div className="ui-stat">
          <div className="ui-stat__label">Atenciones cerradas</div>
          <div className="ui-stat__value">{v(kpis.atendidas)}</div>
          <div className="ui-stat__hint">
            {cargando ? ' ' : `${porcentaje(kpis.atendidas, kpis.recibidas)} de lo recibido, ${kpis.canceladas} ${kpis.canceladas === 1 ? 'cancelada' : 'canceladas'}`}
          </div>
        </div>
        <div className="ui-stat">
          <div className="ui-stat__label">En la guardia ahora</div>
          <div className={`ui-stat__value${kpis.enEspera ? ' ui-stat__value--accent' : ''}`}>{v(kpis.enEspera + kpis.enCurso)}</div>
          <div className="ui-stat__hint">{cargando ? ' ' : `${kpis.enEspera} esperando triage, ${kpis.enCurso} con médico`}</div>
        </div>
        <div className="ui-stat">
          <div className="ui-stat__label">Espera hasta la derivación</div>
          <div className="ui-stat__value">{v(duracion(kpis.espera))}</div>
          <div className="ui-stat__hint">Mediana, desde el aviso</div>
        </div>
        <div className="ui-stat">
          <div className="ui-stat__label">De la derivación al cierre</div>
          <div className="ui-stat__value">{v(duracion(kpis.resolucion))}</div>
          <div className="ui-stat__hint">Mediana por atención</div>
        </div>
        <div className="ui-stat">
          <div className="ui-stat__label">Tiempo total en guardia</div>
          <div className="ui-stat__value">{v(duracion(kpis.total))}</div>
          <div className="ui-stat__hint">Mediana, del aviso al cierre</div>
        </div>
      </section>

      <section className="tb-seccion" aria-labelledby="tb-medicos">
        <div className="ui-sectionhead">
          <h2 id="tb-medicos" className="ui-h2">Métricas por médico</h2>
          <Link to={ruta('medicos')} className="ui-btn ui-btn--quiet ui-btn--sm">
            Gestionar plantel
            <ArrowRight size={14} />
          </Link>
        </div>
        <DataTable
          columns={columnas}
          rows={medicos}
          loading={cargando}
          error={!solicitudes ? error : null}
          onRetry={cargar}
          initialSort={{ key: 'atendidas', dir: 'desc' }}
          caption="Métricas por médico en el período elegido"
          empty={{ title: 'Este centro todavía no tiene médicos', text: 'Registrá médicos y asignales una especialidad para ver su actividad.' }}
        />
        <p className="ui-help tb-nota">
          Derivaciones, atendidas y tiempos corresponden al período elegido. "En curso" y "Ahora" muestran el estado actual.
        </p>
      </section>

      <div className="tb-grid">
        <section className="ui-card tb-panel" aria-labelledby="tb-hora">
          <h2 id="tb-hora" className="ui-h2">Solicitudes por hora del día</h2>
          <p className="ui-help">Cuándo llega la demanda. Sirve para armar el cronograma de guardias.</p>
          {delPeriodo.length === 0 ? (
            <p className="tb-vacio">{cargando ? 'Cargando' : 'Sin solicitudes en el período.'}</p>
          ) : (
            <Columnas titulo="Solicitudes por hora del día" datos={porHora} unidad="solicitudes" cadaCuantas={3} />
          )}
        </section>

        <section className="ui-card tb-panel" aria-labelledby="tb-dia">
          <h2 id="tb-dia" className="ui-h2">Solicitudes por día</h2>
          <p className="ui-help">Últimos {porDia.length} días.</p>
          {porDia.every((d) => d.valor === 0) ? (
            <p className="tb-vacio">{cargando ? 'Cargando' : 'Sin solicitudes en estos días.'}</p>
          ) : (
            <Columnas titulo="Solicitudes por día" datos={porDia} unidad="solicitudes" cadaCuantas={porDia.length > 14 ? 5 : 2} />
          )}
        </section>

        <section className="ui-card tb-panel" aria-labelledby="tb-esp">
          <h2 id="tb-esp" className="ui-h2">Derivaciones por especialidad</h2>
          {porEspecialidad.length === 0 ? (
            <p className="tb-vacio">{cargando ? 'Cargando' : 'Sin derivaciones en el período.'}</p>
          ) : (
            <ul className="tb-hbars">
              {porEspecialidad.map((e) => (
                <li key={e.nombre} title={`${e.derivadas} derivadas, ${e.atendidas} atendidas`}>
                  <span className="tb-hbars__nombre">{e.nombre}</span>
                  <span className="tb-hbars__pista">
                    <span className="tb-hbars__barra" style={{ width: `${(e.derivadas / maxEspecialidad) * 100}%` }} />
                  </span>
                  <span className="tb-hbars__valor ui-mono">{e.derivadas}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ui-card tb-panel" aria-labelledby="tb-prio">
          <h2 id="tb-prio" className="ui-h2">Prioridad de triage</h2>
          <p className="ui-help">Sobre las solicitudes derivadas del período.</p>
          <dl className="tb-prio">
            {porPrioridad.map((p) => (
              <div key={p.id}>
                <dt>{p.label}</dt>
                <dd>
                  <span className="ui-mono">{cargando ? '-' : p.cantidad}</span>
                  <span className="ui-muted ui-mono">{porcentaje(p.cantidad, p.total)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="tb-seccion" aria-labelledby="tb-gestion">
        <div className="ui-sectionhead">
          <h2 id="tb-gestion" className="ui-h2">Gestión de la institución</h2>
          {esAdmin && <span className="ui-chip ui-chip--line">Vista de administración general</span>}
        </div>
        <div className="ui-tiles">
          {ACCESOS.map(({ seccion, titulo, texto, icon: Icon }) => (
            <Link key={seccion} to={ruta(seccion)} className="ui-card ui-tile">
              <span className="ui-icon-tile" aria-hidden="true"><Icon size={18} /></span>
              <span className="ui-tile__title">{titulo}</span>
              <span className="ui-tile__text">{texto}</span>
              <span className="ui-tile__cta">Abrir <ArrowRight size={14} /></span>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
