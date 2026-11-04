/**
 * EspecialidadesCentro.jsx - Especialidades que ofrece la institución (AE5-10, #40).
 *
 *   /panel-centro/gestion/especialidades            (OPERADOR_CENTRO: su centro)
 *   /panel-centro/gestion/especialidades?centro=:id (ADMIN: cualquier centro)
 *
 * - Lista con estado, médicos asignados, médicos disponibles ahora y
 *   pacientes derivados abiertos.
 * - "Agregar especialidad" busca en el catálogo global. Si no existe, el
 *   operador tiene que pedírsela al administrador general.
 * - Activar/desactivar con confirmación. Si hay derivaciones abiertas el
 *   backend responde 409 y se muestra la advertencia con "Desactivar igualmente".
 * - Al desactivarla desaparece del modal de derivación del panel de guardia.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FirstAidKit, MagnifyingGlass, Plus, Power, Stethoscope, WarningCircle } from '@phosphor-icons/react'
import DataTable from '../../components/ui/DataTable.jsx'
import Modal from '../../components/ui/Modal.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import StatusBadge from '../../components/ui/StatusBadge.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { IconoEspecialidad } from '../../utils/iconosEspecialidad.jsx'
import { useCentroGestion } from './GestionLayout.jsx'
import {
  cambiarEstadoEspecialidad,
  listarCatalogoEspecialidades,
  listarEspecialidadesGestion,
  vincularEspecialidad,
} from '../../api/admin.js'

export default function EspecialidadesCentro() {
  const { centroId, esAdmin, ruta } = useCentroGestion()
  const toast = useToast()

  const [especialidades, setEspecialidades] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [agregando, setAgregando] = useState(false)
  const [aCambiar, setACambiar] = useState(null)
  const [conflicto, setConflicto] = useState(null)

  const cargar = useCallback(async () => {
    if (!centroId) return
    setCargando(true)
    setError(null)
    try {
      setEspecialidades(await listarEspecialidadesGestion(centroId))
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [centroId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const abrirCambio = (esp) => {
    setConflicto(null)
    setACambiar(esp)
  }

  const confirmarCambio = async () => {
    const esp = aCambiar
    try {
      await cambiarEstadoEspecialidad(centroId, esp.id, !esp.activo, Boolean(conflicto))
    } catch (err) {
      if (err.status === 409) {
        setConflicto({ mensaje: err.message, cantidad: err.detalles?.derivaciones_abiertas })
        return
      }
      throw err
    }
    setACambiar(null)
    setConflicto(null)
    toast.ok(`${esp.nombre} quedó ${esp.activo ? 'deshabilitada' : 'habilitada'} en el centro.`)
    cargar()
  }

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
            {e.descripcion && <div className="ui-person__sub ui-clamp">{e.descripcion}</div>}
          </div>
        </div>
      ),
    },
    { key: 'activo', label: 'Estado', sortable: true, render: (e) => <StatusBadge activo={e.activo} labels={['Habilitada', 'Deshabilitada']} /> },
    { key: 'medicos', label: 'Médicos', sortable: true, align: 'right', render: (e) => <span className="ui-mono">{e.medicos}</span> },
    {
      key: 'medicos_disponibles',
      label: 'Disponibles ahora',
      mobileLabel: 'Disponibles',
      sortable: true,
      align: 'right',
      sortValue: (e) => e.medicos_disponibles ?? -1,
      render: (e) =>
        e.medicos_disponibles === null ? (
          <span className="ui-muted">—</span>
        ) : (
          <span className={`ui-chip${e.medicos_disponibles ? ' ui-chip--ok' : ''}`}>
            <span className={`ui-dot${e.medicos_disponibles ? ' ui-dot--ok' : ''}`} aria-hidden="true" />
            {e.medicos_disponibles}
          </span>
        ),
    },
    {
      key: 'derivaciones_abiertas',
      label: 'Derivados abiertos',
      mobileLabel: 'Derivados',
      sortable: true,
      align: 'right',
      render: (e) => <span className={`ui-mono${e.derivaciones_abiertas ? ' ui-text-accent' : ''}`}>{e.derivaciones_abiertas}</span>,
    },
  ]

  const acciones = (e) => (
    <>
      <Link to={ruta('medicos', { especialidad: e.id })} className="ui-btn ui-btn--quiet ui-btn--sm">
        <Stethoscope size={16} />
        Ver médicos
      </Link>
      <button
        type="button"
        className="ui-btn ui-btn--quiet ui-btn--sm ui-btn--icon"
        title={e.activo ? 'Deshabilitar' : 'Habilitar'}
        aria-label={`${e.activo ? 'Deshabilitar' : 'Habilitar'} ${e.nombre}`}
        onClick={() => abrirCambio(e)}
      >
        <Power size={16} />
      </button>
    </>
  )

  const vinculadas = useMemo(() => new Map(especialidades.map((e) => [e.id, e])), [especialidades])

  return (
    <>
      <div className="ui-pagehead">
        <div>
          <h1 className="ui-pagehead__title">Especialidades del centro</h1>
          <div className="ui-pagehead__meta">
            <span>Las habilitadas aparecen en la derivación del panel de guardia.</span>
          </div>
        </div>
        <div className="ui-pagehead__actions">
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setAgregando(true)}>
            <Plus size={16} weight="bold" />
            Agregar especialidad
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
        searchPlaceholder="Buscar especialidad"
        searchKeys={(e) => [e.nombre, e.codigo]}
        rowActions={acciones}
        initialSort={{ key: 'nombre', dir: 'asc' }}
        caption="Especialidades del centro"
        empty={{
          icon: <FirstAidKit size={22} />,
          title: 'El centro todavía no ofrece especialidades',
          text: 'Agregalas desde el catálogo de la red para poder derivar pacientes.',
          action: (
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => setAgregando(true)}>
              <Plus size={16} weight="bold" />
              Agregar especialidad
            </button>
          ),
        }}
      />

      <AgregarEspecialidad
        open={agregando}
        centroId={centroId}
        vinculadas={vinculadas}
        esAdmin={esAdmin}
        onClose={() => setAgregando(false)}
        onAgregada={(esp) => {
          setAgregando(false)
          toast.ok(`${esp.nombre} quedó habilitada en el centro.`)
          cargar()
        }}
      />

      <ConfirmDialog
        open={!!aCambiar}
        title={aCambiar?.activo ? `Deshabilitar ${aCambiar?.nombre}` : `Habilitar ${aCambiar?.nombre}`}
        confirmLabel={conflicto ? 'Deshabilitar igualmente' : aCambiar?.activo ? 'Deshabilitar' : 'Habilitar'}
        tone={aCambiar?.activo ? 'danger' : 'neutral'}
        onConfirm={confirmarCambio}
        onCancel={() => {
          setACambiar(null)
          setConflicto(null)
        }}
      >
        {conflicto ? (
          <div className="ui-alert" role="alert" style={{ marginBottom: 0 }}>
            <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Tiene {conflicto.cantidad ?? 'algunos'} paciente(s) derivado(s) o en atención. Los pacientes ya derivados siguen su atención, pero no se van a poder hacer derivaciones nuevas a esta especialidad.
            </span>
          </div>
        ) : aCambiar?.activo ? (
          <>
            <p>Deja de aparecer en el modal de derivación del panel de guardia. Los médicos conservan su asignación y el historial se mantiene.</p>
            {aCambiar?.derivaciones_abiertas > 0 && (
              <p><strong>Tiene {aCambiar.derivaciones_abiertas} paciente(s) derivado(s) o en atención.</strong></p>
            )}
          </>
        ) : (
          <p>Vuelve a aparecer en la derivación del panel de guardia con los médicos que tenga asignados.</p>
        )}
      </ConfirmDialog>
    </>
  )
}

function AgregarEspecialidad({ open, centroId, vinculadas, esAdmin, onClose, onAgregada }) {
  const [catalogo, setCatalogo] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(null)

  useEffect(() => {
    if (!open) return
    setBusqueda('')
    setError(null)
    setCargando(true)
    listarCatalogoEspecialidades()
      .then(setCatalogo)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [open])

  const opciones = useMemo(() => {
    const q = busqueda
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
    return catalogo
      .filter((e) => !vinculadas.get(e.id)?.activo)
      .filter((e) =>
        !q ||
        `${e.nombre} ${e.codigo}`
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .includes(q)
      )
  }, [catalogo, vinculadas, busqueda])

  const agregar = async (esp) => {
    setGuardando(esp.id)
    setError(null)
    try {
      await vincularEspecialidad(centroId, esp.id)
      onAgregada(esp)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} bloqueado={guardando !== null} title="Agregar especialidad" description="Elegí una especialidad del catálogo de la red.">
      <div className="ui-form">
        {error && (
          <div className="ui-alert" role="alert">
            <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
        <label className="ui-search">
          <MagnifyingGlass size={16} aria-hidden="true" />
          <input
            type="search"
            className="ui-search__input"
            placeholder="Buscar en el catálogo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar en el catálogo"
            autoFocus
          />
        </label>

        {cargando ? (
          <div className="ui-stack" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="ui-skeleton" style={{ height: 48 }} />)}
          </div>
        ) : opciones.length === 0 ? (
          <div className="ui-empty" style={{ padding: '28px 12px' }}>
            <p className="ui-empty__title">{busqueda ? `No hay "${busqueda}" en el catálogo` : 'Ya están todas habilitadas'}</p>
            {busqueda && (
              <p className="ui-empty__text">
                {esAdmin ? (
                  <>Creala primero en el <Link to="/admin/especialidades">catálogo de especialidades</Link>.</>
                ) : (
                  'Pedile al administrador general que la cree en el catálogo de la red.'
                )}
              </p>
            )}
          </div>
        ) : (
          <ul className="ui-picklist">
            {opciones.map((e) => {
              const previa = vinculadas.get(e.id)
              return (
                <li key={e.id}>
                  <button type="button" className="ui-picklist__item" onClick={() => agregar(e)} disabled={guardando !== null}>
                    <span className="ui-icon-tile" aria-hidden="true"><IconoEspecialidad nombre={e.icono} /></span>
                    <span className="ui-picklist__text">
                      <span className="ui-person__name">{e.nombre}</span>
                      <span className="ui-person__sub">{previa ? 'Deshabilitada en este centro: se vuelve a habilitar' : e.descripcion || e.codigo}</span>
                    </span>
                    <span className="ui-picklist__cta">{guardando === e.id ? 'Agregando…' : previa ? 'Habilitar' : 'Agregar'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
