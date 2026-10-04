/**
 * Mapa.jsx — Pantalla del mapa de centros cercanos.
 *
 * Placeholder de la Épica 3 (issue #17). Esta pantalla se implementa
 * en la Épica 3; por ahora solo confirma que el login funcionó.
 */

import { useNavigate } from 'react-router-dom'
import { cerrarSesion, getAuthHeaders } from '../api/auth.js'

export default function Mapa() {
  const navigate = useNavigate()

  const headers = getAuthHeaders()
  const esInvitado = !!headers['X-Guest-Token']
  const tipoSesion = esInvitado ? 'Invitado' : 'Usuario registrado'

  const handleSalir = () => {
    cerrarSesion()
    navigate('/', { replace: true })
  }

  return (
    <div className="mapa-placeholder">
      <div className="mapa-placeholder-card">
        <span aria-hidden="true" style={{ fontSize: '3rem' }}>🗺️</span>
        <h1>Mapa de centros</h1>
        <p className="sesion-badge">
          Sesión activa: <strong>{tipoSesion}</strong>
        </p>
        <p style={{ color: '#888', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          Esta pantalla se implementa en la Épica 3 (issue #17).
        </p>
        <button className="btn btn--invitado" onClick={handleSalir} style={{ marginTop: '2rem' }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
