import { Navigate, Outlet, useLocation, Link } from 'react-router-dom'
import { LockKey } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext.jsx'
import { ROLES, etiquetaRol } from '../utils/roles.js'

/**
 * RoleGuard - Envoltorio de rutas protegidas basado en RBAC.
 *
 * @param {string[]} allowedRoles - Lista de roles autorizados (ej: ['MEDICO'], ['OPERADOR_CENTRO'])
 * @param {boolean} allowGuest - Permite acceso a usuarios en modo invitado
 */
export default function RoleGuard({ allowedRoles = [], allowGuest = false }) {
  const { rol, esInvitado, estaAutenticado, cargando } = useAuth()
  const location = useLocation()

  if (cargando) {
    return (
      <div className="ui-shell">
        <main className="ui-page">
          <div className="ui-skeleton" style={{ height: 28, width: 260, marginBottom: 12 }} />
          <div className="ui-skeleton" style={{ height: 16, width: 380, marginBottom: 28 }} />
          <div className="ui-skeleton" style={{ height: 96, marginBottom: 20 }} />
          <div className="ui-skeleton" style={{ height: 320 }} />
        </main>
      </div>
    )
  }

  // 1. Si no está autenticado ni es invitado (o no se permite invitado)
  if (!estaAutenticado || (esInvitado && !allowGuest)) {
    return <Navigate to="/ingreso" state={{ from: location }} replace />
  }

  // 2. Si el rol actual no tiene permisos para esta ruta
  const tienePermiso = allowedRoles.length === 0 || allowedRoles.includes(rol) || rol === 'ADMIN'

  if (!tienePermiso) {
    const destino = ROLES[rol] || ROLES.INVITADO

    return (
      <div className="ui-shell" style={{ alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div className="ui-card" style={{ maxWidth: 440, width: '100%' }}>
          <div className="ui-empty">
            <div className="ui-empty__icon"><LockKey size={22} /></div>
            <p className="ui-empty__title">No tenés acceso a esta sección</p>
            <p className="ui-empty__text">
              Tu cuenta tiene el rol <strong>{etiquetaRol(rol)}</strong>. Esta pantalla es para otro tipo de usuario.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
              <Link to={destino.inicio} className="ui-btn ui-btn--dark">Ir a {destino.destino.toLowerCase()}</Link>
              <Link to="/" className="ui-btn ui-btn--quiet">Volver al inicio</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <Outlet />
}
