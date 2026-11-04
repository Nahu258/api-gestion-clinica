/**
 * MedicosCentro.jsx - Plantel médico de la institución (AE5-11, #41).
 *
 *   /panel-centro/gestion/medicos            (OPERADOR_CENTRO: su centro)
 *   /panel-centro/gestion/medicos?centro=:id (ADMIN: cualquier centro)
 *
 * - Tabla: nombre, matrícula, especialidades, estado en tiempo real, guardias
 *   de la semana y cuenta de acceso. Filtros por especialidad, estado y
 *   búsqueda (en la URL: ?especialidad=&estado=&q=).
 * - Registrar médico: crea la cuenta (POST /admin/usuarios/) con especialidades
 *   del centro y muestra la contraseña temporal; o "Vincular médico existente"
 *   por matrícula o email si ya trabaja en otro centro.
 * - Editar datos y especialidades, dar de baja del centro (desactiva las
 *   asignaciones, el historial de atenciones se conserva) y resetear contraseña.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowCounterClockwise,
  Key,
  LinkSimple,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Stethoscope,
  UserMinus,
  WarningCircle,
} from '@phosphor-icons/react'
import DataTable from '../../components/ui/DataTable.jsx'
import Modal from '../../components/ui/Modal.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import PasswordTemporal from '../../components/ui/PasswordTemporal.jsx'
import { TextField } from '../../components/ui/Field.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { iniciales } from '../../utils/roles.js'
import { useCentroGestion } from './GestionLayout.jsx'
import { listarEspecialistasDisponiblesCentro } from '../../api/atencion.js'
import {
  actualizarMedicoPlantel,
  asignarMedicoEspecialidad,
  buscarMedicoExistente,
  crearUsuario,
  listarEspecialidadesGestion,
  listarGuardias,
  listarPlantel,
  resetearPassword,
} from '../../api/admin.js'

const ESTADOS = {
  DISPONIBLE: { label: 'Disponible', chip: 'ui-chip--ok', dot: 'ui-dot--ok' },
  EN_ATENCION: { label: 'En consulta', chip: 'ui-chip--warn', dot: 'ui-dot--warn' },
  FUERA_DE_GUARDIA: { label: 'Fuera de guardia', chip: '', dot: '' },
}

const FILTRO_ESTADO = [
  { id: 'DISPONIBLE', label: 'Disponibles' },
  { id: 'EN_ATENCION', label: 'En consulta' },
  { id: 'FUERA_DE_GUARDIA', label: 'Fuera de guardia' },
  { id: 'baja', label: 'Dados de baja' },
]

function horas(guardia) {
  const [h1, m1] = guardia.hora_inicio.split(':').map(Number)
  const [h2, m2] = guardia.hora_fin.split(':').map(Number)
  return (h2 * 60 + m2 - (h1 * 60 + m1)) / 60
}

function normalizar(t) {
  return String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export default function MedicosCentro() {
  const { centroId } = useCentroGestion()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const filtroEsp = params.get('especialidad') || ''
  const filtroEstado = params.get('estado') || ''
  const [busqueda, setBusqueda] = useState(params.get('q') || '')

  const [plantel, setPlantel] = useState([])
  const [especialidades, setEspecialidades] = useState([])
  const [disponibilidad, setDisponibilidad] = useState({})
  const [guardias, setGuardias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [registrando, setRegistrando] = useState(false)
  const [editando, setEditando] = useState(null)
  const [aCambiar, setACambiar] = useState(null)
  const [aResetear, setAResetear] = useState(null)
  const [passwordNueva, setPasswordNueva] = useState(null)

  const actualizarParam = useCallback(
    (clave, valor) =>
      setParams(
        (prev) => {
          const sig = new URLSearchParams(prev)
          if (valor) sig.set(clave, valor)
          else sig.delete(clave)
          return sig
        },
        { replace: true }
      ),
    [setParams]
  )

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') || '') !== busqueda.trim()) actualizarParam('q', busqueda.trim())
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda]) // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(async () => {
    if (!centroId) return
    setCargando(true)
    setError(null)
    try {
      const [p, esp, disp, gs] = await Promise.all([
        listarPlantel(centroId),
        listarEspecialidadesGestion(centroId),
        listarEspecialistasDisponiblesCentro(centroId).catch(() => []),
        listarGuardias(centroId).catch(() => ({ guardias: [] })),
      ])
      setPlantel(p.resultados || [])
      setEspecialidades(esp)
      setDisponibilidad(Object.fromEntries((disp || []).map((d) => [d.id, d.disponibilidad])))
      setGuardias(gs.guardias || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [centroId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const activas = useMemo(() => especialidades.filter((e) => e.activo), [especialidades])

  const guardiasPorMedico = useMemo(() => {
    const mapa = {}
    guardias.forEach((g) => {
      const m = (mapa[g.medico_id] ||= { bloques: 0, horas: 0 })
      if (g.en_guardia_activa) {
        m.bloques += 1
        m.horas += horas(g)
      }
    })
    return mapa
  }, [guardias])

  const filas = useMemo(() => {
    const q = normalizar(params.get('q'))
    return plantel
      .map((m) => ({ ...m, estado: m.activo ? disponibilidad[m.id] || 'FUERA_DE_GUARDIA' : 'baja' }))
      .filter((m) => !filtroEsp || m.especialidades.some((e) => e.activo && String(e.especialidad_id) === filtroEsp))
      .filter((m) => !filtroEstado || m.estado === filtroEstado)
      .filter((m) => !q || normalizar(`${m.nombre} ${m.matricula} ${m.cuenta?.email || ''}`).includes(q))
  }, [plantel, disponibilidad, filtroEsp, filtroEstado, params])

  const confirmarCambio = async () => {
    const m = aCambiar
    await actualizarMedicoPlantel(centroId, m.id, { activo: !m.activo })
    setACambiar(null)
    toast.ok(m.activo ? `${m.nombre} quedó dado de baja del centro.` : `${m.nombre} volvió al plantel.`)
    cargar()
  }

  const confirmarReset = async () => {
    const r = await resetearPassword(aResetear.cuenta.usuario_id)
    setAResetear(null)
    setPasswordNueva({ email: r.email, password: r.password_temporal })
  }

  const columnas = [
    {
      key: 'nombre',
      label: 'Médico',
      sortable: true,
      render: (m) => (
        <div className="ui-person">
          <span className="ui-initials" aria-hidden="true">{iniciales(m.nombre)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="ui-person__name">{m.nombre}</div>
            <div className="ui-person__sub ui-mono">{m.matricula || 'Sin matrícula'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'especialidades',
      label: 'Especialidades',
      render: (m) => {
        const act = m.especialidades.filter((e) => e.activo)
        return act.length ? (
          <div className="ui-chips" style={{ marginTop: 0 }}>
            {act.map((e) => <span key={e.asignacion_id} className="ui-chip">{e.nombre}</span>)}
          </div>
        ) : (
          <span className="ui-muted">Sin especialidades</span>
        )
      },
    },
    {
      key: 'estado',
      label: 'Estado',
      sortable: true,
      render: (m) => {
        if (m.estado === 'baja') return <span className="ui-chip">Dado de baja</span>
        const e = ESTADOS[m.estado] || ESTADOS.FUERA_DE_GUARDIA
        return (
          <span className={`ui-chip ${e.chip}`}>
            <span className={`ui-dot ${e.dot}`} aria-hidden="true" />
            {e.label}
          </span>
        )
      },
    },
    {
      key: 'guardias',
      label: 'Guardias semana',
      mobileLabel: 'Guardias',
      sortable: true,
      align: 'right',
      sortValue: (m) => guardiasPorMedico[m.id]?.horas || 0,
      render: (m) => {
        const g = guardiasPorMedico[m.id]
        return g?.bloques ? (
          <span className="ui-mono ui-nowrap">{g.bloques} · {Math.round(g.horas)} h</span>
        ) : (
          <span className="ui-muted">—</span>
        )
      },
    },
    {
      key: 'cuenta',
      label: 'Cuenta',
      sortable: true,
      sortValue: (m) => (m.cuenta ? (m.cuenta.activo ? 2 : 1) : 0),
      render: (m) =>
        !m.cuenta ? (
          <span className="ui-muted">Sin cuenta</span>
        ) : (
          <div style={{ minWidth: 0 }}>
            <span className={`ui-chip${m.cuenta.activo ? ' ui-chip--ok' : ''}`}>{m.cuenta.activo ? 'Activa' : 'Desactivada'}</span>
            <div className="ui-person__sub">{m.cuenta.email}</div>
          </div>
        ),
    },
  ]

  const acciones = (m) => {
    const puedeResetear = m.cuenta && m.cuenta.activo && String(m.cuenta.centro_id) === String(centroId)
    return (
      <>
        <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm ui-btn--icon" title="Editar" aria-label={`Editar ${m.nombre}`} onClick={() => setEditando(m)}>
          <PencilSimple size={16} />
        </button>
        {puedeResetear && (
          <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm ui-btn--icon" title="Resetear contraseña" aria-label={`Resetear contraseña de ${m.nombre}`} onClick={() => setAResetear(m)}>
            <Key size={16} />
          </button>
        )}
        <button
          type="button"
          className="ui-btn ui-btn--quiet ui-btn--sm ui-btn--icon"
          title={m.activo ? 'Dar de baja del centro' : 'Reincorporar'}
          aria-label={`${m.activo ? 'Dar de baja a' : 'Reincorporar a'} ${m.nombre}`}
          onClick={() => setACambiar(m)}
        >
          {m.activo ? <UserMinus size={16} /> : <ArrowCounterClockwise size={16} />}
        </button>
      </>
    )
  }

  const hayFiltros = filtroEsp || filtroEstado || params.get('q')

  return (
    <>
      <div className="ui-pagehead">
        <div>
          <h1 className="ui-pagehead__title">Médicos del centro</h1>
          <div className="ui-pagehead__meta">
            <span>Plantel, especialidades y cuentas de acceso al portal médico.</span>
          </div>
        </div>
        <div className="ui-pagehead__actions">
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setRegistrando(true)}>
            <Plus size={16} weight="bold" />
            Registrar médico
          </button>
        </div>
      </div>

      <DataTable
        columns={columnas}
        rows={filas}
        loading={cargando}
        error={error}
        onRetry={cargar}
        rowActions={acciones}
        initialSort={{ key: 'nombre', dir: 'asc' }}
        caption="Plantel médico"
        toolbar={
          <>
            <label className="ui-search">
              <MagnifyingGlass size={16} aria-hidden="true" />
              <input
                type="search"
                className="ui-search__input"
                placeholder="Buscar por nombre, matrícula o email"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label="Buscar por nombre, matrícula o email"
              />
            </label>
            <select className="ui-select" value={filtroEsp} onChange={(e) => actualizarParam('especialidad', e.target.value)} aria-label="Especialidad">
              <option value="">Todas las especialidades</option>
              {especialidades.map((e) => <option key={e.id} value={e.id}>{e.nombre}{e.activo ? '' : ' (deshabilitada)'}</option>)}
            </select>
            <select className="ui-select" value={filtroEstado} onChange={(e) => actualizarParam('estado', e.target.value)} aria-label="Estado">
              <option value="">Todos los estados</option>
              {FILTRO_ESTADO.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
            {hayFiltros && (
              <button
                type="button"
                className="ui-btn ui-btn--quiet ui-btn--sm"
                onClick={() => {
                  setBusqueda('')
                  setParams((prev) => {
                    const sig = new URLSearchParams()
                    if (prev.get('centro')) sig.set('centro', prev.get('centro'))
                    return sig
                  }, { replace: true })
                }}
              >
                Limpiar filtros
              </button>
            )}
          </>
        }
        empty={
          hayFiltros
            ? { title: 'Ningún médico coincide con los filtros', text: 'Probá con otros filtros o limpialos.' }
            : {
                icon: <Stethoscope size={22} />,
                title: 'Todavía no hay médicos en el plantel',
                text: 'Registrá a los médicos para que puedan recibir derivaciones y entrar al portal.',
                action: (
                  <button type="button" className="ui-btn ui-btn--primary" onClick={() => setRegistrando(true)}>
                    <Plus size={16} weight="bold" />
                    Registrar médico
                  </button>
                ),
              }
        }
      />

      <RegistrarMedico
        open={registrando}
        centroId={centroId}
        especialidades={activas}
        plantelIds={new Set(plantel.map((m) => m.id))}
        onClose={() => setRegistrando(false)}
        onListo={(mensaje) => {
          toast.ok(mensaje)
          cargar()
        }}
      />

      <EditarMedico
        medico={editando}
        centroId={centroId}
        especialidades={activas}
        onClose={() => setEditando(null)}
        onGuardado={() => {
          setEditando(null)
          toast.ok('Datos del médico actualizados.')
          cargar()
        }}
      />

      <ConfirmDialog
        open={!!aCambiar}
        title={aCambiar?.activo ? `Dar de baja a ${aCambiar?.nombre}` : `Reincorporar a ${aCambiar?.nombre}`}
        confirmLabel={aCambiar?.activo ? 'Dar de baja' : 'Reincorporar'}
        tone={aCambiar?.activo ? 'danger' : 'neutral'}
        onConfirm={confirmarCambio}
        onCancel={() => setACambiar(null)}
      >
        {aCambiar?.activo ? (
          <>
            <p>Deja de aparecer en la derivación y en "Médicos ahora" del panel de guardia.</p>
            <p>Sus atenciones previas siguen visibles en la pestaña Atenciones. Su cuenta no se desactiva.</p>
          </>
        ) : (
          <p>Se reactivan sus especialidades en el centro (las que sigan habilitadas) y vuelve a recibir derivaciones.</p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!aResetear}
        title={`Resetear la contraseña de ${aResetear?.nombre}`}
        confirmLabel="Generar contraseña nueva"
        tone="neutral"
        onConfirm={confirmarReset}
        onCancel={() => setAResetear(null)}
      >
        <p>Se genera una contraseña temporal nueva y la actual deja de funcionar.</p>
      </ConfirmDialog>

      <Modal
        open={!!passwordNueva}
        onClose={() => setPasswordNueva(null)}
        title="Contraseña reseteada"
        size="sm"
        footer={<button type="button" className="ui-btn ui-btn--dark" onClick={() => setPasswordNueva(null)}>Listo</button>}
      >
        {passwordNueva && <PasswordTemporal email={passwordNueva.email} password={passwordNueva.password} />}
      </Modal>
    </>
  )
}

/** Selector de especialidades activas del centro (chips). */
function SelectorEspecialidades({ especialidades, seleccion, onChange, error }) {
  if (!especialidades.length) {
    return <p className="ui-help">El centro no tiene especialidades habilitadas. Agregalas primero en Especialidades.</p>
  }
  return (
    <>
      <div className="ui-chips" style={{ marginTop: 0 }} role="group" aria-label="Especialidades">
        {especialidades.map((e) => {
          const activa = seleccion.includes(e.id)
          return (
            <button
              key={e.id}
              type="button"
              aria-pressed={activa}
              className={`ui-chip ui-chip--btn ui-chip--lg${activa ? ' ui-chip--ink' : ''}`}
              onClick={() => onChange(activa ? seleccion.filter((x) => x !== e.id) : [...seleccion, e.id])}
            >
              {e.nombre}
            </button>
          )
        })}
      </div>
      {error && <span className="ui-error-text" role="alert">{error}</span>}
    </>
  )
}

function RegistrarMedico({ open, centroId, especialidades, plantelIds, onClose, onListo }) {
  const [modo, setModo] = useState('nuevo')
  const [form, setForm] = useState({ nombre: '', matricula: '', email: '', especialidad_ids: [] })
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [creado, setCreado] = useState(null)

  // Vincular existente
  const [criterio, setCriterio] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [encontrados, setEncontrados] = useState(null)
  const [elegido, setElegido] = useState(null)

  useEffect(() => {
    if (!open) return
    setModo('nuevo')
    setForm({ nombre: '', matricula: '', email: '', especialidad_ids: [] })
    setErrores({})
    setErrorGeneral(null)
    setCreado(null)
    setCriterio('')
    setEncontrados(null)
    setElegido(null)
  }, [open])

  const set = (campo) => (e) => {
    setForm((f) => ({ ...f, [campo]: e.target.value }))
    setErrores((er) => ({ ...er, [campo]: undefined }))
  }

  const registrar = async () => {
    const locales = {}
    if (!form.nombre.trim()) locales.nombre = 'Ingresá nombre y apellido.'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) locales.email = 'Ingresá un email válido.'
    if (!form.especialidad_ids.length) locales.especialidad_ids = 'Elegí al menos una especialidad.'
    setErrores(locales)
    if (Object.keys(locales).length) return

    setGuardando(true)
    setErrorGeneral(null)
    try {
      const u = await crearUsuario({
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        matricula: form.matricula.trim(),
        rol: 'MEDICO',
        centro_id: Number(centroId),
        especialidad_ids: form.especialidad_ids,
      })
      setCreado(u)
      onListo(`${u.nombre} quedó registrado en el plantel.`)
    } catch (err) {
      setErrores(err.campos || {})
      setErrorGeneral(Object.keys(err.campos || {}).length ? null : err.message)
    } finally {
      setGuardando(false)
    }
  }

  const buscar = async (e) => {
    e?.preventDefault()
    const valor = criterio.trim()
    if (!valor) return
    setBuscando(true)
    setErrorGeneral(null)
    setElegido(null)
    try {
      const esEmail = valor.includes('@')
      const r = await buscarMedicoExistente(esEmail ? { email: valor } : { matricula: valor })
      setEncontrados(r.resultados)
    } catch (err) {
      setErrorGeneral(err.message)
    } finally {
      setBuscando(false)
    }
  }

  const vincular = async () => {
    if (!form.especialidad_ids.length) {
      setErrores({ especialidad_ids: 'Elegí al menos una especialidad.' })
      return
    }
    setGuardando(true)
    setErrorGeneral(null)
    try {
      for (const espId of form.especialidad_ids) {
        await asignarMedicoEspecialidad(centroId, espId, elegido.id)
      }
      onListo(`${elegido.nombre} se sumó al plantel.`)
      onClose()
    } catch (err) {
      setErrorGeneral(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const pie = creado ? (
    <button type="button" className="ui-btn ui-btn--dark" onClick={onClose}>Listo</button>
  ) : (
    <>
      <button type="button" className="ui-btn ui-btn--quiet" onClick={onClose} disabled={guardando}>Cancelar</button>
      {modo === 'nuevo' ? (
        <button type="button" className="ui-btn ui-btn--primary" onClick={registrar} disabled={guardando}>
          {guardando ? 'Registrando…' : 'Registrar médico'}
        </button>
      ) : (
        <button type="button" className="ui-btn ui-btn--primary" onClick={vincular} disabled={guardando || !elegido}>
          {guardando ? 'Vinculando…' : 'Sumar al plantel'}
        </button>
      )}
    </>
  )

  return (
    <Modal open={open} onClose={onClose} bloqueado={guardando} variant="drawer" title={creado ? 'Médico registrado' : 'Registrar médico'} footer={pie}>
      {creado ? (
        <div className="ui-form">
          <p className="ui-confirm__text">
            <strong>{creado.nombre}</strong> ya puede entrar al portal médico con su email y esta contraseña, y aparece en la derivación de{' '}
            {creado.especialidades.map((e) => e.nombre).join(', ')}.
          </p>
          <PasswordTemporal email={creado.email} password={creado.password_temporal} />
        </div>
      ) : (
        <div className="ui-form">
          <div className="ui-segmented" role="group" aria-label="Tipo de alta" style={{ alignSelf: 'flex-start' }}>
            <button type="button" className={modo === 'nuevo' ? 'is-active' : ''} onClick={() => setModo('nuevo')}>
              <Plus size={16} />
              Nuevo médico
            </button>
            <button type="button" className={modo === 'vincular' ? 'is-active' : ''} onClick={() => setModo('vincular')}>
              <LinkSimple size={16} />
              Vincular existente
            </button>
          </div>

          {errorGeneral && (
            <div className="ui-alert" role="alert">
              <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{errorGeneral}</span>
            </div>
          )}

          {modo === 'nuevo' ? (
            <>
              <TextField label="Nombre y apellido" required autoFocus value={form.nombre} onChange={set('nombre')} error={errores.nombre} placeholder="Dra. Ana López" maxLength={150} />
              <TextField label="Matrícula" value={form.matricula} onChange={set('matricula')} error={errores.matricula} placeholder="MP 1234" maxLength={50} className="ui-mono-input" />
              <TextField
                label="Email de acceso"
                type="email"
                required
                autoComplete="off"
                value={form.email}
                onChange={set('email')}
                error={errores.email}
                help="Con este email entra al portal médico. La contraseña se genera al registrar."
              />
            </>
          ) : (
            <>
              <form className="ui-inline-form" onSubmit={buscar}>
                <TextField
                  label="Matrícula o email"
                  autoFocus
                  value={criterio}
                  onChange={(e) => setCriterio(e.target.value)}
                  placeholder="MP 1234 o medico@correo.com"
                  help="Tiene que coincidir exactamente."
                  className="ui-inline-form__field"
                />
                <button type="submit" className="ui-btn" disabled={buscando || !criterio.trim()}>
                  <MagnifyingGlass size={16} />
                  {buscando ? 'Buscando…' : 'Buscar'}
                </button>
              </form>

              {encontrados !== null && (
                encontrados.length === 0 ? (
                  <p className="ui-help">No hay ningún médico con esa matrícula o email. Registralo como médico nuevo.</p>
                ) : (
                  <ul className="ui-picklist">
                    {encontrados.map((m) => {
                      const yaEsta = plantelIds.has(m.id)
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            className={`ui-picklist__item${elegido?.id === m.id ? ' is-selected' : ''}`}
                            onClick={() => setElegido(m)}
                            aria-pressed={elegido?.id === m.id}
                          >
                            <span className="ui-initials" aria-hidden="true">{iniciales(m.nombre)}</span>
                            <span className="ui-picklist__text">
                              <span className="ui-person__name">{m.nombre}</span>
                              <span className="ui-person__sub">
                                {m.matricula || 'Sin matrícula'}
                                {m.centros.length ? ` · ${m.centros.map((c) => c.nombre).join(', ')}` : ''}
                              </span>
                            </span>
                            <span className="ui-picklist__cta">{yaEsta ? 'Ya está en el plantel' : elegido?.id === m.id ? 'Elegido' : 'Elegir'}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )
              )}
            </>
          )}

          {(modo === 'nuevo' || elegido) && (
            <fieldset className="ui-fieldset">
              <legend className="ui-label">Especialidades en este centro</legend>
              <SelectorEspecialidades
                especialidades={especialidades}
                seleccion={form.especialidad_ids}
                onChange={(ids) => {
                  setForm((f) => ({ ...f, especialidad_ids: ids }))
                  setErrores((er) => ({ ...er, especialidad_ids: undefined }))
                }}
                error={errores.especialidad_ids}
              />
            </fieldset>
          )}
        </div>
      )}
    </Modal>
  )
}

function EditarMedico({ medico, centroId, especialidades, onClose, onGuardado }) {
  const [form, setForm] = useState({ nombre: '', matricula: '', especialidad_ids: [] })
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!medico) return
    setForm({
      nombre: medico.nombre,
      matricula: medico.matricula || '',
      especialidad_ids: medico.especialidades.filter((e) => e.activo).map((e) => e.especialidad_id),
    })
    setErrores({})
    setErrorGeneral(null)
  }, [medico])

  const enviar = async () => {
    if (!form.nombre.trim()) {
      setErrores({ nombre: 'Ingresá nombre y apellido.' })
      return
    }
    const cambios = {}
    if (form.nombre.trim() !== medico.nombre) cambios.nombre = form.nombre.trim()
    if (form.matricula.trim() !== (medico.matricula || '')) cambios.matricula = form.matricula.trim()
    const previas = medico.especialidades.filter((e) => e.activo).map((e) => e.especialidad_id).sort().join(',')
    if ([...form.especialidad_ids].sort().join(',') !== previas) cambios.especialidad_ids = form.especialidad_ids

    if (!Object.keys(cambios).length) {
      onClose()
      return
    }
    setGuardando(true)
    setErrorGeneral(null)
    try {
      await actualizarMedicoPlantel(centroId, medico.id, cambios)
      onGuardado()
    } catch (err) {
      setErrores(err.campos || {})
      setErrorGeneral(Object.keys(err.campos || {}).length ? null : err.message)
    } finally {
      setGuardando(false)
    }
  }

  const sinEspecialidades = medico?.activo && form.especialidad_ids.length === 0

  return (
    <Modal
      open={!!medico}
      onClose={onClose}
      bloqueado={guardando}
      variant="drawer"
      title={medico ? `Editar a ${medico.nombre}` : ''}
      footer={
        <>
          <button type="button" className="ui-btn ui-btn--quiet" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={enviar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
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
        <TextField label="Nombre y apellido" required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} error={errores.nombre} maxLength={120} />
        <TextField label="Matrícula" value={form.matricula} onChange={(e) => setForm((f) => ({ ...f, matricula: e.target.value }))} error={errores.matricula} maxLength={50} className="ui-mono-input" />
        <fieldset className="ui-fieldset">
          <legend className="ui-label">Especialidades en este centro</legend>
          <SelectorEspecialidades
            especialidades={especialidades}
            seleccion={form.especialidad_ids}
            onChange={(ids) => setForm((f) => ({ ...f, especialidad_ids: ids }))}
            error={errores.especialidad_ids}
          />
          {sinEspecialidades && (
            <p className="ui-help">Sin especialidades el médico deja de aparecer en la derivación (equivale a darlo de baja).</p>
          )}
        </fieldset>
      </div>
    </Modal>
  )
}
