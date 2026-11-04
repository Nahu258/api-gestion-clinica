/**
 * Resumen.jsx - Pantalla inicial del superadmin: estado general de la red (AE5-14, #44).
 *
 * - KPIs globales: instituciones activas, médicos disponibles ahora,
 *   solicitudes pendientes / en camino / derivadas y atenciones del día.
 * - Estado de guardias por institución, con acceso al panel de cada centro.
 * - Alertas: centros sin especialidades, sin médicos o sin administrador.
 *
 * Se refresca cada 20 segundos (y se pausa con la pestaña oculta), con el
 * mismo criterio de polling que el panel de guardia.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowClockwise, CheckCircle, SquaresFour, WarningCircle } from '@phosphor-icons/react'
import DataTable from '../../components/ui/DataTable.jsx'
import { etiquetaTipo, obtenerResumenRed } from '../../api/admin.js'

const INTERVALO_MS = 20000

const ETIQUETA_ALERTA = {
  sin_especialidades: 'Sin especialidades',
  sin_medicos: 'Sin médicos',
  sin_operador: 'Sin administrador',
}

function minutos(n) {
  if (n === null || n === undefined) return '—'
  if (n < 60) return `${n} min`
  return `${Math.floor(n / 60)} h ${n % 60} min`
}

export default function Resumen() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [actualizando, setActualizando] = useState(false)

  const cargar = useCallback(async () => {
    setActualizando(true)
    try {
      setDatos(await obtenerResumenRed())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setActualizando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') cargar()
    }, INTERVALO_MS)
    const alVolver = () => {
      if (document.visibilityState === 'visible') cargar()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [cargar])

  const alertasPorCentro = useMemo(() => {
    const mapa = new Map()
    ;(datos?.alertas || []).forEach((a) => {
      if (!mapa.has(a.centro_id)) mapa.set(a.centro_id, { centro_id: a.centro_id, centro_nombre: a.centro_nombre, tipos: [] })
      mapa.get(a.centro_id).tipos.push(a.tipo)
    })
    return [...mapa.values()]
  }, [datos])

  const k = datos?.kpis
  const v = (n) => (k ? (n ?? '—') : '-')

  const columnas = [
    {
      key: 'centro_nombre',
      label: 'Institución',
      sortable: true,
      render: (g) => (
        <div style={{ minWidth: 0 }}>
          <Link to={`/admin/instituciones/${g.centro_id}`} className="ui-link-strong">{g.centro_nombre}</Link>
          <div className="ui-person__sub">{etiquetaTipo(g.tipo)}</div>
        </div>
      ),
    },
    {
      key: 'en_espera',
      label: 'En espera',
      sortable: true,
      align: 'right',
      render: (g) => <span className={`ui-mono${g.en_espera ? ' ui-text-accent' : ''}`}>{g.en_espera}</span>,
    },
    { key: 'en_curso', label: 'En curso', sortable: true, align: 'right', render: (g) => <span className="ui-mono">{g.en_curso}</span> },
    {
      key: 'medicos_disponibles',
      label: 'Médicos disponibles',
      mobileLabel: 'Disponibles',
      sortable: true,
      align: 'right',
      sortValue: (g) => g.medicos_disponibles ?? -1,
      render: (g) => (
        <span className="ui-mono">
          {g.medicos_disponibles ?? '—'}<span className="ui-muted"> / {g.medicos}</span>
        </span>
      ),
    },
    {
      key: 'espera_promedio_min',
      label: 'Espera promedio',
      mobileLabel: 'Espera prom.',
      sortable: true,
      align: 'right',
      sortValue: (g) => g.espera_promedio_min ?? -1,
      render: (g) => <span className="ui-mono ui-nowrap">{minutos(g.espera_promedio_min)}</span>,
    },
    { key: 'atendidas_hoy', label: 'Atendidas hoy', mobileLabel: 'Hoy', sortable: true, align: 'right', render: (g) => <span className="ui-mono">{g.atendidas_hoy}</span> },
  ]

  return (
    <>
      <div className="ui-pagehead">
        <div>
          <h1 className="ui-pagehead__title">Resumen de la red</h1>
          <div className="ui-pagehead__meta">
            <span>
              {datos
                ? `Actualizado ${new Date(datos.generado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`
                : 'Cargando…'}
              {' · se actualiza cada 20 s'}
            </span>
          </div>
        </div>
        <div className="ui-pagehead__actions">
          <button type="button" className="ui-btn" onClick={cargar} disabled={actualizando}>
            <ArrowClockwise size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="ui-alert" role="alert">
          <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{datos ? `No se pudo actualizar: ${error}. Se muestran los últimos datos.` : error}</span>
        </div>
      )}

      <section className="ui-kpis ui-kpis--3x2" style={{ '--kpis': 3 }} aria-label="Indicadores de la red">
        <div className="ui-stat">
          <div className="ui-stat__label">Instituciones activas</div>
          <div className="ui-stat__value">{v(k?.instituciones_activas)}</div>
          {k && <div className="ui-stat__hint">{k.instituciones_inactivas} inactivas</div>}
        </div>
        <div className="ui-stat">
          <div className="ui-stat__label">Médicos disponibles ahora</div>
          <div className="ui-stat__value">{v(k?.medicos_disponibles)}</div>
          {k && (
            <div className="ui-stat__hint">
              {k.medicos_disponibles === null ? 'Estado en tiempo real no disponible' : `de ${k.medicos_asignados} asignados`}
            </div>
          )}
        </div>
        <div className="ui-stat">
          <div className="ui-stat__label">Atenciones de hoy</div>
          <div className="ui-stat__value">{v(k?.atenciones_hoy)}</div>
        </div>
        <div className="ui-stat">
          <div className="ui-stat__label">Solicitudes pendientes</div>
          <div className={`ui-stat__value${k?.solicitudes_pendientes ? ' ui-stat__value--accent' : ''}`}>{v(k?.solicitudes_pendientes)}</div>
          <div className="ui-stat__hint">Esperando triage</div>
        </div>
        <div className="ui-stat">
          <div className="ui-stat__label">En camino</div>
          <div className="ui-stat__value">{v(k?.solicitudes_en_camino)}</div>
          <div className="ui-stat__hint">Pacientes que avisaron que llegan</div>
        </div>
        <div className="ui-stat">
          <div className="ui-stat__label">Derivadas</div>
          <div className="ui-stat__value">{v(k?.solicitudes_derivadas)}</div>
          <div className="ui-stat__hint">Con especialista o en consulta</div>
        </div>
      </section>

      <div className="ui-split">
        <section>
          <div className="ui-sectionhead">
            <h2 className="ui-h2">Estado de guardias</h2>
          </div>
          <DataTable
            columns={columnas}
            rows={datos?.guardias || []}
            rowKey={(g) => g.centro_id}
            loading={!datos && !error}
            error={!datos ? error : null}
            onRetry={cargar}
            initialSort={{ key: 'en_espera', dir: 'desc' }}
            caption="Estado de guardia por institución"
            rowActions={(g) => (
              <Link to={`/panel-centro?centro=${g.centro_id}`} className="ui-btn ui-btn--quiet ui-btn--sm" aria-label={`Panel de guardia de ${g.centro_nombre}`}>
                <SquaresFour size={16} />
                Panel
              </Link>
            )}
            empty={{ title: 'No hay instituciones con guardia activa', text: 'Registrá o activá hospitales, clínicas o UPAs.' }}
          />
        </section>

        <aside>
          <div className="ui-sectionhead">
            <h2 className="ui-h2">Alertas de configuración</h2>
            {alertasPorCentro.length > 0 && <span className="ui-chip ui-chip--warn">{alertasPorCentro.length}</span>}
          </div>
          <div className="ui-card">
            {!datos ? (
              <div className="ui-skel-row">
                <div className="ui-skeleton" style={{ height: 14, width: '60%' }} />
                <div className="ui-skeleton" style={{ height: 12, width: '40%' }} />
              </div>
            ) : alertasPorCentro.length === 0 ? (
              <div className="ui-empty">
                <div className="ui-empty__icon"><CheckCircle size={22} /></div>
                <p className="ui-empty__title">Todo configurado</p>
                <p className="ui-empty__text">Cada institución con guardia tiene especialidades, médicos y un administrador.</p>
              </div>
            ) : (
              <ul className="ui-rows">
                {alertasPorCentro.map((a) => (
                  <li key={a.centro_id} className="ui-alertrow">
                    <Link to={`/admin/instituciones/${a.centro_id}`} className="ui-link-strong">{a.centro_nombre}</Link>
                    <div className="ui-chips" style={{ marginTop: 6 }}>
                      {a.tipos.map((t) => <span key={t} className="ui-chip ui-chip--warn">{ETIQUETA_ALERTA[t] || t}</span>)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </>
  )
}
