/**
 * ConsolaLayout - Marco común de las consolas de administración.
 *
 * Lo usan la consola del superadmin (/admin/*) y la gestión de la
 * institución (/panel-centro/gestion/*). Muestra la barra superior, una
 * navegación lateral con las secciones y el contenido de la ruta hija.
 * Debajo de 1024px la navegación lateral se colapsa en un menú desplegable.
 *
 *   <ConsolaLayout titulo="Administración general" items={[{ to, label, icon, end }]} />
 */

import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { CaretDown, List } from '@phosphor-icons/react'
import Navbar from './Navbar.jsx'

export default function ConsolaLayout({ titulo, subtitulo, items = [], pie, children }) {
  const [abierto, setAbierto] = useState(false)
  const location = useLocation()

  // Cerrar el menú mobile al navegar
  useEffect(() => {
    setAbierto(false)
  }, [location.pathname, location.search])

  const actual = items.find((i) =>
    i.end ? location.pathname === i.to.split('?')[0] : location.pathname.startsWith(i.to.split('?')[0])
  )

  return (
    <div className="ui-shell">
      <Navbar enConsola />

      <div className="ui-consola">
        <aside className="ui-consola__side" aria-label={titulo}>
          <div className="ui-consola__head">
            <span className="ui-consola__eyebrow">{titulo}</span>
            {subtitulo && <span className="ui-consola__sub">{subtitulo}</span>}
          </div>

          <button
            type="button"
            className="ui-consola__toggle"
            aria-expanded={abierto}
            aria-controls="ui-consola-nav"
            onClick={() => setAbierto((v) => !v)}
          >
            <List size={18} />
            <span>{actual?.label || 'Secciones'}</span>
            <CaretDown size={14} className={abierto ? 'is-flipped' : undefined} />
          </button>

          <nav id="ui-consola-nav" className={`ui-consola__nav${abierto ? ' is-open' : ''}`}>
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `ui-consola__link${isActive ? ' is-active' : ''}`}
              >
                {Icon && <Icon size={18} />}
                <span>{label}</span>
              </NavLink>
            ))}
            {pie && <div className="ui-consola__pie">{pie}</div>}
          </nav>
        </aside>

        <main className="ui-consola__main">{children || <Outlet />}</main>
      </div>
    </div>
  )
}
