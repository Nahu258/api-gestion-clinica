import { Navigate, Outlet, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

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
      <div className="login-viewport" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary, #94a3b8)' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem', width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--primary, #38bdf8)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p>Verificando credenciales...</p>
        </div>
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
    // Determinar a qué pantalla enviarlo según su rol
    let rutaDestino = '/mapa'
    let nombreDestino = 'Guardias y Centros de Emergencia'

    if (rol === 'MEDICO') {
      rutaDestino = '/portal-medico'
      nombreDestino = 'Portal del Especialista'
    } else if (rol === 'OPERADOR_CENTRO') {
      rutaDestino = '/panel-centro'
      nombreDestino = 'Panel de Guardia del Centro'
    } else if (rol === 'PACIENTE') {
      rutaDestino = '/mi-historial'
      nombreDestino = 'Mi Historial Clínico'
    }

    return (
      <div className="login-viewport" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
        <div className="login-card" style={{ maxWidth: '480px', textAlign: 'center' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🚫</div>
          <span className="login-badge-pill" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            Error 403 · Acceso Denegado
          </span>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '1rem 0 0.5rem', color: '#f8fafc' }}>
            Sección restringida
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            No contás con los privilegios requeridos para acceder a esta pantalla. Tu rol activo en la plataforma es{' '}
            <strong style={{ color: '#f8fafc' }}>{rol || 'Invitado'}</strong>.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Link
              to={rutaDestino}
              className="btn-ingreso btn-ingreso--google"
              style={{ justifyContent: 'center', background: 'var(--primary, #0284c7)', color: '#ffffff', border: 'none' }}
            >
              Ir a {nombreDestino}
            </Link>
            <Link
              to="/"
              className="login-back-link"
              style={{ justifyContent: 'center', marginTop: '0.5rem' }}
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return <Outlet />
}
