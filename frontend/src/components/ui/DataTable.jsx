/**
 * DataTable - Tabla de las consolas con búsqueda, orden, paginado y estados.
 *
 *   <DataTable
 *     columns={[
 *       { key: 'nombre', label: 'Nombre', sortable: true, render: (r) => <b>{r.nombre}</b> },
 *       { key: 'ciudad', label: 'Ciudad', sortable: true, hideOnMobile: true },
 *     ]}
 *     rows={centros}
 *     loading={cargando}
 *     error={error}
 *     onRetry={recargar}
 *     searchable
 *     searchKeys={(r) => [r.nombre, r.direccion]}
 *     rowActions={(r) => <button>…</button>}
 *     empty={{ title: 'Sin instituciones', text: '…', action: <button/> }}
 *   />
 *
 * Ordena, busca y pagina en el cliente (las listas de la red son chicas; los
 * filtros de servidor se resuelven en la pantalla antes de pasar `rows`).
 * Debajo de 720px la tabla se muestra como tarjetas: la primera columna es el
 * título y el resto se lista como "etiqueta: valor".
 */

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowClockwise,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  MagnifyingGlass,
  Tray,
  WarningCircle,
} from '@phosphor-icons/react'

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function valorOrden(col, fila) {
  const v = col.sortValue ? col.sortValue(fila) : fila[col.key]
  if (typeof v === 'string') return normalizar(v)
  if (typeof v === 'boolean') return v ? 1 : 0
  return v ?? ''
}

export default function DataTable({
  columns,
  rows = [],
  rowKey = (r) => r.id,
  loading = false,
  error = null,
  onRetry,
  searchable = false,
  searchPlaceholder = 'Buscar…',
  searchKeys,
  pageSize = 20,
  rowActions,
  onRowClick,
  empty = {},
  toolbar,
  initialSort,
  caption,
}) {
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState(initialSort || null) // { key, dir: 'asc' | 'desc' }
  const [pagina, setPagina] = useState(1)

  const filtradas = useMemo(() => {
    if (!searchable || !busqueda.trim()) return rows
    const q = normalizar(busqueda.trim())
    return rows.filter((r) => {
      const campos = searchKeys ? searchKeys(r) : columns.map((c) => r[c.key])
      return campos.some((c) => normalizar(c).includes(q))
    })
  }, [rows, busqueda, searchable, searchKeys, columns])

  const ordenadas = useMemo(() => {
    if (!orden) return filtradas
    const col = columns.find((c) => c.key === orden.key)
    if (!col) return filtradas
    const signo = orden.dir === 'asc' ? 1 : -1
    return [...filtradas].sort((a, b) => {
      const va = valorOrden(col, a)
      const vb = valorOrden(col, b)
      if (va < vb) return -1 * signo
      if (va > vb) return 1 * signo
      return 0
    })
  }, [filtradas, orden, columns])

  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / pageSize))

  useEffect(() => {
    setPagina(1)
  }, [busqueda, rows])

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas)
  }, [pagina, totalPaginas])

  const visibles = ordenadas.slice((pagina - 1) * pageSize, pagina * pageSize)

  const alternarOrden = (col) => {
    if (!col.sortable) return
    setOrden((o) =>
      o?.key === col.key ? { key: col.key, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: 'asc' }
    )
  }

  const celda = (col, fila) => (col.render ? col.render(fila) : fila[col.key] ?? '—')

  const [titulo, ...resto] = columns

  return (
    <div className="ui-card ui-datatable">
      {(searchable || toolbar) && (
        <div className="ui-datatable__toolbar">
          {searchable && (
            <label className="ui-search">
              <MagnifyingGlass size={16} aria-hidden="true" />
              <input
                type="search"
                className="ui-search__input"
                placeholder={searchPlaceholder}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label={searchPlaceholder}
              />
            </label>
          )}
          {toolbar}
        </div>
      )}

      {error ? (
        <div className="ui-empty" role="alert">
          <div className="ui-empty__icon ui-empty__icon--alert"><WarningCircle size={22} /></div>
          <p className="ui-empty__title">No se pudo cargar la información</p>
          <p className="ui-empty__text">{error}</p>
          {onRetry && (
            <button type="button" className="ui-btn ui-btn--sm" style={{ marginTop: 16 }} onClick={onRetry}>
              <ArrowClockwise size={16} />
              Reintentar
            </button>
          )}
        </div>
      ) : loading ? (
        <div className="ui-rows" aria-busy="true" aria-label="Cargando">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ui-skel-row">
              <div className="ui-skeleton" style={{ height: 14, width: '38%' }} />
              <div className="ui-skeleton" style={{ height: 12, width: '64%' }} />
            </div>
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <div className="ui-empty">
          <div className="ui-empty__icon">{empty.icon || <Tray size={22} />}</div>
          <p className="ui-empty__title">
            {busqueda ? 'Sin resultados para la búsqueda' : empty.title || 'No hay registros'}
          </p>
          {(busqueda || empty.text) && (
            <p className="ui-empty__text">{busqueda ? 'Probá con otro término.' : empty.text}</p>
          )}
          {!busqueda && empty.action && <div style={{ marginTop: 16 }}>{empty.action}</div>}
        </div>
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="ui-table-wrap ui-datatable__table">
            <table className="ui-table">
              {caption && <caption className="ui-sr-only">{caption}</caption>}
              <thead>
                <tr>
                  {columns.map((col) => {
                    const activo = orden?.key === col.key
                    return (
                      <th
                        key={col.key}
                        scope="col"
                        style={col.width ? { width: col.width } : undefined}
                        className={col.align === 'right' ? 'is-right' : undefined}
                        aria-sort={activo ? (orden.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        {col.sortable ? (
                          <button type="button" className="ui-th-sort" onClick={() => alternarOrden(col)}>
                            {col.label}
                            {activo ? (
                              orden.dir === 'asc' ? <CaretUp size={12} /> : <CaretDown size={12} />
                            ) : (
                              <CaretDown size={12} className="ui-th-sort__idle" />
                            )}
                          </button>
                        ) : (
                          col.label
                        )}
                      </th>
                    )
                  })}
                  {rowActions && <th scope="col" className="is-right"><span className="ui-sr-only">Acciones</span></th>}
                </tr>
              </thead>
              <tbody>
                {visibles.map((fila) => (
                  <tr
                    key={rowKey(fila)}
                    className={onRowClick ? 'is-clickable' : undefined}
                    onClick={onRowClick ? () => onRowClick(fila) : undefined}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={col.align === 'right' ? 'is-right' : undefined}>
                        {celda(col, fila)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="is-right" onClick={(e) => e.stopPropagation()}>
                        <div className="ui-row-actions">{rowActions(fila)}</div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: tarjetas */}
          <ul className="ui-datatable__cards">
            {visibles.map((fila) => (
              <li key={rowKey(fila)} className="ui-dcard">
                <div
                  className={`ui-dcard__title${onRowClick ? ' is-clickable' : ''}`}
                  onClick={onRowClick ? () => onRowClick(fila) : undefined}
                >
                  {celda(titulo, fila)}
                </div>
                <dl className="ui-dcard__kv">
                  {resto
                    .filter((c) => !c.hideOnMobile)
                    .map((col) => (
                      <div key={col.key}>
                        <dt>{col.mobileLabel || col.label}</dt>
                        <dd>{celda(col, fila)}</dd>
                      </div>
                    ))}
                </dl>
                {rowActions && <div className="ui-dcard__actions">{rowActions(fila)}</div>}
              </li>
            ))}
          </ul>

          {totalPaginas > 1 && (
            <div className="ui-pager">
              <span className="ui-muted ui-mono">
                {(pagina - 1) * pageSize + 1}–{Math.min(pagina * pageSize, ordenadas.length)} de {ordenadas.length}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className="ui-btn ui-btn--sm"
                  onClick={() => setPagina((p) => p - 1)}
                  disabled={pagina === 1}
                  aria-label="Página anterior"
                >
                  <CaretLeft size={14} />
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--sm"
                  onClick={() => setPagina((p) => p + 1)}
                  disabled={pagina === totalPaginas}
                  aria-label="Página siguiente"
                >
                  <CaretRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
