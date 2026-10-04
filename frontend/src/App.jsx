import { Routes, Route, Navigate } from 'react-router-dom'
import Bienvenida from './pages/Bienvenida.jsx'
import Mapa from './pages/Mapa.jsx'
import { tieneSessionActiva } from './api/auth.js'

/**
 * App — enrutador raíz de EmergenciaYA.
 *
 * Rutas:
 *   /           → Bienvenida (welcome screen, Épica 2 issue #16)
 *   /mapa       → Mapa de centros cercanos (Épica 3 issue #17, placeholder)
 *
 * Si ya hay sesión activa (JWT o token de invitado), redirige directo al mapa.
 */
export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          tieneSessionActiva()
            ? <Navigate to="/mapa" replace />
            : <Bienvenida />
        }
      />
      <Route path="/mapa" element={<Mapa />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
