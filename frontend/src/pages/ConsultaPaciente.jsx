/**
 * ConsultaPaciente.jsx - Detalle de una consulta del historial del paciente.
 *
 * Muestra la constancia completa (motivo, triage, diagnóstico, indicaciones,
 * profesional y horarios) y permite imprimirla o guardarla como PDF. Si la
 * consulta todavía está en curso, ofrece ir al seguimiento en vivo.
 */

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Bell, Phone, Printer, WarningCircle } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext.jsx'
import Navbar from '../components/Navbar.jsx'
import HojaAtencion from '../components/HojaAtencion.jsx'
import { obtenerMiConsulta } from '../api/atencion.js'
import { CERRADAS, estadoDe } from '../utils/solicitudes.js'

export default function ConsultaPaciente() {
  const { id } = useParams()
  const { usuario } = useAuth()

  const [consulta, setConsulta] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let activo = true
    setConsulta(null)
    setError(null)
    obtenerMiConsulta(id)
      .then((data) => activo && setConsulta(data))
      .catch((err) => {
        if (!activo) return
        setError(err.status === 404 ? 'Esta consulta no existe o no pertenece a tu cuenta.' : err.message || 'No se pudo cargar la consulta.')
      })
    return () => {
      activo = false
    }
  }, [id])

  const enCurso = consulta && !CERRADAS.includes(consulta.estado)
  const estado = consulta ? estadoDe(consulta.estado) : null

  return (
    <div className="ui-shell">
      <Navbar />

      <main className="ui-page ui-page--narrow">
        <Link to="/mi-historial" className="ui-backlink no-print">
          <ArrowLeft size={16} aria-hidden="true" />
          Mi historial
        </Link>

        {error ? (
          <div className="ui-card">
            <div className="ui-empty">
              <div className="ui-empty__icon ui-empty__icon--alert"><WarningCircle size={22} /></div>
              <h1 className="ui-empty__title">No pudimos abrir la consulta</h1>
              <p className="ui-empty__text">{error}</p>
              <Link to="/mi-historial" className="ui-btn ui-btn--dark" style={{ marginTop: 16 }}>Volver al historial</Link>
            </div>
          </div>
        ) : !consulta ? (
          <div aria-busy="true">
            <div className="ui-skeleton" style={{ height: 30, width: '60%', marginBottom: 12 }} />
            <div className="ui-skeleton" style={{ height: 14, width: '35%', marginBottom: 24 }} />
            <div className="ui-skeleton" style={{ height: 420 }} />
          </div>
        ) : (
          <>
            <header className="ui-pagehead no-print">
              <div>
                <h1 className="ui-pagehead__title">Consulta en {consulta.centro_nombre || 'el centro'}</h1>
                <div className="ui-pagehead__meta">
                  <span className={`ui-chip ${estado.chip}`}>{consulta.estado_legible || estado.label}</span>
                  <span className="ui-mono">N.º {consulta.id}</span>
                </div>
              </div>
              <div className="ui-pagehead__actions">
                {enCurso && (
                  <Link to={`/seguimiento/${consulta.id}`} className="ui-btn ui-btn--primary">
                    <Bell size={18} />
                    Seguir en vivo
                  </Link>
                )}
                {consulta.centro_telefono && (
                  <a href={`tel:${consulta.centro_telefono}`} className="ui-btn">
                    <Phone size={18} />
                    Llamar al centro
                  </a>
                )}
                <button type="button" className="ui-btn ui-btn--dark" onClick={() => window.print()}>
                  <Printer size={18} />
                  Imprimir
                </button>
              </div>
            </header>

            <section className="ui-card cp__hoja">
              <HojaAtencion atencion={consulta} paciente={usuario?.nombre} />
            </section>

            <p className="ui-help no-print" style={{ marginTop: 12 }}>
              Para guardarla como PDF, elegí "Guardar como PDF" en el diálogo de impresión.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
