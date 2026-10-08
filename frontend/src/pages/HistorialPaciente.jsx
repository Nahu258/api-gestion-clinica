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
    <div className="login-viewport" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main style={{ maxWidth: '980px', width: '100%', margin: '1.5rem auto', padding: '0 1rem', flex: 1 }}>
        {/* Header del Paciente */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.7)',
          border: '1px solid rgba(51, 65, 85, 0.6)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.75rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '1.5rem' }}>📂</span>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                Mi Historial Clínico
              </h1>
              <span className="navbar-role-badge navbar-role-badge--paciente" style={{ fontSize: '0.75rem' }}>
                Paciente Registrado
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#94a3b8' }}>
              {usuario?.nombre ? `${usuario.nombre} · ` : ''}{usuario?.email || 'Cuenta vinculada'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total de Consultas
              </span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8' }}>
                {atenciones.length}
              </div>
            </div>

            <Link
              to="/mapa"
              className="btn btn--hero-primary"
              style={{ padding: '0.55rem 1rem', fontSize: '0.82rem', textDecoration: 'none' }}
            >
              🚨 Nueva Emergencia
            </Link>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Centro Médico:</label>
            <select
              value={filtroCentro}
              onChange={(e) => setFiltroCentro(e.target.value)}
              style={{
                background: 'rgba(30, 41, 59, 0.8)',
                color: '#f8fafc',
                border: '1px solid rgba(51, 65, 85, 0.6)',
                borderRadius: '6px',
                padding: '0.4rem 0.75rem',
                fontSize: '0.85rem'
              }}
            >
              <option value="todos">Todos los centros ({atenciones.length})</option>
              {centrosUnicos.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setOrdenReciente(!ordenReciente)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(51, 65, 85, 0.6)',
              color: '#38bdf8',
              borderRadius: '6px',
              padding: '0.4rem 0.75rem',
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            {ordenReciente ? '⏱️ Más recientes primero' : '⏱️ Más antiguas primero'}
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
            {error}
          </div>
        )}

        {/* Estado de Carga */}
        {cargando ? (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94a3b8' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem', width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p>Recuperando tus consultas médicas...</p>
          </div>
        ) : atencionesFiltradas.length === 0 ? (
          /* Estado Vacío */
          <div style={{
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px dashed rgba(51, 65, 85, 0.6)',
            borderRadius: '14px',
            padding: '3.5rem 1.5rem',
            textAlign: 'center',
            color: '#94a3b8'
          }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem' }}>🩺</div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem' }}>
              No tenés consultas médicas registradas
            </h2>
            <p style={{ maxWidth: '420px', margin: '0 auto 1.5rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Cuando asistas a una guardia y el médico complete tu atención, el diagnóstico y tratamiento quedarán guardados aquí de forma permanente.
            </p>
            <Link
              to="/mapa"
              className="btn btn--hero-primary"
              style={{ display: 'inline-flex', padding: '0.65rem 1.25rem', textDecoration: 'none' }}
            >
              Ver Centros de Emergencia Cercanos
            </Link>
          </div>
        ) : (
          /* Timeline de Atenciones */
          <div style={{ position: 'relative', paddingLeft: '1.5rem', borderLeft: '2px solid rgba(56, 189, 248, 0.3)' }}>
            {atencionesFiltradas.map((item, index) => {
              const fecha = item.atendido_en || item.creado_en
              const fechaObj = fecha ? new Date(fecha) : new Date()
              const fechaFormateada = fechaObj.toLocaleDateString('es-AR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
              const horaFormateada = fechaObj.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
              })

              const esAtendido = item.estado === 'atendido'

              return (
                <div
                  key={item.id}
                  style={{
                    position: 'relative',
                    marginBottom: '2rem',
                  }}
                >
                  {/* Punto en el timeline */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '-2.15rem',
                      top: '0.5rem',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: esAtendido ? '#10b981' : '#38bdf8',
                      border: '3px solid #0f172a',
                      boxShadow: esAtendido ? '0 0 10px rgba(16, 185, 129, 0.6)' : '0 0 10px rgba(56, 189, 248, 0.6)'
                    }}
                  />

                  {/* Tarjeta del Episodio */}
                  <article
                    style={{
                      background: 'rgba(30, 41, 59, 0.7)',
                      border: '1px solid rgba(51, 65, 85, 0.6)',
                      borderRadius: '12px',
                      padding: '1.5rem',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
                    }}
                  >
                    {/* Header de la Tarjeta */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.1rem' }}>🏥</span>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                          {item.centro_nombre || 'Centro de Emergencia'}
                        </h2>
                      </div>

                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '9999px',
                        background: esAtendido ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                        color: esAtendido ? '#34d399' : '#38bdf8'
                      }}>
                        {item.estado_legible || item.estado}
                      </span>
                    </div>

                    {/* Fecha y Hora */}
                    <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.85rem' }}>
                      🗓️ {fechaFormateada} · {horaFormateada} hs
                    </div>

                    {/* Especialista Tratante si existe */}
                    {(item.medico_nombre || item.especialidad_nombre) && (
                      <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.75rem', background: 'rgba(15, 23, 42, 0.5)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                        👨‍⚕️ Atendido por: <strong style={{ color: '#f8fafc' }}>{item.medico_nombre || 'Médico de Guardia'}</strong>
                        {item.especialidad_nombre ? ` (${item.especialidad_nombre})` : ''}
                      </div>
                    )}

                    {/* Motivo de Consulta Inicial */}
                    <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.75rem' }}>
                      <strong style={{ color: '#94a3b8' }}>Motivo de urgencia: </strong>
                      {item.motivo || 'Ingreso general de guardia.'}
                    </div>

                    {/* Diagnóstico Médico Recibido */}
                    {item.diagnostico ? (
                      <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '0.75rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                          Diagnóstico Médico
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#f1f5f9', fontWeight: 600, lineHeight: 1.4 }}>
                          {item.diagnostico}
                        </div>
                      </div>
                    ) : null}

                    {/* Indicaciones y Tratamiento */}
                    {item.indicaciones ? (
                      <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '0.75rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                          Indicaciones y Pautas de Alarma
                        </div>
                        <div style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                          {item.indicaciones}
                        </div>
                      </div>
                    ) : null}

                    {/* Footer de Tarjeta / Descarga */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem', borderTop: '1px solid rgba(51, 65, 85, 0.4)', paddingTop: '0.75rem' }}>
                      <button
                        type="button"
                        onClick={() => imprimirComprobante(item)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#38bdf8',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <span>🖨️</span>
                        <span>Imprimir comprobante médico</span>
                      </button>
                    </div>
                  </article>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
