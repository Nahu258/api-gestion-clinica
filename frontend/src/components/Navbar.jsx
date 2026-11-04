import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  Buildings,
  ChartBar,
  FirstAid,
  FirstAidKit,
  GearSix,
  MapTrifold,
  SquaresFour,
  Stethoscope,
  ClipboardText,
  SignOut,
  SignIn,
  UsersThree,
} from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext.jsx'
import { etiquetaRol, iniciales } from '../utils/roles.js'

// `end`: el link sólo se marca activo en la ruta exacta (no en sus hijas).
const LINKS_POR_ROL = {
  ADMIN: [
    { to: '/admin', label: 'Resumen', icon: ChartBar, end: true },
    { to: '/admin/instituciones', label: 'Instituciones', icon: Buildings },
    { to: '/admin/especialidades', label: 'Especialidades', icon: FirstAidKit },
    { to: '/admin/usuarios', label: 'Usuarios', icon: UsersThree },
  ],
  OPERADOR_CENTRO: [
    { to: '/panel-centro', label: 'Guardia', icon: SquaresFour, end: true },
    { to: '/panel-centro/gestion', label: 'Gestión', icon: GearSix },
  ],
  MEDICO: [{ to: '/portal-medico', label: 'Mi guardia', icon: Stethoscope, end: true }],
  PACIENTE: [{ to: '/mi-historial', label: 'Mi historial', icon: ClipboardText }],
}

/**
 * @param {boolean} enConsola - En las consolas la navegación del rol vive en la
 *   barra lateral (ConsolaLayout), así que acá sólo queda el mapa.
 */
export default function Navbar({ enConsola = false }) {
  const { usuario, rol, estaAutenticado, logout } = useAuth()
  const navigate = useNavigate()

  const handleCerrarSesion = () => {
    logout()
    navigate('/ingreso', { replace: true })
  }

  const links = [
    { to: '/mapa', label: 'Mapa de guardias', icon: MapTrifold },
    ...(enConsola ? [] : LINKS_POR_ROL[rol] || []),
  ]

  const nombre = usuario?.medico_nombre || usuario?.nombre || 'Invitado'
  const subtitulo = usuario?.centro_nombre
    ? `${etiquetaRol(rol)}, ${usuario.centro_nombre}`
    : etiquetaRol(rol)

  return (
    <header className="ui-topbar">
      <div className="ui-topbar__inner">
        <Link to="/" className="ui-brand">
          <span className="ui-brand__mark" aria-hidden="true">
            <FirstAid size={17} weight="bold" />
          </span>
          EmergenciaYA
        </Link>

        <nav className="ui-nav" aria-label="Principal">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `ui-nav__link${isActive ? ' is-active' : ''}`}
            >
              <Icon size={18} />
              <span className="ui-nav__label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="ui-session">
          {estaAutenticado ? (
            <>
              <div className="ui-session__who">
                <span className="ui-session__name">{nombre}</span>
                <span className="ui-session__role">{subtitulo}</span>
              </div>
              <span className="ui-initials" aria-hidden="true">{iniciales(nombre)}</span>
              <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={handleCerrarSesion}>
                <SignOut size={16} />
                Salir
              </button>
            </>
          ) : (
            <Link to="/ingreso" className="ui-btn ui-btn--sm">
              <SignIn size={16} />
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
