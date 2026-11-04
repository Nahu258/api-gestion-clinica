/**
 * Usuarios.jsx - Usuarios del personal (AE5-09, #39). Sólo ADMIN.
 *
 * - Tabla: nombre, email, rol, institución, estado y último acceso.
 * - Filtros rol / institución / estado / búsqueda, reflejados en la URL.
 * - Alta: email, nombre, rol, institución y, para médicos, matrícula y
 *   especialidades activas del centro. La contraseña inicial se genera y se
 *   muestra una sola vez.
 * - Acciones: editar (nombre, rol, institución, matrícula), resetear
 *   contraseña y activar/desactivar (con confirmación).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Key, PencilSimple, Plus, Power, UsersThree, WarningCircle } from '@phosphor-icons/react'
import DataTable from '../../components/ui/DataTable.jsx'
import Modal from '../../components/ui/Modal.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import PasswordTemporal from '../../components/ui/PasswordTemporal.jsx'
import StatusBadge from '../../components/ui/StatusBadge.jsx'
import { SelectField, TextField } from '../../components/ui/Field.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { iniciales } from '../../utils/roles.js'
import {
  ROLES_PERSONAL,
  actualizarUsuario,
  crearUsuario,
  etiquetaRolPersonal,
  listarEspecialidadesGestion,
  listarTodosLosCentrosAdmin,
  listarTodosLosUsuarios,
  resetearPassword,
} from '../../api/admin.js'

const FILTROS = ['q', 'rol', 'centro_id', 'activo']
const ROLES_ALTA = ROLES_PERSONAL.filter((r) => r.id !== 'ADMIN')

function formatearAcceso(iso) {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function Usuarios() {
  const toast = useToast()
  const { usuario: yo } = useAuth()
  const [params, setParams] = useSearchParams()

  const claveFiltros = FILTROS.map((f) => params.get(f) || '').join('|')
  const filtros = useMemo(
    () => Object.fromEntries(FILTROS.map((f, i) => [f, claveFiltros.split('|')[i]])),
    [claveFiltros]
  )

  const [busqueda, setBusqueda] = useState(filtros.q)
  const [usuarios, setUsuarios] = useState([])
  const [centros, setCentros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [editando, setEditando] = useState(null) // null | 'nuevo' | usuario
  const [aCambiar, setACambiar] = useState(null)
  const [aResetear, setAResetear] = useState(null)
  const [passwordNueva, setPasswordNueva] = useState(null) // { email, password }

  const actualizarParam = useCallback(
    (clave, valor) => {
      setParams(
        (prev) => {
          const sig = new URLSearchParams(prev)
          if (valor) sig.set(clave, valor)
          else sig.delete(clave)
          return sig
        },
        { replace: true }
      )
    },
    [setParams]
  )

  useEffect(() => {
    if (busqueda === filtros.q) return undefined
    const t = setTimeout(() => actualizarParam('q', busqueda.trim()), 300)
    return () => clearTimeout(t)
  }, [busqueda, filtros.q, actualizarParam])

  const cargar = useCallback(
    async (signal) => {
      setCargando(true)
      setError(null)
      try {
        setUsuarios(await listarTodosLosUsuarios(filtros, { signal }))
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message)
      } finally {
        if (!signal?.aborted) setCargando(false)
      }
    },
    [filtros]
  )

  useEffect(() => {
    const control = new AbortController()
    cargar(control.signal)
    return () => control.abort()
  }, [cargar])

  useEffect(() => {
    listarTodosLosCentrosAdmin()
      .then((lista) => setCentros(lista.sort((a, b) => a.nombre.localeCompare(b.nombre))))
      .catch(() => setCentros([]))
  }, [])

  const reemplazar = (u) => setUsuarios((lista) => lista.map((x) => (x.id === u.id ? u : x)))

  const confirmarCambio = async () => {
    const u = aCambiar
    const actualizado = await actualizarUsuario(u.id, { activo: !u.activo })
    reemplazar(actualizado)
    setACambiar(null)
    toast.ok(`La cuenta de ${u.nombre} quedó ${actualizado.activo ? 'activa' : 'desactivada'}.`)
  }

  const confirmarReset = async () => {
    const u = aResetear
    const r = await resetearPassword(u.id)
    setAResetear(null)
    setPasswordNueva({ email: r.email, password: r.password_temporal })
  }

  const hayFiltros = FILTROS.some((f) => filtros[f])

  const columnas = [
    {
      key: 'nombre',
      label: 'Persona',
      sortable: true,
      render: (u) => (
        <div className="ui-person">
          <span className="ui-initials" aria-hidden="true">{iniciales(u.nombre)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="ui-person__name">{u.nombre}</div>
            <div className="ui-person__sub">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'rol',
      label: 'Rol',
      sortable: true,
      render: (u) => (
        <div>
          <div>{etiquetaRolPersonal(u.rol)}</div>
          {u.rol === 'MEDICO' && u.matricula && <div className="ui-person__sub ui-mono">{u.matricula}</div>}
        </div>
      ),
    },
    {
      key: 'centro_nombre',
      label: 'Institución',
      sortable: true,
      render: (u) => u.centro_nombre || <span className="ui-muted">Toda la red</span>,
    },
    { key: 'activo', label: 'Estado', sortable: true, render: (u) => <StatusBadge activo={u.activo} labels={['Activa', 'Desactivada']} /> },
    {
      key: 'ultimo_acceso',
      label: 'Último acceso',
      sortable: true,
      sortValue: (u) => u.ultimo_acceso || '',
      render: (u) => <span className="ui-mono ui-nowrap">{formatearAcceso(u.ultimo_acceso)}</span>,
    },
  ]

  const acciones = (u) => {
    const esYo = u.id === yo?.id
    const esAdmin = u.rol === 'ADMIN'
    return (
      <>
        <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm ui-btn--icon" title="Editar" aria-label={`Editar ${u.nombre}`} onClick={() => setEditando(u)}>
          <PencilSimple size={16} />
        </button>
        {!esAdmin && (
          <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm ui-btn--icon" title="Resetear contraseña" aria-label={`Resetear contraseña de ${u.nombre}`} onClick={() => setAResetear(u)}>
            <Key size={16} />
          </button>
        )}
        {!esYo && (
          <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm ui-btn--icon" title={u.activo ? 'Desactivar' : 'Activar'} aria-label={`${u.activo ? 'Desactivar' : 'Activar'} a ${u.nombre}`} onClick={() => setACambiar(u)}>
            <Power size={16} />
          </button>
        )}
      </>
    )
  }

  return (
    <>
      <div className="ui-pagehead">
        <div>
          <h1 className="ui-pagehead__title">Usuarios del personal</h1>
          <div className="ui-pagehead__meta">
            <span>Administradores de institución, médicos y cuentas de administración general.</span>
          </div>
        </div>
        <div className="ui-pagehead__actions">
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setEditando('nuevo')}>
            <Plus size={16} weight="bold" />
            Nuevo usuario
          </button>
        </div>
      </div>

      <DataTable
        columns={columnas}
        rows={usuarios}
        loading={cargando}
        error={error}
        onRetry={() => cargar()}
        rowActions={acciones}
        initialSort={{ key: 'nombre', dir: 'asc' }}
        caption="Usuarios del personal"
        toolbar={
          <>
            <label className="ui-search">
              <input
                type="search"
                className="ui-search__input ui-search__input--plain"
                placeholder="Buscar por nombre, email o matrícula"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label="Buscar por nombre, email o matrícula"
              />
            </label>
            <select className="ui-select" value={filtros.rol} onChange={(e) => actualizarParam('rol', e.target.value)} aria-label="Rol">
              <option value="">Todos los roles</option>
              {ROLES_PERSONAL.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <select className="ui-select" value={filtros.centro_id} onChange={(e) => actualizarParam('centro_id', e.target.value)} aria-label="Institución">
              <option value="">Todas las instituciones</option>
              {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select className="ui-select" value={filtros.activo} onChange={(e) => actualizarParam('activo', e.target.value)} aria-label="Estado">
              <option value="">Todos los estados</option>
              <option value="true">Activas</option>
              <option value="false">Desactivadas</option>
            </select>
            {hayFiltros && (
              <button
                type="button"
                className="ui-btn ui-btn--quiet ui-btn--sm"
                onClick={() => {
                  setBusqueda('')
                  setParams({}, { replace: true })
                }}
              >
                Limpiar filtros
              </button>
            )}
          </>
        }
        empty={
          hayFiltros
            ? { title: 'Ningún usuario coincide con los filtros', text: 'Probá con otros filtros o limpialos.' }
            : { icon: <UsersThree size={22} />, title: 'Todavía no hay usuarios del personal', text: 'Creá cuentas para los administradores de cada institución y para los médicos.' }
        }
      />

      <UsuarioModal
        open={editando !== null}
        usuario={editando === 'nuevo' ? null : editando}
        centros={centros}
        centroInicial={filtros.centro_id}
        onClose={() => setEditando(null)}
        onCreado={(u) => {
          setUsuarios((lista) => [...lista, u])
          toast.ok(`Cuenta de ${u.nombre} creada.`)
        }}
        onActualizado={(u) => {
          reemplazar(u)
          setEditando(null)
          toast.ok('Usuario actualizado.')
        }}
      />

      <ConfirmDialog
        open={!!aCambiar}
        title={aCambiar?.activo ? `Desactivar a ${aCambiar?.nombre}` : `Activar a ${aCambiar?.nombre}`}
        confirmLabel={aCambiar?.activo ? 'Desactivar' : 'Activar'}
        tone={aCambiar?.activo ? 'danger' : 'neutral'}
        onConfirm={confirmarCambio}
        onCancel={() => setACambiar(null)}
      >
        {aCambiar?.activo ? (
          <p>No va a poder ingresar y sus sesiones abiertas dejan de funcionar. Su historial de atenciones se conserva.</p>
        ) : (
          <p>Va a poder volver a ingresar con su contraseña actual.</p>
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

const VACIO = { email: '', nombre: '', rol: 'OPERADOR_CENTRO', centro_id: '', matricula: '', especialidad_ids: [] }

function UsuarioModal({ open, usuario, centros, centroInicial, onClose, onCreado, onActualizado }) {
  const esNuevo = !usuario
  const [form, setForm] = useState(VACIO)
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [creado, setCreado] = useState(null)
  const [especialidades, setEspecialidades] = useState([])
  const [cargandoEsp, setCargandoEsp] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      usuario
        ? {
            email: usuario.email,
            nombre: usuario.nombre,
            rol: usuario.rol,
            centro_id: usuario.centro_id ? String(usuario.centro_id) : '',
            matricula: usuario.matricula || '',
            especialidad_ids: [],
          }
        : { ...VACIO, centro_id: centroInicial || '' }
    )
    setErrores({})
    setErrorGeneral(null)
    setCreado(null)
  }, [open, usuario, centroInicial])

  // Especialidades activas del centro elegido (sólo en el alta de médicos)
  useEffect(() => {
    if (!open || !esNuevo || form.rol !== 'MEDICO' || !form.centro_id) {
      setEspecialidades([])
      return
    }
    setCargandoEsp(true)
    listarEspecialidadesGestion(form.centro_id)
      .then((lista) => setEspecialidades(lista.filter((e) => e.activo)))
      .catch(() => setEspecialidades([]))
      .finally(() => setCargandoEsp(false))
    setForm((f) => ({ ...f, especialidad_ids: [] }))
  }, [open, esNuevo, form.rol, form.centro_id])

  const set = (campo) => (e) => {
    setForm((f) => ({ ...f, [campo]: e.target.value }))
    setErrores((er) => ({ ...er, [campo]: undefined }))
  }

  const alternarEspecialidad = (id) =>
    setForm((f) => ({
      ...f,
      especialidad_ids: f.especialidad_ids.includes(id)
        ? f.especialidad_ids.filter((x) => x !== id)
        : [...f.especialidad_ids, id],
    }))

  const esAdminGeneral = usuario?.rol === 'ADMIN'

  const enviar = async (e) => {
    e.preventDefault()
    const locales = {}
    if (!form.nombre.trim()) locales.nombre = 'Ingresá nombre y apellido.'
    if (esNuevo && !/^\S+@\S+\.\S+$/.test(form.email.trim())) locales.email = 'Ingresá un email válido.'
    if (!esAdminGeneral && !form.centro_id) locales.centro_id = 'Elegí la institución.'
    setErrores(locales)
    if (Object.keys(locales).length) return

    setGuardando(true)
    setErrorGeneral(null)
    try {
      if (esNuevo) {
        const datos = {
          email: form.email.trim(),
          nombre: form.nombre.trim(),
          rol: form.rol,
          centro_id: Number(form.centro_id),
        }
        if (form.rol === 'MEDICO') {
          datos.matricula = form.matricula.trim()
          datos.especialidad_ids = form.especialidad_ids
        }
        const u = await crearUsuario(datos)
        setCreado(u)
        onCreado(u)
      } else {
        const cambios = {}
        if (form.nombre.trim() !== usuario.nombre) cambios.nombre = form.nombre.trim()
        if (!esAdminGeneral && form.rol !== usuario.rol) cambios.rol = form.rol
        if (!esAdminGeneral && Number(form.centro_id) !== usuario.centro_id) cambios.centro_id = Number(form.centro_id)
        if (form.rol === 'MEDICO' && form.matricula.trim() !== (usuario.matricula || '')) cambios.matricula = form.matricula.trim()
        const u = Object.keys(cambios).length ? await actualizarUsuario(usuario.id, cambios) : usuario
        onActualizado(u)
      }
    } catch (err) {
      setErrores(err.campos || {})
      setErrorGeneral(Object.keys(err.campos || {}).length ? null : err.message)
    } finally {
      setGuardando(false)
    }
  }

  const opcionesCentro = centros.map((c) => ({ id: String(c.id), label: c.activo ? c.nombre : `${c.nombre} (inactiva)` }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      bloqueado={guardando}
      title={creado ? 'Usuario creado' : esNuevo ? 'Nuevo usuario' : `Editar a ${usuario?.nombre}`}
      size="lg"
      footer={
        creado ? (
          <button type="button" className="ui-btn ui-btn--dark" onClick={onClose}>Listo</button>
        ) : (
          <>
            <button type="button" className="ui-btn ui-btn--quiet" onClick={onClose} disabled={guardando}>Cancelar</button>
            <button type="submit" form="form-usuario" className="ui-btn ui-btn--primary" disabled={guardando}>
              {guardando ? 'Guardando…' : esNuevo ? 'Crear cuenta' : 'Guardar cambios'}
            </button>
          </>
        )
      }
    >
      {creado ? (
        <div className="ui-form">
          <p className="ui-confirm__text">
            <strong>{creado.nombre}</strong> ya puede ingresar como {etiquetaRolPersonal(creado.rol).toLowerCase()} de {creado.centro_nombre}.
          </p>
          <PasswordTemporal email={creado.email} password={creado.password_temporal} />
        </div>
      ) : (
        <form id="form-usuario" className="ui-form" onSubmit={enviar} noValidate>
          {errorGeneral && (
            <div className="ui-alert" role="alert">
              <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{errorGeneral}</span>
            </div>
          )}
          <div className="ui-grid-2">
            <TextField label="Nombre y apellido" required autoFocus value={form.nombre} onChange={set('nombre')} error={errores.nombre} maxLength={150} />
            <TextField
              label="Email"
              type="email"
              required={esNuevo}
              disabled={!esNuevo}
              autoComplete="off"
              value={form.email}
              onChange={set('email')}
              error={errores.email}
              help={esNuevo ? 'Lo usa para ingresar.' : 'El email no se puede cambiar.'}
            />
            {esAdminGeneral ? (
              <p className="ui-help ui-span-2">Las cuentas de administración general no cambian de rol ni de institución.</p>
            ) : (
              <>
                <SelectField label="Rol" required value={form.rol} onChange={set('rol')} error={errores.rol} options={ROLES_ALTA} />
                <SelectField
                  label="Institución"
                  required
                  value={form.centro_id}
                  onChange={set('centro_id')}
                  error={errores.centro_id}
                  options={opcionesCentro}
                  placeholder="Elegí una institución"
                />
              </>
            )}
            {form.rol === 'MEDICO' && (
              <TextField label="Matrícula" value={form.matricula} onChange={set('matricula')} error={errores.matricula} maxLength={50} className="ui-mono-input" />
            )}
          </div>

          {esNuevo && form.rol === 'MEDICO' && (
            <fieldset className="ui-fieldset">
              <legend className="ui-label">Especialidades en la institución</legend>
              {!form.centro_id ? (
                <p className="ui-help">Elegí la institución para ver sus especialidades.</p>
              ) : cargandoEsp ? (
                <div className="ui-skeleton" style={{ height: 38 }} />
              ) : especialidades.length === 0 ? (
                <p className="ui-help">La institución no tiene especialidades activas. Podés asignarlas después desde su gestión.</p>
              ) : (
                <div className="ui-chips" style={{ marginTop: 0 }}>
                  {especialidades.map((esp) => {
                    const activa = form.especialidad_ids.includes(esp.id)
                    return (
                      <button
                        key={esp.id}
                        type="button"
                        aria-pressed={activa}
                        className={`ui-chip ui-chip--btn ui-chip--lg${activa ? ' ui-chip--ink' : ''}`}
                        onClick={() => alternarEspecialidad(esp.id)}
                      >
                        {esp.nombre}
                      </button>
                    )
                  })}
                </div>
              )}
              {errores.especialidad_ids && <span className="ui-error-text">{errores.especialidad_ids}</span>}
            </fieldset>
          )}

          {esNuevo && (
            <p className="ui-help">La contraseña inicial se genera automáticamente y se muestra una sola vez al crear la cuenta.</p>
          )}
        </form>
      )}
    </Modal>
  )
}
