/**
 * GestionLayout - Gestión de la institución (/panel-centro/gestion/*).
 *
 * El OPERADOR_CENTRO gestiona su propio centro (perfil.centro_id). El ADMIN
 * entra a la gestión de cualquier centro con ?centro=<id> (desde el detalle
 * de la institución); los links de la navegación conservan ese parámetro.
 */

import { Link, Navigate, Outlet, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CalendarDots, FirstAidKit, House, Stethoscope } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext.jsx'
import ConsolaLayout from '../../components/ConsolaLayout.jsx'

/** Centro sobre el que opera la pantalla: ?centro= para ADMIN, perfil.centro_id para el operador. */
export function useCentroGestion() {
  const { rol, centroId, usuario } = useAuth()
  const [params] = useSearchParams()
  const desdeUrl = Number(params.get('centro')) || null
  const esAdmin = rol === 'ADMIN'
  const sufijo = esAdmin && desdeUrl ? `?centro=${desdeUrl}` : ''

  /** Ruta a una sección de gestión conservando ?centro= (ADMIN) más parámetros extra. */
  const ruta = (seccion = '', extra = {}) => {
    const qs = new URLSearchParams(esAdmin && desdeUrl ? { centro: String(desdeUrl) } : {})
    Object.entries(extra).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v)
    })
    const base = seccion ? `/panel-centro/gestion/${seccion}` : '/panel-centro/gestion'
    return qs.toString() ? `${base}?${qs}` : base
  }

  return {
    esAdmin,
    centroId: esAdmin ? desdeUrl : centroId,
    centroNombre: esAdmin ? '' : usuario?.centro_nombre || '',
    sufijo,
    ruta,
  }
}

export default function GestionLayout() {
  const { esAdmin, centroId, centroNombre, sufijo } = useCentroGestion()

  if (esAdmin && !centroId) return <Navigate to="/admin/instituciones" replace />

  const items = [
    { to: `/panel-centro/gestion${sufijo}`, label: 'Inicio', icon: House, end: true },
    { to: `/panel-centro/gestion/especialidades${sufijo}`, label: 'Especialidades', icon: FirstAidKit },
    { to: `/panel-centro/gestion/medicos${sufijo}`, label: 'Médicos', icon: Stethoscope },
    { to: `/panel-centro/gestion/guardias${sufijo}`, label: 'Guardias', icon: CalendarDots },
  ]

  const pie = (
    <Link to={esAdmin ? `/admin/instituciones/${centroId}` : '/panel-centro'} className="ui-consola__link">
      <ArrowLeft size={18} />
      <span>{esAdmin ? 'Volver a la institución' : 'Volver a la guardia'}</span>
    </Link>
  )

  return (
    <ConsolaLayout titulo="Gestión de la institución" subtitulo={centroNombre} items={items} pie={pie}>
      <Outlet />
    </ConsolaLayout>
  )
}
