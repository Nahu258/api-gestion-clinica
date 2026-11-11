/**
 * HistorialPaciente.jsx - Historial clínico del paciente registrado.
 *
 * - Lista de atenciones con diagnóstico e indicaciones; cada una abre su
 *   detalle en /mi-historial/:id.
 * - Filtros por centro, por texto y orden por fecha.
 * - "Imprimir historial" genera un documento con todas las atenciones
 *   filtradas (desde el diálogo de impresión se puede guardar como PDF).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  ArrowsDownUp,
  CaretRight,
  ClockCounterClockwise,
  MagnifyingGlass,
  MapPin,
  Printer,
  Stethoscope,
  WarningCircle,
} from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext.jsx'
import Navbar from '../components/Navbar.jsx'
import HojaAtencion from '../components/HojaAtencion.jsx'
import { obtenerMiHistorial } from '../api/atencion.js'
import { EN_CURSO, EN_ESPERA, ESTADO, estadoDe, fechaCorta, fechaLarga, hora } from '../utils/solicitudes.js'

export default function HistorialPaciente() {
  const { usuario } = useAuth()

  const [atenciones, setAtenciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [centro, setCentro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [recientesPrimero, setRecientesPrimero] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const data = await obtenerMiHistorial()
      setAtenciones(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // El documento para imprimir sólo existe mientras se imprime (también con Ctrl+P)
  const [imprimiendo, setImprimiendo] = useState(false)
  useEffect(() => {
    const antes = () => flushSync(() => setImprimiendo(true))
    const despues = () => setImprimiendo(false)
    window.addEventListener('beforeprint', antes)
    window.addEventListener('afterprint', despues)
    return () => {
      window.removeEventListener('beforeprint', antes)
      window.removeEventListener('afterprint', despues)
    }
  }, [])

  const imprimir = () => {
    flushSync(() => setImprimiendo(true))
    window.print()
  }

  const centros = useMemo(() => [...new Set(atenciones.map((a) => a.centro_nombre).filter(Boolean))], [atenciones])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return atenciones
      .filter((a) => centro === 'todos' || a.centro_nombre === centro)
      .filter((a) =>
        !q ||
        [a.motivo, a.diagnostico, a.indicaciones, a.medico_nombre, a.especialidad_nombre, a.centro_nombre].some((campo) =>
          (campo || '').toLowerCase().includes(q)
        )
      )
      .sort((a, b) => {
        const fa = new Date(a.atendido_en || a.creado_en)
        const fb = new Date(b.atendido_en || b.creado_en)
        return recientesPrimero ? fb - fa : fa - fb
      })
  }, [atenciones, centro, busqueda, recientesPrimero])

  const resumen = useMemo(() => {
    const atendidas = atenciones.filter((a) => a.estado === ESTADO.ATENDIDO)
    const ultima = atendidas.map((a) => a.atendido_en).filter(Boolean).sort().at(-1)
    return {
      atendidas: atendidas.length,
      enCurso: atenciones.filter((a) => EN_ESPERA.includes(a.estado) || EN_CURSO.includes(a.estado)).length,
      centros: centros.length,
      ultima,
    }
  }, [atenciones, centros])

  const hayFiltros = centro !== 'todos' || busqueda.trim() !== ''

  return (
    <div className="ui-shell">
      <Navbar />

      <main className="ui-page ui-page--mid no-print">
        <header className="ui-pagehead">
          <div>
            <h1 className="ui-pagehead__title">Mi historial clínico</h1>
            <div className="ui-pagehead__meta">
              {usuario?.nombre && <span>{usuario.nombre}</span>}
              {usuario?.email && <span>{usuario.email}</span>}
            </div>
          </div>
          <div className="ui-pagehead__actions">
            <button type="button" className="ui-btn" onClick={imprimir} disabled={visibles.length === 0}>
              <Printer size={18} />
              Imprimir historial
            </button>
            <Link to="/mapa" className="ui-btn ui-btn--primary">
              <MapPin size={18} />
              Buscar guardia
            </Link>
          </div>
        </header>

        {!cargando && atenciones.length > 0 && (
          <section className="ui-kpis" style={{ '--kpis': 4 }} aria-label="Resumen">
            <div className="ui-stat">
              <div className="ui-stat__label">Atenciones completadas</div>
              <div className="ui-stat__value">{resumen.atendidas}</div>
            </div>
            <div className="ui-stat">
              <div className="ui-stat__label">Avisos en curso</div>
              <div className={`ui-stat__value${resumen.enCurso ? ' ui-stat__value--accent' : ''}`}>{resumen.enCurso}</div>
            </div>
            <div className="ui-stat">
              <div className="ui-stat__label">Centros visitados</div>
              <div className="ui-stat__value">{resumen.centros}</div>
            </div>
            <div className="ui-stat">
              <div className="ui-stat__label">Última atención</div>
              <div className="ui-stat__value hp__fecha-kpi">{resumen.ultima ? fechaCorta(resumen.ultima) : '-'}</div>
            </div>
          </section>
        )}

        {atenciones.length > 0 && (
          <div className="hp__filtros">
            <div className="ui-search hp__buscar">
              <MagnifyingGlass size={16} aria-hidden="true" />
              <input
                type="search"
                className="ui-search__input"
                placeholder="Buscar por diagnóstico, médico o motivo"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label="Buscar en el historial"
              />
            </div>
            <select className="ui-select hp__centro" value={centro} onChange={(e) => setCentro(e.target.value)} aria-label="Centro">
              <option value="todos">Todos los centros</option>
              {centros.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="button" className="ui-btn ui-btn--quiet" onClick={() => setRecientesPrimero((v) => !v)}>
              <ArrowsDownUp size={16} />
              {recientesPrimero ? 'Más recientes primero' : 'Más antiguas primero'}
            </button>
          </div>
        )}

        {error && (
          <div className="ui-alert" role="alert">
            <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
            <button type="button" className="ui-linkbtn" onClick={cargar}>Reintentar</button>
          </div>
        )}

        {cargando ? (
          <div className="ui-card" aria-busy="true">
            <div className="ui-rows">
              {[0, 1, 2].map((n) => (
                <div key={n} className="ui-skel-row">
                  <div className="ui-skeleton" style={{ height: 12, width: 140 }} />
                  <div className="ui-skeleton" style={{ height: 16, width: '45%' }} />
                  <div className="ui-skeleton" style={{ height: 12, width: '80%' }} />
                </div>
              ))}
            </div>
          </div>
        ) : visibles.length === 0 ? (
          <div className="ui-card">
            <div className="ui-empty">
              <div className="ui-empty__icon"><ClockCounterClockwise size={22} /></div>
              <p className="ui-empty__title">
                {hayFiltros ? 'Ninguna atención coincide con la búsqueda' : 'Todavía no hay atenciones registradas'}
              </p>
              <p className="ui-empty__text">
                {hayFiltros
                  ? 'Probá con otra palabra o elegí todos los centros.'
                  : 'Cuando un médico cierre una consulta tuya, el diagnóstico y las indicaciones aparecen acá.'}
              </p>
              {hayFiltros ? (
                <button type="button" className="ui-btn" style={{ marginTop: 16 }} onClick={() => { setCentro('todos'); setBusqueda('') }}>
                  Quitar filtros
                </button>
              ) : (
                <Link to="/mapa" className="ui-btn" style={{ marginTop: 16 }}>Ver centros cercanos</Link>
              )}
            </div>
          </div>
        ) : (
          <ol className="ui-card ui-rows hp__lista">
            {visibles.map((a) => {
              const fecha = a.atendido_en || a.creado_en
              const estado = estadoDe(a.estado)
              return (
                <li key={a.id}>
                  <Link to={`/mi-historial/${a.id}`} className="hp__item" aria-label={`Ver la consulta del ${fechaCorta(fecha)} en ${a.centro_nombre || 'el centro'}`}>
                    <div className="hp__fecha ui-mono">
                      <span>{fechaCorta(fecha)}</span>
                      <span className="ui-muted">{hora(fecha)} h</span>
                    </div>

                    <div className="hp__cuerpo">
                      <div className="ui-row__title">
                        {a.centro_nombre || 'Centro de salud'}
                        <span className={`ui-chip ${estado.chip}`}>{a.estado_legible || estado.label}</span>
                      </div>

                      {(a.especialidad_nombre || a.medico_nombre) && (
                        <div className="ui-row__meta">
                          <span>
                            <Stethoscope size={14} aria-hidden="true" />
                            {[a.medico_nombre, a.especialidad_nombre].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}

                      <dl className="hp__detalle">
                        <dt>Motivo</dt>
                        <dd>{a.motivo || 'Ingreso general de guardia.'}</dd>
                        {a.diagnostico && (
                          <>
                            <dt>Diagnóstico</dt>
                            <dd className="hp__dx">{a.diagnostico}</dd>
                          </>
                        )}
                        {a.indicaciones && (
                          <>
                            <dt>Indicaciones</dt>
                            <dd>{a.indicaciones}</dd>
                          </>
                        )}
                      </dl>
                    </div>

                    <span className="hp__ir" aria-hidden="true">
                      Ver consulta
                      <CaretRight size={14} weight="bold" />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </main>

      {/* Documento que sale por la impresora: sólo visible al imprimir */}
      {imprimiendo && (
      <section className="print-only doc">
        <header className="doc__portada">
          <h1>Historial clínico</h1>
          <p>{usuario?.nombre}{usuario?.email ? `, ${usuario.email}` : ''}</p>
          <p>
            {visibles.length} {visibles.length === 1 ? 'atención' : 'atenciones'}
            {centro !== 'todos' ? ` en ${centro}` : ''}. Emitido el {fechaLarga(new Date())}.
          </p>
        </header>
        {visibles.map((a) => (
          <HojaAtencion key={a.id} atencion={a} paciente={usuario?.nombre} compacta />
        ))}
      </section>
      )}
    </div>
  )
}
