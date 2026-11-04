/**
 * InstitucionDetalle.jsx - Detalle de una institución para el superadmin (AE5-07, #37).
 *
 * - Datos generales y mapa.
 * - Resumen de especialidades, médicos y operadores, con acceso a la gestión
 *   del centro en modo superadmin (/panel-centro/gestion/...?centro=:id).
 * - Administradores de la institución (OPERADOR_CENTRO) y alta de uno nuevo
 *   vía POST /admin/usuarios/ (la contraseña temporal se muestra una sola vez).
 * - Abrir panel de guardia y activar/desactivar.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  FirstAidKit,
  MapPin,
  PencilSimple,
  Phone,
  Plus,
  Power,
  SquaresFour,
  Stethoscope,
  UserCircle,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react'
import MapaPin from '../../components/MapaPin.jsx'
import Modal from '../../components/ui/Modal.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import PasswordTemporal from '../../components/ui/PasswordTemporal.jsx'
import StatusBadge from '../../components/ui/StatusBadge.jsx'
import { TextField } from '../../components/ui/Field.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import {
  activarCentro,
  crearUsuario,
  desactivarCentro,
  etiquetaTipo,
  listarTodosLosUsuarios,
  obtenerCentroAdmin,
} from '../../api/admin.js'
import { iniciales } from '../../utils/roles.js'

function formatearFecha(iso) {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function InstitucionDetalle() {
  const { id } = useParams()
  const toast = useToast()

  const [centro, setCentro] = useState(null)
  const [operadores, setOperadores] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [confirmarEstado, setConfirmarEstado] = useState(false)
  const [asignando, setAsignando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [c, ops] = await Promise.all([
        obtenerCentroAdmin(id),
        listarTodosLosUsuarios({ centro_id: id, rol: 'OPERADOR_CENTRO' }),
      ])
      setCentro(c)
      setOperadores(ops)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  const cambiarEstado = async () => {
    const actualizado = centro.activo ? await desactivarCentro(id) : await activarCentro(id)
    setCentro(actualizado)
    setConfirmarEstado(false)
    toast.ok(`${actualizado.nombre} quedó ${actualizado.activo ? 'activa' : 'inactiva'}.`)
  }

  if (cargando && !centro) {
    return (
      <div aria-busy="true">
        <div className="ui-skeleton" style={{ height: 28, width: 300, marginBottom: 12 }} />
        <div className="ui-skeleton" style={{ height: 16, width: 360, marginBottom: 24 }} />
        <div className="ui-skeleton" style={{ height: 96, marginBottom: 20 }} />
        <div className="ui-skeleton" style={{ height: 320 }} />
      </div>
    )
  }

  if (error && !centro) {
    return (
      <div className="ui-card">
        <div className="ui-empty" role="alert">
          <div className="ui-empty__icon ui-empty__icon--alert"><WarningCircle size={22} /></div>
          <p className="ui-empty__title">No se pudo cargar la institución</p>
          <p className="ui-empty__text">{error}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
            <button type="button" className="ui-btn ui-btn--sm" onClick={cargar}>Reintentar</button>
            <Link to="/admin/instituciones" className="ui-btn ui-btn--quiet ui-btn--sm">Volver al listado</Link>
          </div>
        </div>
      </div>
    )
  }

  const gestion = (seccion) => `/panel-centro/gestion/${seccion}?centro=${centro.id}`

  return (
    <>
      <Link to="/admin/instituciones" className="ui-backlink">
        <ArrowLeft size={16} />
        Instituciones
      </Link>

      <div className="ui-pagehead">
        <div>
          <h1 className="ui-pagehead__title">{centro.nombre}</h1>
          <div className="ui-pagehead__meta">
            <span>{etiquetaTipo(centro.tipo)}</span>
            <span><MapPin size={15} />{centro.direccion}, {centro.ciudad}</span>
            {centro.telefono && <span><Phone size={15} />{centro.telefono}</span>}
            <StatusBadge activo={centro.activo} labels={['Activa', 'Inactiva']} />
          </div>
        </div>
        <div className="ui-pagehead__actions">
          <button type="button" className="ui-btn ui-btn--quiet" onClick={() => setConfirmarEstado(true)}>
            <Power size={16} />
            {centro.activo ? 'Desactivar' : 'Activar'}
          </button>
          <Link to={`/admin/instituciones/${centro.id}/editar`} className="ui-btn">
            <PencilSimple size={16} />
            Editar
          </Link>
          {centro.activo && (
            <Link to={`/panel-centro?centro=${centro.id}`} className="ui-btn ui-btn--dark">
              <SquaresFour size={16} />
              Abrir panel de guardia
            </Link>
          )}
        </div>
      </div>

      {!centro.activo && (
        <div className="ui-alert" role="status">
          <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Esta institución está inactiva: no aparece en el mapa público ni recibe solicitudes.</span>
        </div>
      )}

      <section className="ui-kpis" style={{ '--kpis': 3 }} aria-label="Resumen de la institución">
        <Link to={gestion('especialidades')} className="ui-stat ui-stat--link">
          <div className="ui-stat__label"><FirstAidKit size={15} /> Especialidades activas</div>
          <div className="ui-stat__value">{centro.especialidades_activas}</div>
          <div className="ui-stat__hint">Gestionar especialidades</div>
        </Link>
        <Link to={gestion('medicos')} className="ui-stat ui-stat--link">
          <div className="ui-stat__label"><Stethoscope size={15} /> Médicos asignados</div>
          <div className="ui-stat__value">{centro.medicos_asignados}</div>
          <div className="ui-stat__hint">Gestionar plantel</div>
        </Link>
        <a href="#administradores" className="ui-stat ui-stat--link">
          <div className="ui-stat__label"><UsersThree size={15} /> Administradores</div>
          <div className="ui-stat__value">{centro.operadores}</div>
          <div className="ui-stat__hint">Ver administradores</div>
        </a>
      </section>

      <div className="ui-split">
        <div className="ui-stack">
          <section className="ui-card" id="administradores">
            <div className="ui-card__head">
              <h2 className="ui-h2">Administradores de la institución</h2>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => setAsignando(true)}>
                <Plus size={16} weight="bold" />
                Asignar administrador
              </button>
            </div>
            {operadores.length === 0 ? (
              <div className="ui-empty">
                <div className="ui-empty__icon"><UserCircle size={22} /></div>
                <p className="ui-empty__title">Sin administradores asignados</p>
                <p className="ui-empty__text">Asigná a alguien para que gestione la guardia, las especialidades y el plantel de este centro.</p>
              </div>
            ) : (
              <ul className="ui-rows">
                {operadores.map((op) => (
                  <li key={op.id} className="ui-row">
                    <div className="ui-person">
                      <span className="ui-initials" aria-hidden="true">{iniciales(op.nombre)}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="ui-person__name">{op.nombre}</div>
                        <div className="ui-person__sub">{op.email} · último acceso {formatearFecha(op.ultimo_acceso)}</div>
                      </div>
                    </div>
                    <div className="ui-row__aside">
                      <StatusBadge activo={op.activo} labels={['Activa', 'Desactivada']} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="ui-card__foot">
              <Link to={`/admin/usuarios?centro_id=${centro.id}`} className="ui-btn ui-btn--quiet ui-btn--sm">
                Ver todo el personal de la institución
              </Link>
            </div>
          </section>
        </div>

        <aside className="ui-stack">
          <section className="ui-card">
            <div className="ui-card__head"><h2 className="ui-h2">Ubicación</h2></div>
            <MapaPin lat={Number(centro.latitud)} lon={Number(centro.longitud)} alto={240} />
            <dl className="ui-kv ui-card__pad">
              <dt>Dirección</dt><dd>{centro.direccion}</dd>
              <dt>Ciudad</dt><dd>{centro.ciudad}, {centro.provincia}</dd>
              <dt>País</dt><dd>{centro.pais}</dd>
              <dt>Coordenadas</dt><dd className="ui-mono">{Number(centro.latitud).toFixed(5)}, {Number(centro.longitud).toFixed(5)}</dd>
              <dt>Atiende 24 h</dt><dd>{centro.atiende_24h ? 'Sí' : 'No'}</dd>
              <dt>Alta</dt><dd>{formatearFecha(centro.creado_en)}</dd>
            </dl>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmarEstado}
        title={centro.activo ? `Desactivar ${centro.nombre}` : `Activar ${centro.nombre}`}
        confirmLabel={centro.activo ? 'Desactivar' : 'Activar'}
        tone={centro.activo ? 'danger' : 'neutral'}
        onConfirm={cambiarEstado}
        onCancel={() => setConfirmarEstado(false)}
      >
        {centro.activo ? (
          <>
            <p>La institución deja de aparecer en el mapa público y no recibe nuevas solicitudes.</p>
            <p>Sus solicitudes, atenciones e historial se conservan.</p>
          </>
        ) : (
          <p>La institución vuelve a aparecer en el mapa público y puede recibir solicitudes.</p>
        )}
      </ConfirmDialog>

      <AsignarAdministrador
        open={asignando}
        centro={centro}
        onClose={() => setAsignando(false)}
        onCreado={() => {
          cargar()
          toast.ok('Administrador asignado.')
        }}
      />
    </>
  )
}

function AsignarAdministrador({ open, centro, onClose, onCreado }) {
  const [form, setForm] = useState({ nombre: '', email: '' })
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [creado, setCreado] = useState(null)

  useEffect(() => {
    if (open) {
      setForm({ nombre: '', email: '' })
      setErrores({})
      setErrorGeneral(null)
      setCreado(null)
    }
  }, [open])

  const enviar = async (e) => {
    e.preventDefault()
    const locales = {}
    if (!form.nombre.trim()) locales.nombre = 'Ingresá nombre y apellido.'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) locales.email = 'Ingresá un email válido.'
    setErrores(locales)
    if (Object.keys(locales).length) return

    setGuardando(true)
    setErrorGeneral(null)
    try {
      const usuario = await crearUsuario({
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        rol: 'OPERADOR_CENTRO',
        centro_id: centro.id,
      })
      setCreado(usuario)
      onCreado?.(usuario)
    } catch (err) {
      setErrores(err.campos || {})
      setErrorGeneral(Object.keys(err.campos || {}).length ? null : err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      bloqueado={guardando}
      title={creado ? 'Administrador creado' : 'Asignar administrador'}
      description={creado ? null : `Crea una cuenta de administración para ${centro.nombre}.`}
      footer={
        creado ? (
          <button type="button" className="ui-btn ui-btn--dark" onClick={onClose}>Listo</button>
        ) : (
          <>
            <button type="button" className="ui-btn ui-btn--quiet" onClick={onClose} disabled={guardando}>Cancelar</button>
            <button type="submit" form="form-asignar-admin" className="ui-btn ui-btn--primary" disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear cuenta'}
            </button>
          </>
        )
      }
    >
      {creado ? (
        <div className="ui-form">
          <p className="ui-confirm__text">
            <strong>{creado.nombre}</strong> ya puede ingresar con su email y esta contraseña. Va a ver el panel de {centro.nombre}.
          </p>
          <PasswordTemporal email={creado.email} password={creado.password_temporal} />
        </div>
      ) : (
        <form id="form-asignar-admin" className="ui-form" onSubmit={enviar} noValidate>
          {errorGeneral && (
            <div className="ui-alert" role="alert">
              <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{errorGeneral}</span>
            </div>
          )}
          <TextField
            label="Nombre y apellido"
            required
            autoFocus
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            error={errores.nombre}
          />
          <TextField
            label="Email"
            type="email"
            required
            autoComplete="off"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            error={errores.email}
            help="Lo usa para ingresar. La contraseña inicial se genera automáticamente."
          />
        </form>
      )}
    </Modal>
  )
}
