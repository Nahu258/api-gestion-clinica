/**
 * HistorialPaciente.jsx - Historial Clínico del Paciente Registrado.
 *
 * Épica 4 (AE4-20):
 * - Cronología / Timeline de atenciones de emergencia recibidas en la red.
 * - Detalle de centros, especialistas tratantes, diagnósticos e indicaciones terapéuticas.
 * - Filtros por centro y fecha.
 * - Impresión de comprobante médico y estado vacío ilustrado.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Navbar from '../components/Navbar.jsx'
import { obtenerMiHistorial } from '../api/atencion.js'
import { ArrowsDownUp, ClockCounterClockwise, MapPin, Printer, Warning } from '@phosphor-icons/react'

export default function HistorialPaciente() {
  const { usuario } = useAuth()

  const [atenciones, setAtenciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // Filtros
  const [filtroCentro, setFiltroCentro] = useState('todos')
  const [ordenReciente, setOrdenReciente] = useState(true)

  const cargarHistorial = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const data = await obtenerMiHistorial()
      setAtenciones(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial de atenciones.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarHistorial()
  }, [cargarHistorial])

  // Centros únicos para el filtro
  const centrosUnicos = useMemo(() => {
    const set = new Set()
    atenciones.forEach((a) => {
      if (a.centro_nombre) set.add(a.centro_nombre)
    })
    return Array.from(set)
  }, [atenciones])

  // Filtrado y ordenamiento
  const atencionesFiltradas = useMemo(() => {
    let res = [...atenciones]
    if (filtroCentro !== 'todos') {
      res = res.filter((a) => a.centro_nombre === filtroCentro)
    }
    res.sort((a, b) => {
      const fA = new Date(a.atendido_en || a.creado_en)
      const fB = new Date(b.atendido_en || b.creado_en)
      return ordenReciente ? fB - fA : fA - fB
    })
    return res
  }, [atenciones, filtroCentro, ordenReciente])

  const imprimirComprobante = (atencion) => {
    window.print()
  }

  return (
    <div className="ui-shell">
      <Navbar />

      <main className="ui-page historial-page">
        <header className="ui-pagehead">
          <div>
            <h1 className="ui-pagehead__title">Mi historial clínico</h1>
            <div className="ui-pagehead__meta">
              {usuario?.nombre && <span>{usuario.nombre}</span>}
              <span>{usuario?.email || 'Cuenta vinculada'}</span>
              <span className="ui-mono">
                {atenciones.length} {atenciones.length === 1 ? 'atención' : 'atenciones'}
              </span>
            </div>
          </div>
          <div className="ui-pagehead__actions">
            <Link to="/mapa" className="ui-btn ui-btn--primary">
              <MapPin size={18} />
              Buscar guardia
            </Link>
          </div>
        </header>

        <div className="historial-filtros">
          <div className="ui-field historial-filtros__centro">
            <label htmlFor="filtro-centro" className="ui-label">Centro</label>
            <select
              id="filtro-centro"
              className="ui-select"
              value={filtroCentro}
              onChange={(e) => setFiltroCentro(e.target.value)}
            >
              <option value="todos">Todos los centros ({atenciones.length})</option>
              {centrosUnicos.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="ui-btn ui-btn--quiet"
            onClick={() => setOrdenReciente(!ordenReciente)}
          >
            <ArrowsDownUp size={16} />
            {ordenReciente ? 'Más recientes primero' : 'Más antiguas primero'}
          </button>
        </div>

        {error && (
          <div className="ui-alert" role="alert">
            <Warning size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
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
        ) : atencionesFiltradas.length === 0 ? (
          <div className="ui-card">
            <div className="ui-empty">
              <div className="ui-empty__icon">
                <ClockCounterClockwise size={22} />
              </div>
              <p className="ui-empty__title">Todavía no hay atenciones registradas</p>
              <p className="ui-empty__text">
                Cuando un médico cierre una consulta tuya, el diagnóstico y las indicaciones aparecen acá.
              </p>
              <Link to="/mapa" className="ui-btn" style={{ marginTop: 20 }}>
                Ver centros cercanos
              </Link>
            </div>
          </div>
        ) : (
          <ol className="ui-card ui-rows historial-lista">
            {atencionesFiltradas.map((item) => {
              const fecha = item.atendido_en || item.creado_en
              const fechaObj = fecha ? new Date(fecha) : new Date()
              const dia = fechaObj.toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })
              const hora = fechaObj.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })
              const esAtendido = item.estado === 'atendido'

              return (
                <li key={item.id} className="historial-item">
                  <div className="historial-item__fecha ui-mono">
                    <span>{dia}</span>
                    <span className="ui-muted">{hora} h</span>
                  </div>

                  <div className="historial-item__cuerpo">
                    <div className="ui-row__title">
                      {item.centro_nombre || 'Centro de emergencia'}
                      <span className={`ui-chip ${esAtendido ? 'ui-chip--ok' : ''}`}>
                        {item.estado_legible || item.estado}
                      </span>
                    </div>

                    <div className="ui-row__meta">
                      {item.especialidad_nombre && <span>{item.especialidad_nombre}</span>}
                      {item.medico_nombre && <span>{item.medico_nombre}</span>}
                    </div>

                    <dl className="historial-item__detalle">
                      <dt>Motivo</dt>
                      <dd>{item.motivo || 'Ingreso general de guardia.'}</dd>
                      {item.diagnostico ? (
                        <>
                          <dt>Diagnóstico</dt>
                          <dd className="historial-item__dx">{item.diagnostico}</dd>
                        </>
                      ) : null}
                      {item.indicaciones ? (
                        <>
                          <dt>Indicaciones</dt>
                          <dd>{item.indicaciones}</dd>
                        </>
                      ) : null}
                    </dl>
                  </div>

                  <div className="historial-item__acciones">
                    <button
                      type="button"
                      className="ui-btn ui-btn--quiet ui-btn--sm"
                      onClick={() => imprimirComprobante(item)}
                    >
                      <Printer size={16} />
                      Imprimir
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </main>
    </div>
  )
}
