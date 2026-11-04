/**
 * Especialidades.jsx - Catálogo global de especialidades (AE5-08, #38). Sólo ADMIN.
 *
 * - Tabla: nombre, código, ícono, descripción, centros que la ofrecen, médicos.
 * - Modal Nueva / Editar: el código se genera a partir del nombre hasta que
 *   se edita a mano; el backend valida que nombre y código sean únicos.
 * - "Ver centros": dónde está habilitada (GET /especialidades/{id}/).
 *
 * El selector de derivación de PanelCentro lee estas mismas especialidades,
 * así que los cambios de nombre o ícono se ven ahí sin pasos extra.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Buildings, FirstAidKit, PencilSimple, Plus, WarningCircle } from '@phosphor-icons/react'
import DataTable from '../../components/ui/DataTable.jsx'
import Modal from '../../components/ui/Modal.jsx'
import StatusBadge from '../../components/ui/StatusBadge.jsx'
import { TextField, TextareaField } from '../../components/ui/Field.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { ICONOS_ESPECIALIDAD, IconoEspecialidad } from '../../utils/iconosEspecialidad.jsx'
import {
  actualizarEspecialidad,
  crearEspecialidad,
  listarCatalogoEspecialidades,
  obtenerEspecialidadCatalogo,
} from '../../api/admin.js'

function slugificar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export default function Especialidades() {
  const toast = useToast()
  const [especialidades, setEspecialidades] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null) // null | 'nueva' | especialidad
  const [viendoCentros, setViendoCentros] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setEspecialidades(await listarCatalogoEspecialidades())
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const columnas = [
    {
      key: 'nombre',
      label: 'Especialidad',
      sortable: true,
      render: (e) => (
        <div className="ui-person">
          <span className="ui-icon-tile" aria-hidden="true"><IconoEspecialidad nombre={e.icono} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="ui-person__name">{e.nombre}</div>
            <div className="ui-person__sub ui-mono">{e.codigo}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'descripcion',
      label: 'Descripción',
      hideOnMobile: true,
      render: (e) => (e.descripcion ? <span className="ui-clamp">{e.descripcion}</span> : <span className="ui-muted">—</span>),
    },
    { key: 'centros', label: 'Centros', sortable: true, align: 'right', render: (e) => <span className="ui-mono">{e.centros}</span> },
    { key: 'medicos', label: 'Médicos', sortable: true, align: 'right', render: (e) => <span className="ui-mono">{e.medicos}</span> },
  ]

  const acciones = (e) => (
    <>
      <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={() => setViendoCentros(e)}>
        <Buildings size={16} />
        Ver centros
      </button>
      <button
        type="button"
        className="ui-btn ui-btn--quiet ui-btn--sm ui-btn--icon"
        title="Editar"
        aria-label={`Editar ${e.nombre}`}
        onClick={() => setEditando(e)}
      >
        <PencilSimple size={16} />
      </button>
    </>
  )

  const alGuardar = (guardada, esNueva) => {
    setEspecialidades((lista) =>
      esNueva ? [...lista, guardada] : lista.map((x) => (x.id === guardada.id ? guardada : x))
    )
    setEditando(null)
    toast.ok(esNueva ? `${guardada.nombre} se agregó al catálogo.` : 'Especialidad actualizada.')
  }

  return (
    <>
      <div className="ui-pagehead">
        <div>
          <h1 className="ui-pagehead__title">Especialidades</h1>
          <div className="ui-pagehead__meta">
            <span>Catálogo compartido por todas las instituciones de la red.</span>
          </div>
        </div>
        <div className="ui-pagehead__actions">
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setEditando('nueva')}>
            <Plus size={16} weight="bold" />
            Nueva especialidad
          </button>
        </div>
      </div>

      <DataTable
        columns={columnas}
        rows={especialidades}
        loading={cargando}
        error={error}
        onRetry={cargar}
        searchable
        searchPlaceholder="Buscar por nombre o código"
        searchKeys={(e) => [e.nombre, e.codigo, e.descripcion]}
        rowActions={acciones}
        initialSort={{ key: 'nombre', dir: 'asc' }}
        caption="Catálogo de especialidades"
        empty={{
          icon: <FirstAidKit size={22} />,
          title: 'El catálogo está vacío',
          text: 'Creá la primera especialidad para que las instituciones puedan habilitarla.',
          action: (
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => setEditando('nueva')}>
              <Plus size={16} weight="bold" />
              Nueva especialidad
            </button>
          ),
        }}
      />

      <EspecialidadModal
        especialidad={editando === 'nueva' ? null : editando}
        open={editando !== null}
        onClose={() => setEditando(null)}
        onGuardada={alGuardar}
      />

      <CentrosDeEspecialidad especialidad={viendoCentros} onClose={() => setViendoCentros(null)} />
    </>
  )
}

function EspecialidadModal({ open, especialidad, onClose, onGuardada }) {
  const esNueva = !especialidad
  const [form, setForm] = useState({ nombre: '', codigo: '', descripcion: '', icono: 'stethoscope' })
  const [codigoManual, setCodigoManual] = useState(false)
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      especialidad
        ? {
            nombre: especialidad.nombre,
            codigo: especialidad.codigo,
            descripcion: especialidad.descripcion || '',
            icono: especialidad.icono || 'stethoscope',
          }
        : { nombre: '', codigo: '', descripcion: '', icono: 'stethoscope' }
    )
    setCodigoManual(Boolean(especialidad))
    setErrores({})
    setErrorGeneral(null)
  }, [open, especialidad])

  const cambiarNombre = (e) => {
    const nombre = e.target.value
    setForm((f) => ({ ...f, nombre, codigo: codigoManual ? f.codigo : slugificar(nombre) }))
    setErrores((er) => ({ ...er, nombre: undefined, ...(codigoManual ? {} : { codigo: undefined }) }))
  }

  const enviar = async (e) => {
    e.preventDefault()
    const locales = {}
    if (!form.nombre.trim()) locales.nombre = 'Ingresá el nombre.'
    if (!form.codigo.trim()) locales.codigo = 'Ingresá un código.'
    else if (!/^[a-z0-9_-]+$/.test(form.codigo)) locales.codigo = 'Usá sólo minúsculas, números y guiones.'
    setErrores(locales)
    if (Object.keys(locales).length) return

    setGuardando(true)
    setErrorGeneral(null)
    try {
      const datos = {
        nombre: form.nombre.trim(),
        codigo: form.codigo.trim(),
        descripcion: form.descripcion.trim(),
        icono: form.icono,
      }
      let payload = datos
      if (!esNueva) {
        payload = Object.fromEntries(Object.entries(datos).filter(([k, v]) => v !== (especialidad[k] || '')))
      }
      const guardada = esNueva
        ? await crearEspecialidad(payload)
        : Object.keys(payload).length
          ? await actualizarEspecialidad(especialidad.id, payload)
          : especialidad
      onGuardada(guardada, esNueva)
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
      title={esNueva ? 'Nueva especialidad' : `Editar ${especialidad?.nombre}`}
      size="lg"
      footer={
        <>
          <button type="button" className="ui-btn ui-btn--quiet" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="submit" form="form-especialidad" className="ui-btn ui-btn--primary" disabled={guardando}>
            {guardando ? 'Guardando…' : esNueva ? 'Crear especialidad' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <form id="form-especialidad" className="ui-form" onSubmit={enviar} noValidate>
        {errorGeneral && (
          <div className="ui-alert" role="alert">
            <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{errorGeneral}</span>
          </div>
        )}
        <div className="ui-grid-2">
          <TextField label="Nombre" required autoFocus value={form.nombre} onChange={cambiarNombre} error={errores.nombre} maxLength={100} />
          <TextField
            label="Código"
            required
            className="ui-mono-input"
            value={form.codigo}
            onChange={(e) => {
              setCodigoManual(true)
              setForm((f) => ({ ...f, codigo: e.target.value.toLowerCase() }))
              setErrores((er) => ({ ...er, codigo: undefined }))
            }}
            error={errores.codigo}
            help={codigoManual ? 'Identificador único.' : 'Se genera a partir del nombre; podés editarlo.'}
            maxLength={50}
          />
        </div>
        <TextareaField
          label="Descripción"
          value={form.descripcion}
          onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
          error={errores.descripcion}
          rows={3}
          placeholder="Qué tipo de urgencias atiende"
        />

        <fieldset className="ui-fieldset">
          <legend className="ui-label">Ícono</legend>
          <div className="ui-icon-grid" role="radiogroup" aria-label="Ícono">
            {ICONOS_ESPECIALIDAD.map(({ id, label, Icono }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={form.icono === id}
                className={`ui-icon-option${form.icono === id ? ' is-active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, icono: id }))}
                title={label}
              >
                <Icono size={20} />
                <span className="ui-sr-only">{label}</span>
              </button>
            ))}
          </div>
          {errores.icono && <span className="ui-error-text">{errores.icono}</span>}
        </fieldset>
      </form>
    </Modal>
  )
}

function CentrosDeEspecialidad({ especialidad, onClose }) {
  const [detalle, setDetalle] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!especialidad) return
    setDetalle(null)
    setError(null)
    obtenerEspecialidadCatalogo(especialidad.id).then(setDetalle).catch((err) => setError(err.message))
  }, [especialidad])

  const centros = detalle?.centros_detalle || []

  return (
    <Modal
      open={!!especialidad}
      onClose={onClose}
      variant="drawer"
      title={especialidad ? `Centros con ${especialidad.nombre}` : ''}
      description="Instituciones donde está vinculada esta especialidad."
    >
      {error ? (
        <div className="ui-alert" role="alert">
          <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      ) : !detalle ? (
        <div className="ui-stack" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="ui-skeleton" style={{ height: 44 }} />)}
        </div>
      ) : centros.length === 0 ? (
        <div className="ui-empty">
          <div className="ui-empty__icon"><Buildings size={22} /></div>
          <p className="ui-empty__title">Ninguna institución la ofrece</p>
          <p className="ui-empty__text">Cada institución la habilita desde su gestión de especialidades.</p>
        </div>
      ) : (
        <ul className="ui-rows ui-rows--flush">
          {centros.map((c) => (
            <li key={c.centro_id} className="ui-row">
              <div style={{ minWidth: 0 }}>
                <Link to={`/admin/instituciones/${c.centro_id}`} className="ui-link-strong" onClick={onClose}>
                  {c.centro_nombre}
                </Link>
                {!c.centro_activo && <div className="ui-person__sub">Institución inactiva</div>}
              </div>
              <div className="ui-row__aside">
                <StatusBadge activo={c.activo} labels={['Habilitada', 'Deshabilitada']} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
