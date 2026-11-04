/**
 * Instituciones.jsx - Listado de instituciones de la red (AE5-06, #36).
 *
 * - Contadores: activas, inactivas y por tipo (sobre la red completa).
 * - Filtros q / tipo / ciudad / activo reflejados en la URL, resueltos por
 *   GET /admin/centros/ (no depende de geolocalización ni de un radio).
 * - Vista tabla o mapa (?vista=mapa).
 * - Acciones: ver, editar, activar/desactivar (con confirmación) y abrir el
 *   panel de guardia del centro.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Buildings,
  Eye,
  ListBullets,
  MapTrifold,
  PencilSimple,
  Plus,
  Power,
  SquaresFour,
} from '@phosphor-icons/react'
import DataTable from '../../components/ui/DataTable.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import StatusBadge from '../../components/ui/StatusBadge.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import MapaInstituciones from '../../components/MapaInstituciones.jsx'
import {
  TIPOS_CENTRO,
  activarCentro,
  desactivarCentro,
  etiquetaTipo,
  listarTodosLosCentrosAdmin,
} from '../../api/admin.js'

const FILTROS = ['q', 'tipo', 'ciudad', 'activo']

export default function Instituciones() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  // Clave estable: evita recargar si la URL cambia sin que cambien los filtros (ej. ?vista=)
  const claveFiltros = FILTROS.map((f) => params.get(f) || '').join('|')
  const filtros = useMemo(
    () => Object.fromEntries(FILTROS.map((f, i) => [f, claveFiltros.split('|')[i]])),
    [claveFiltros]
  )
  const vista = params.get('vista') === 'mapa' ? 'mapa' : 'tabla'

  const [busqueda, setBusqueda] = useState(filtros.q)
  const [centros, setCentros] = useState([])
  const [red, setRed] = useState([]) // red completa, para contadores y ciudades
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aCambiar, setACambiar] = useState(null)

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

  // Búsqueda con debounce → ?q=
  useEffect(() => {
    if (busqueda === filtros.q) return undefined
    const t = setTimeout(() => actualizarParam('q', busqueda.trim()), 300)
    return () => clearTimeout(t)
  }, [busqueda, filtros.q, actualizarParam])

  const cargarRed = useCallback(() => {
    listarTodosLosCentrosAdmin().then(setRed).catch(() => setRed([]))
  }, [])

  const cargar = useCallback(
    async (signal) => {
      setCargando(true)
      setError(null)
      try {
        setCentros(await listarTodosLosCentrosAdmin(filtros, { signal }))
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

  useEffect(cargarRed, [cargarRed])

  const contadores = useMemo(() => {
    const porTipo = {}
    red.forEach((c) => {
      porTipo[c.tipo] = (porTipo[c.tipo] || 0) + 1
    })
    return {
      activas: red.filter((c) => c.activo).length,
      inactivas: red.filter((c) => !c.activo).length,
      porTipo: TIPOS_CENTRO.filter((t) => porTipo[t.id]).map((t) => ({ ...t, n: porTipo[t.id] })),
    }
  }, [red])

  const ciudades = useMemo(
    () => [...new Set(red.map((c) => c.ciudad).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [red]
  )

  const hayFiltros = FILTROS.some((f) => filtros[f])

  const confirmarCambio = async () => {
    const c = aCambiar
    const actualizado = c.activo ? await desactivarCentro(c.id) : await activarCentro(c.id)
    setCentros((lista) => lista.map((x) => (x.id === c.id ? actualizado : x)))
    setRed((lista) => lista.map((x) => (x.id === c.id ? actualizado : x)))
    setACambiar(null)
    toast.ok(`${c.nombre} quedó ${actualizado.activo ? 'activa' : 'inactiva'}.`)
  }

  const columnas = [
    {
      key: 'nombre',
      label: 'Institución',
      sortable: true,
      render: (c) => (
        <div style={{ minWidth: 0 }}>
          <Link to={`/admin/instituciones/${c.id}`} className="ui-link-strong">{c.nombre}</Link>
          <div className="ui-person__sub">{c.direccion}</div>
        </div>
      ),
    },
    { key: 'tipo', label: 'Tipo', sortable: true, render: (c) => etiquetaTipo(c.tipo) },
    { key: 'ciudad', label: 'Ciudad', sortable: true },
    {
      key: 'telefono',
      label: 'Teléfono',
      hideOnMobile: true,
      render: (c) => (c.telefono ? <span className="ui-mono">{c.telefono}</span> : <span className="ui-muted">—</span>),
    },
    { key: 'atiende_24h', label: '24 h', sortable: true, render: (c) => (c.atiende_24h ? 'Sí' : 'No') },
    {
      key: 'especialidades_activas',
      label: 'Especialidades',
      mobileLabel: 'Especialid.',
      sortable: true,
      align: 'right',
      render: (c) => <span className="ui-mono">{c.especialidades_activas}</span>,
    },
    {
      key: 'medicos_asignados',
      label: 'Médicos',
      sortable: true,
      align: 'right',
      render: (c) => <span className="ui-mono">{c.medicos_asignados}</span>,
    },
    {
      key: 'operadores',
      label: 'Operadores',
      sortable: true,
      align: 'right',
      render: (c) => <span className="ui-mono">{c.operadores}</span>,
    },
    { key: 'activo', label: 'Estado', sortable: true, render: (c) => <StatusBadge activo={c.activo} labels={['Activa', 'Inactiva']} /> },
  ]

  const acciones = (c) => (
    <>
      <Link to={`/admin/instituciones/${c.id}`} className="ui-btn ui-btn--quiet ui-btn--sm ui-btn--icon" title="Ver detalle" aria-label={`Ver ${c.nombre}`}>
        <Eye size={16} />
      </Link>
      <Link to={`/admin/instituciones/${c.id}/editar`} className="ui-btn ui-btn--quiet ui-btn--sm ui-btn--icon" title="Editar" aria-label={`Editar ${c.nombre}`}>
        <PencilSimple size={16} />
      </Link>
      {c.activo && (
        <Link to={`/panel-centro?centro=${c.id}`} className="ui-btn ui-btn--quiet ui-btn--sm ui-btn--icon" title="Abrir panel de guardia" aria-label={`Panel de guardia de ${c.nombre}`}>
          <SquaresFour size={16} />
        </Link>
      )}
      <button
        type="button"
        className="ui-btn ui-btn--quiet ui-btn--sm ui-btn--icon"
        title={c.activo ? 'Desactivar' : 'Activar'}
        aria-label={`${c.activo ? 'Desactivar' : 'Activar'} ${c.nombre}`}
        onClick={() => setACambiar(c)}
      >
        <Power size={16} />
      </button>
    </>
  )

  const toolbar = (
    <>
      <select className="ui-select" value={filtros.tipo} onChange={(e) => actualizarParam('tipo', e.target.value)} aria-label="Tipo">
        <option value="">Todos los tipos</option>
        {TIPOS_CENTRO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <select className="ui-select" value={filtros.ciudad} onChange={(e) => actualizarParam('ciudad', e.target.value)} aria-label="Ciudad">
        <option value="">Todas las ciudades</option>
        {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select className="ui-select" value={filtros.activo} onChange={(e) => actualizarParam('activo', e.target.value)} aria-label="Estado">
        <option value="">Todos los estados</option>
        <option value="true">Activas</option>
        <option value="false">Inactivas</option>
      </select>
      {hayFiltros && (
        <button
          type="button"
          className="ui-btn ui-btn--quiet ui-btn--sm"
          onClick={() => {
            setBusqueda('')
            setParams(vista === 'mapa' ? { vista: 'mapa' } : {}, { replace: true })
          }}
        >
          Limpiar filtros
        </button>
      )}
    </>
  )

  return (
    <>
      <div className="ui-pagehead">
        <div>
          <h1 className="ui-pagehead__title">Instituciones</h1>
          <div className="ui-pagehead__meta">
            <span>Centros de la red, activos e inactivos.</span>
          </div>
        </div>
        <div className="ui-pagehead__actions">
          <div className="ui-segmented" role="group" aria-label="Vista">
            <button type="button" className={vista === 'tabla' ? 'is-active' : ''} onClick={() => actualizarParam('vista', '')}>
              <ListBullets size={16} />
              Tabla
            </button>
            <button type="button" className={vista === 'mapa' ? 'is-active' : ''} onClick={() => actualizarParam('vista', 'mapa')}>
              <MapTrifold size={16} />
              Mapa
            </button>
          </div>
          <Link to="/admin/instituciones/nueva" className="ui-btn ui-btn--primary">
            <Plus size={16} weight="bold" />
            Registrar institución
          </Link>
        </div>
      </div>

      <section className="ui-kpis" style={{ '--kpis': 3 }} aria-label="Resumen de instituciones">
        <div className="ui-stat">
          <div className="ui-stat__label">Activas</div>
          <div className="ui-stat__value">{red.length ? contadores.activas : '-'}</div>
        </div>
        <div className="ui-stat">
          <div className="ui-stat__label">Inactivas</div>
          <div className="ui-stat__value">{red.length ? contadores.inactivas : '-'}</div>
        </div>
        <div className="ui-stat ui-stat--wide">
          <div className="ui-stat__label">Por tipo</div>
          <div className="ui-chips">
            {contadores.porTipo.length === 0 && <span className="ui-muted">-</span>}
            {contadores.porTipo.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ui-chip ui-chip--btn${filtros.tipo === t.id ? ' ui-chip--ink' : ''}`}
                onClick={() => actualizarParam('tipo', filtros.tipo === t.id ? '' : t.id)}
              >
                {t.label} <span className="ui-mono">{t.n}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {vista === 'mapa' ? (
        <div className="ui-card ui-datatable">
          <div className="ui-datatable__toolbar">
            <label className="ui-search">
              <input
                type="search"
                className="ui-search__input ui-search__input--plain"
                placeholder="Buscar por nombre o dirección"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label="Buscar por nombre o dirección"
              />
            </label>
            {toolbar}
          </div>
          {error ? (
            <div className="ui-empty" role="alert"><p className="ui-empty__title">{error}</p></div>
          ) : (
            <>
              <MapaInstituciones centros={centros} onSelect={(c) => navigate(`/admin/instituciones/${c.id}`)} />
              <div className="ui-map-legend">
                <span><span className="ui-dot ui-dot--alert" />Activa</span>
                <span><span className="ui-dot" />Inactiva</span>
                <span className="ui-muted">{cargando ? 'Cargando…' : `${centros.length} en el mapa`}</span>
              </div>
            </>
          )}
        </div>
      ) : (
        <DataTable
          columns={columnas}
          rows={centros}
          loading={cargando}
          error={error}
          onRetry={() => cargar()}
          rowActions={acciones}
          initialSort={{ key: 'nombre', dir: 'asc' }}
          caption="Instituciones de la red"
          toolbar={
            <>
              <label className="ui-search">
                <input
                  type="search"
                  className="ui-search__input ui-search__input--plain"
                  placeholder="Buscar por nombre o dirección"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  aria-label="Buscar por nombre o dirección"
                />
              </label>
              {toolbar}
            </>
          }
          empty={
            hayFiltros
              ? { title: 'Ninguna institución coincide con los filtros', text: 'Probá con otros filtros o limpialos.' }
              : {
                  icon: <Buildings size={22} />,
                  title: 'Todavía no hay instituciones',
                  text: 'Registrá la primera institución de la red.',
                  action: (
                    <Link to="/admin/instituciones/nueva" className="ui-btn ui-btn--primary">
                      <Plus size={16} weight="bold" />
                      Registrar institución
                    </Link>
                  ),
                }
          }
        />
      )}

      <ConfirmDialog
        open={!!aCambiar}
        title={aCambiar?.activo ? `Desactivar ${aCambiar?.nombre}` : `Activar ${aCambiar?.nombre}`}
        confirmLabel={aCambiar?.activo ? 'Desactivar' : 'Activar'}
        tone={aCambiar?.activo ? 'danger' : 'neutral'}
        onConfirm={confirmarCambio}
        onCancel={() => setACambiar(null)}
      >
        {aCambiar?.activo ? (
          <>
            <p>La institución deja de aparecer en el mapa público y en la búsqueda de centros cercanos, y no recibe nuevas solicitudes.</p>
            <p>Sus solicitudes, atenciones e historial se conservan. Podés reactivarla cuando quieras.</p>
          </>
        ) : (
          <p>La institución vuelve a aparecer en el mapa público y puede recibir solicitudes.</p>
        )}
      </ConfirmDialog>
    </>
  )
}
