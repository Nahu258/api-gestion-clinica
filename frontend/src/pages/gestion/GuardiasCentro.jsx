/**
 * GuardiasCentro.jsx - Cronograma semanal de guardias programadas (AE5-12, #42).
 *
 *   /panel-centro/gestion/guardias            (OPERADOR_CENTRO: su centro)
 *   /panel-centro/gestion/guardias?centro=:id (ADMIN: cualquier centro)
 *
 * - Grilla días × horas con un bloque por guardia, coloreado según la
 *   especialidad principal del médico. En mobile se muestra una lista por día.
 * - Crear / editar bloque: médico del plantel, día(s), inicio y fin. En el alta
 *   se puede repetir el mismo horario en varios días.
 * - Cobertura: al elegir una especialidad se resaltan las franjas del día sin
 *   ningún médico de esa especialidad; además hay un resumen semanal.
 * - Si el backend informa solapamiento, el bloque en conflicto se marca en la
 *   grilla y el error se muestra junto al día correspondiente.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDots, Plus, Trash, WarningCircle } from '@phosphor-icons/react'
import Modal from '../../components/ui/Modal.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { CheckboxField, SelectField, TextField } from '../../components/ui/Field.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { useCentroGestion } from './GestionLayout.jsx'
import {
  actualizarGuardia,
  crearGuardia,
  eliminarGuardia,
  listarEspecialidadesGestion,
  listarGuardias,
  listarPlantel,
} from '../../api/admin.js'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const ALTO_HORA = 34 // px por hora en la grilla

// Paleta para especialidades (texto oscuro sobre fondo suave, legible en ambos temas)
const PALETA = ['#2f6fb5', '#b5512f', '#2f8f5b', '#8a4fb5', '#b58a2f', '#2f9aa8', '#b52f6f', '#5b6b2f']

const aMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const aHora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const hoy = () => (new Date().getDay() + 6) % 7

/** Reparte los bloques de un día en carriles para que no se tapen entre sí. */
function enCarriles(bloques) {
  const ordenados = [...bloques].sort((a, b) => aMin(a.hora_inicio) - aMin(b.hora_inicio))
  const finCarril = []
  const res = ordenados.map((g) => {
    const ini = aMin(g.hora_inicio)
    let carril = finCarril.findIndex((fin) => fin <= ini)
    if (carril === -1) carril = finCarril.length
    finCarril[carril] = aMin(g.hora_fin)
    return { ...g, carril }
  })
  return { bloques: res, carriles: Math.max(1, finCarril.length) }
}

/** Intervalos [ini, fin) de 0 a 24 h sin cobertura, dadas las guardias de un día. */
function huecos(guardiasDelDia, desde = 0, hasta = 24 * 60) {
  const tramos = guardiasDelDia
    .map((g) => [aMin(g.hora_inicio), aMin(g.hora_fin)])
    .sort((a, b) => a[0] - b[0])
  const res = []
  let cursor = desde
  for (const [ini, fin] of tramos) {
    if (ini > cursor) res.push([cursor, Math.min(ini, hasta)])
    cursor = Math.max(cursor, fin)
    if (cursor >= hasta) break
  }
  if (cursor < hasta) res.push([cursor, hasta])
  return res.filter(([a, b]) => b > a)
}

export default function GuardiasCentro() {
  const { centroId } = useCentroGestion()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const filtroEsp = params.get('especialidad') || ''

  const [guardias, setGuardias] = useState([])
  const [plantel, setPlantel] = useState([])
  const [especialidades, setEspecialidades] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [editando, setEditando] = useState(null) // null | {nuevo, dia, hora} | guardia
  const [aEliminar, setAEliminar] = useState(null)
  const [conflictos, setConflictos] = useState(new Set())

  const cargar = useCallback(async () => {
    if (!centroId) return
    setCargando(true)
    setError(null)
    try {
      const [g, p, e] = await Promise.all([
        listarGuardias(centroId),
        listarPlantel(centroId),
        listarEspecialidadesGestion(centroId),
      ])
      setGuardias(g.guardias || [])
      setPlantel((p.resultados || []).filter((m) => m.activo))
      setEspecialidades(e.filter((x) => x.activo))
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [centroId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const colorDe = useMemo(() => {
    const mapa = {}
    especialidades.forEach((e, i) => {
      mapa[e.id] = PALETA[i % PALETA.length]
    })
    return (g) => mapa[g.especialidades?.[0]?.id] || 'var(--ink-3)'
  }, [especialidades])

  const visibles = useMemo(
    () => guardias.filter((g) => !filtroEsp || g.especialidades?.some((e) => String(e.id) === filtroEsp)),
    [guardias, filtroEsp]
  )

  // Rango horario de la grilla: al menos 07–21, ampliado según las guardias
  const [horaDesde, horaHasta] = useMemo(() => {
    let d = 7
    let h = 21
    guardias.forEach((g) => {
      d = Math.min(d, Math.floor(aMin(g.hora_inicio) / 60))
      h = Math.max(h, Math.ceil(aMin(g.hora_fin) / 60))
    })
    return [d, Math.min(24, h)]
  }, [guardias])

  const porDia = useMemo(
    () => DIAS.map((_, i) => enCarriles(visibles.filter((g) => g.dia_semana === i))),
    [visibles]
  )

  // Cobertura semanal por especialidad (sólo guardias activas, 0–24 h)
  const cobertura = useMemo(
    () =>
      especialidades.map((esp) => {
        const delaEsp = guardias.filter((g) => g.en_guardia_activa && g.especialidades?.some((e) => e.id === esp.id))
        const sinCubrir = DIAS.reduce(
          (total, _, i) =>
            total + huecos(delaEsp.filter((g) => g.dia_semana === i)).reduce((s, [a, b]) => s + (b - a), 0),
          0
        )
        const pct = Math.round((1 - sinCubrir / (7 * 24 * 60)) * 100)
        return { ...esp, pct, bloques: delaEsp.length }
      }),
    [especialidades, guardias]
  )

  const huecosFiltro = useMemo(() => {
    if (!filtroEsp) return null
    const activas = visibles.filter((g) => g.en_guardia_activa)
    return DIAS.map((_, i) =>
      huecos(activas.filter((g) => g.dia_semana === i), horaDesde * 60, horaHasta * 60)
    )
  }, [filtroEsp, visibles, horaDesde, horaHasta])

  const elegirEspecialidad = (id) =>
    setParams(
      (prev) => {
        const sig = new URLSearchParams(prev)
        if (id) sig.set('especialidad', id)
        else sig.delete('especialidad')
        return sig
      },
      { replace: true }
    )

  const confirmarEliminar = async () => {
    const g = aEliminar
    await eliminarGuardia(centroId, g.id)
    setAEliminar(null)
    setEditando(null)
    toast.ok(`Guardia de ${g.medico_nombre} del ${g.dia_nombre.toLowerCase()} eliminada.`)
    cargar()
  }

  const horas = Array.from({ length: horaHasta - horaDesde }, (_, i) => horaDesde + i)
  const sinPlantel = !cargando && plantel.length === 0

  return (
    <>
      <div className="ui-pagehead">
        <div>
          <h1 className="ui-pagehead__title">Guardias</h1>
          <div className="ui-pagehead__meta">
            <span>Cronograma semanal. El estado en tiempo real lo sigue marcando cada médico en su portal.</span>
          </div>
        </div>
        <div className="ui-pagehead__actions">
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setEditando({ nuevo: true })} disabled={sinPlantel}>
            <Plus size={16} weight="bold" />
            Nueva guardia
          </button>
        </div>
      </div>

      {error && (
        <div className="ui-alert" role="alert">
          <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={cargar} style={{ marginLeft: 'auto' }}>Reintentar</button>
        </div>
      )}

      {especialidades.length > 0 && (
        <section className="ui-card ui-cobertura" aria-label="Cobertura por especialidad">
          <div className="ui-card__head">
            <h2 className="ui-h2">Cobertura semanal</h2>
            <span className="ui-muted" style={{ fontSize: '0.82rem' }}>Elegí una especialidad para ver sus franjas sin médicos</span>
          </div>
          <div className="ui-chips ui-card__pad" style={{ marginTop: 0 }}>
            <button type="button" className={`ui-chip ui-chip--btn ui-chip--lg${!filtroEsp ? ' ui-chip--ink' : ''}`} aria-pressed={!filtroEsp} onClick={() => elegirEspecialidad('')}>
              Todas
            </button>
            {cobertura.map((c) => {
              const activa = filtroEsp === String(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={activa}
                  className={`ui-chip ui-chip--btn ui-chip--lg${activa ? ' ui-chip--ink' : ''}`}
                  onClick={() => elegirEspecialidad(activa ? '' : String(c.id))}
                >
                  <span className="ui-swatch" style={{ background: colorDe({ especialidades: [{ id: c.id }] }) }} aria-hidden="true" />
                  {c.nombre}
                  <span className={`ui-cobertura__pct${c.pct < 100 ? ' is-low' : ''}`}>{c.pct}%</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {cargando ? (
        <div className="ui-skeleton" style={{ height: 420, marginTop: 16 }} />
      ) : sinPlantel ? (
        <div className="ui-card" style={{ marginTop: 16 }}>
          <div className="ui-empty">
            <div className="ui-empty__icon"><CalendarDots size={22} /></div>
            <p className="ui-empty__title">Primero registrá médicos</p>
            <p className="ui-empty__text">Las guardias se cargan para médicos del plantel del centro.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Grilla (escritorio) */}
          <div className="ui-card ui-sched" role="grid" aria-label="Cronograma semanal de guardias">
            <div className="ui-sched__head" role="row">
              <div className="ui-sched__corner" />
              {DIAS.map((d, i) => (
                <div key={d} role="columnheader" className={`ui-sched__day${i === hoy() ? ' is-today' : ''}`}>{d}</div>
              ))}
            </div>
            <div className="ui-sched__body" style={{ height: horas.length * ALTO_HORA }}>
              <div className="ui-sched__hours" aria-hidden="true">
                {horas.map((h) => (
                  <div key={h} className="ui-sched__hour" style={{ height: ALTO_HORA }}>{String(h).padStart(2, '0')}:00</div>
                ))}
              </div>
              {porDia.map(({ bloques, carriles }, dia) => (
                <div
                  key={dia}
                  className="ui-sched__col"
                  role="gridcell"
                  style={{ backgroundSize: `100% ${ALTO_HORA}px` }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return
                    const y = e.nativeEvent.offsetY
                    const h = Math.min(horaHasta - 1, horaDesde + Math.floor(y / ALTO_HORA))
                    setEditando({ nuevo: true, dia, hora: h })
                  }}
                  title="Click para cargar una guardia"
                >
                  {huecosFiltro?.[dia].map(([a, b]) => (
                    <div
                      key={`h${a}`}
                      className="ui-sched__gap"
                      style={{ top: ((a - horaDesde * 60) / 60) * ALTO_HORA, height: ((b - a) / 60) * ALTO_HORA }}
                      aria-label={`Sin cobertura de ${aHora(a)} a ${aHora(b)}`}
                    />
                  ))}
                  {bloques.map((g) => {
                    const top = ((aMin(g.hora_inicio) - horaDesde * 60) / 60) * ALTO_HORA
                    const alto = Math.max(18, ((aMin(g.hora_fin) - aMin(g.hora_inicio)) / 60) * ALTO_HORA - 2)
                    const ancho = 100 / carriles
                    return (
                      <button
                        key={g.id}
                        type="button"
                        className={`ui-sched__block${g.en_guardia_activa ? '' : ' is-paused'}${conflictos.has(g.id) ? ' is-conflict' : ''}`}
                        style={{ top, height: alto, left: `calc(${g.carril * ancho}% + 2px)`, width: `calc(${ancho}% - 4px)`, '--c': colorDe(g) }}
                        onClick={() => setEditando(g)}
                        title={`${g.medico_nombre} · ${g.hora_inicio} a ${g.hora_fin}${g.en_guardia_activa ? '' : ' (pausada)'}`}
                      >
                        <span className="ui-sched__name">{g.medico_nombre}</span>
                        <span className="ui-sched__time">{g.hora_inicio}–{g.hora_fin}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Lista por día (mobile) */}
          <div className="ui-sched-list">
            {porDia.map(({ bloques }, dia) => (
              <section key={dia} className="ui-card" aria-label={DIAS[dia]}>
                <div className="ui-card__head">
                  <h2 className="ui-h2">{dia === hoy() ? `${DIAS[dia]}, hoy` : DIAS[dia]}</h2>
                  <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={() => setEditando({ nuevo: true, dia })}>
                    <Plus size={14} /> Agregar
                  </button>
                </div>
                {huecosFiltro && huecosFiltro[dia].length > 0 && (
                  <p className="ui-sched-list__gap">
                    Sin cobertura: {huecosFiltro[dia].map(([a, b]) => `${aHora(a)}–${aHora(b)}`).join(', ')}
                  </p>
                )}
                {bloques.length === 0 ? (
                  <p className="ui-help" style={{ padding: '0 16px 14px' }}>Sin guardias.</p>
                ) : (
                  <ul className="ui-rows">
                    {bloques.map((g) => (
                      <li key={g.id}>
                        <button type="button" className={`ui-sched-list__item${conflictos.has(g.id) ? ' is-conflict' : ''}`} onClick={() => setEditando(g)} style={{ '--c': colorDe(g) }}>
                          <span className="ui-mono">{g.hora_inicio}–{g.hora_fin}</span>
                          <span className="ui-sched-list__who">
                            {g.medico_nombre}
                            <span className="ui-person__sub">{g.especialidades?.map((e) => e.nombre).join(', ')}{g.en_guardia_activa ? '' : ' · pausada'}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}

      <GuardiaModal
        estado={editando}
        centroId={centroId}
        plantel={plantel}
        onClose={() => {
          setEditando(null)
          setConflictos(new Set())
        }}
        onConflicto={(ids) => setConflictos(new Set(ids))}
        onEliminar={(g) => setAEliminar(g)}
        onGuardado={(mensaje) => {
          setEditando(null)
          setConflictos(new Set())
          toast.ok(mensaje)
          cargar()
        }}
      />

      <ConfirmDialog
        open={!!aEliminar}
        title="Eliminar guardia"
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={confirmarEliminar}
        onCancel={() => setAEliminar(null)}
      >
        <p>
          Se elimina la guardia de <strong>{aEliminar?.medico_nombre}</strong> del {aEliminar?.dia_nombre?.toLowerCase()} de{' '}
          {aEliminar?.hora_inicio} a {aEliminar?.hora_fin}.
        </p>
      </ConfirmDialog>
    </>
  )
}

function GuardiaModal({ estado, centroId, plantel, onClose, onConflicto, onEliminar, onGuardado }) {
  const open = estado !== null
  const esNueva = !!estado?.nuevo
  const [form, setForm] = useState({ medico_id: '', dias: [], hora_inicio: '08:00', hora_fin: '20:00', activa: true })
  const [errores, setErrores] = useState({})
  const [erroresDia, setErroresDia] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!open) return
    if (esNueva) {
      const h = estado.hora ?? 8
      setForm({
        medico_id: '',
        dias: estado.dia !== undefined ? [estado.dia] : [],
        hora_inicio: aHora(h * 60),
        hora_fin: aHora(Math.min(23 * 60 + 59, (h + 8) * 60)),
        activa: true,
      })
    } else {
      setForm({
        medico_id: String(estado.medico_id),
        dias: [estado.dia_semana],
        hora_inicio: estado.hora_inicio,
        hora_fin: estado.hora_fin,
        activa: estado.en_guardia_activa,
      })
    }
    setErrores({})
    setErroresDia({})
    setErrorGeneral(null)
  }, [open, estado, esNueva])

  const alternarDia = (i) =>
    setForm((f) => ({
      ...f,
      dias: esNueva ? (f.dias.includes(i) ? f.dias.filter((d) => d !== i) : [...f.dias, i].sort()) : [i],
    }))

  const leerError = (err, dia) => {
    const sol = err.detalles?.solapamiento
    if (Array.isArray(sol)) {
      onConflicto(sol.map((g) => g.id))
      return { dia, mensaje: err.message }
    }
    return { dia, mensaje: Object.values(err.campos || {})[0] || err.message, campos: err.campos }
  }

  const enviar = async () => {
    const locales = {}
    if (!form.medico_id) locales.medico_id = 'Elegí un médico.'
    if (!form.dias.length) locales.dias = 'Elegí al menos un día.'
    if (form.hora_fin <= form.hora_inicio) locales.hora_fin = 'Tiene que ser posterior al inicio. Si cruza la medianoche, cargá dos bloques.'
    setErrores(locales)
    setErroresDia({})
    setErrorGeneral(null)
    if (Object.keys(locales).length) return

    const datos = {
      medico_id: Number(form.medico_id),
      hora_inicio: form.hora_inicio,
      hora_fin: form.hora_fin,
      en_guardia_activa: form.activa,
    }
    setGuardando(true)
    try {
      if (!esNueva) {
        try {
          await actualizarGuardia(centroId, estado.id, { ...datos, dia_semana: form.dias[0] })
          onGuardado('Guardia actualizada.')
        } catch (err) {
          const e = leerError(err, form.dias[0])
          if (e.campos && Object.keys(e.campos).length) setErrores(e.campos)
          else setErroresDia({ [e.dia]: e.mensaje })
        }
        return
      }

      // Alta en uno o varios días: se cargan los que se puedan y se informan los que fallen
      const fallidos = {}
      let creadas = 0
      for (const dia of form.dias) {
        try {
          await crearGuardia(centroId, { ...datos, dia_semana: dia })
          creadas += 1
        } catch (err) {
          const e = leerError(err, dia)
          fallidos[dia] = e.mensaje
        }
      }
      if (!Object.keys(fallidos).length) {
        onGuardado(creadas === 1 ? 'Guardia cargada.' : `${creadas} guardias cargadas.`)
        return
      }
      setErroresDia(fallidos)
      // Los días que sí se cargaron se sacan de la selección para no duplicarlos al reintentar
      setForm((f) => ({ ...f, dias: f.dias.filter((d) => fallidos[d]) }))
      if (creadas) setErrorGeneral(`Se cargaron ${creadas} guardia(s). Revisá los días marcados.`)
    } finally {
      setGuardando(false)
    }
  }

  const opcionesMedico = plantel.map((m) => ({
    id: String(m.id),
    label: `${m.nombre}${m.especialidades?.length ? ` · ${m.especialidades.filter((e) => e.activo).map((e) => e.nombre).join(', ')}` : ''}`,
  }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      bloqueado={guardando}
      title={esNueva ? 'Nueva guardia' : `Guardia de ${estado?.medico_nombre || ''}`}
      footer={
        <>
          {!esNueva && (
            <button type="button" className="ui-btn ui-btn--quiet ui-btn--danger" onClick={() => onEliminar(estado)} disabled={guardando} style={{ marginRight: 'auto' }}>
              <Trash size={16} /> Eliminar
            </button>
          )}
          <button type="button" className="ui-btn ui-btn--quiet" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={enviar} disabled={guardando}>
            {guardando ? 'Guardando…' : esNueva ? 'Cargar guardia' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <div className="ui-form">
        {errorGeneral && (
          <div className="ui-alert" role="alert">
            <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{errorGeneral}</span>
          </div>
        )}
        <SelectField
          label="Médico"
          required
          value={form.medico_id}
          onChange={(e) => setForm((f) => ({ ...f, medico_id: e.target.value }))}
          error={errores.medico_id}
          options={opcionesMedico}
          placeholder="Elegí un médico del plantel"
        />

        <fieldset className="ui-fieldset">
          <legend className="ui-label">{esNueva ? 'Días (podés elegir varios para repetir el horario)' : 'Día'}</legend>
          <div className="ui-chips" style={{ marginTop: 0 }} role="group">
            {DIAS_CORTOS.map((d, i) => {
              const activo = form.dias.includes(i)
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={activo}
                  aria-label={DIAS[i]}
                  className={`ui-chip ui-chip--btn ui-chip--lg${activo ? ' ui-chip--ink' : ''}${erroresDia[i] ? ' ui-chip--alert' : ''}`}
                  onClick={() => alternarDia(i)}
                >
                  {d}
                </button>
              )
            })}
          </div>
          {esNueva && (
            <div className="ui-chips" style={{ marginTop: 8 }}>
              <button type="button" className="ui-chip ui-chip--btn" onClick={() => setForm((f) => ({ ...f, dias: [0, 1, 2, 3, 4] }))}>Lunes a viernes</button>
              <button type="button" className="ui-chip ui-chip--btn" onClick={() => setForm((f) => ({ ...f, dias: [5, 6] }))}>Fin de semana</button>
              <button type="button" className="ui-chip ui-chip--btn" onClick={() => setForm((f) => ({ ...f, dias: [0, 1, 2, 3, 4, 5, 6] }))}>Todos</button>
            </div>
          )}
          {errores.dias && <span className="ui-error-text" role="alert">{errores.dias}</span>}
          {Object.entries(erroresDia).map(([dia, msg]) => (
            <div key={dia} className="ui-alert" role="alert" style={{ marginTop: 8, marginBottom: 0 }}>
              <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span><strong>{DIAS[dia]}:</strong> {msg}</span>
            </div>
          ))}
        </fieldset>

        <div className="ui-grid-2">
          <TextField label="Desde" type="time" required value={form.hora_inicio} onChange={(e) => setForm((f) => ({ ...f, hora_inicio: e.target.value }))} error={errores.hora_inicio} />
          <TextField label="Hasta" type="time" required value={form.hora_fin} onChange={(e) => setForm((f) => ({ ...f, hora_fin: e.target.value }))} error={errores.hora_fin} />
        </div>

        <CheckboxField
          label="Guardia activa"
          help="Una guardia pausada queda en el cronograma pero no cuenta para la cobertura."
          checked={form.activa}
          onChange={(e) => setForm((f) => ({ ...f, activa: e.target.checked }))}
        />
      </div>
    </Modal>
  )
}
