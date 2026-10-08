import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Navbar() {
  const { usuario, rol, esInvitado, estaAutenticado, logout } = useAuth()
  const navigate = useNavigate()

  const handleCerrarSesion = () => {
    logout()
    navigate('/ingreso', { replace: true })
  }

  // Identificador visual del rol
  const renderBadgeRol = () => {
    if (!estaAutenticado) return null

    if (rol === 'MEDICO') {
      return (
        <span className="navbar-role-badge navbar-role-badge--medico" title="Médico Especialista">
          👨‍⚕️ {usuario?.nombre || 'Dr. Especialista'}
        </span>
      )
    }
    if (rol === 'OPERADOR_CENTRO') {
      return (
        <span className="navbar-role-badge navbar-role-badge--operador" title="Operador de Centro de Salud">
          🏥 {usuario?.centro_nombre ? `Operador ${usuario.centro_nombre}` : 'Operador Centro'}
        </span>
      )
    }
    if (rol === 'ADMIN') {
      return (
        <span className="navbar-role-badge navbar-role-badge--admin" title="Administrador de Sistema">
          ⚙️ Admin ({usuario?.nombre || 'Sistema'})
        </span>
      )
    }
    if (esInvitado || rol === 'INVITADO') {
      return (
        <span className="navbar-role-badge navbar-role-badge--invitado" title="Sesión Temporal de Emergencia">
          ⚡ Invitado
        </span>
      )
    }
    // Paciente registrado
    return (
      <span className="navbar-role-badge navbar-role-badge--paciente" title="Paciente Registrado">
        👤 {usuario?.nombre || 'Mi Cuenta'}
      </span>
    )
  }

  return (
    <header className="app-navbar">
      <div className="app-navbar-inner">
        {/* Brand / Logo */}
        <Link to="/" className="app-navbar-brand">
          <span className="brand-icon">🚨</span>
          <span className="brand-name">EmergenciaYA</span>
        </Link>

        {/* Links principales según rol */}
        <nav className="app-navbar-nav">
          <Link to="/mapa" className="nav-link">
            🗺️ Centros de Guardia
          </Link>

          {rol === 'MEDICO' && (
            <Link to="/portal-medico" className="nav-link nav-link--highlight">
              🩺 Portal Médico
            </Link>
          )}

          {rol === 'OPERADOR_CENTRO' && (
            <Link to="/panel-centro" className="nav-link nav-link--highlight">
              📋 Panel de Centro
            </Link>
          )}

          {rol === 'PACIENTE' && (
            <Link to="/mi-historial" className="nav-link">
              📂 Mi Historial
            </Link>
          )}
        </nav>

        {/* Bloque de Usuario y Sesión */}
        <div className="app-navbar-actions">
          {renderBadgeRol()}

          {estaAutenticado ? (
            <button
              onClick={handleCerrarSesion}
              className="btn-navbar-logout"
              title="Cerrar sesión"
            >
              Salir
            </button>
          ) : (
            <Link to="/ingreso" className="btn-navbar-login">
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
