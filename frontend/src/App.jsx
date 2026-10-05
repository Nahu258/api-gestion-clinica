import { Routes, Route, Navigate } from 'react-router-dom'
import Bienvenida from './pages/Bienvenida.jsx'
import Mapa from './pages/Mapa.jsx'
import DetalleCentro from './pages/DetalleCentro.jsx'
import SeguimientoSolicitud from './pages/SeguimientoSolicitud.jsx'
import { tieneSessionActiva } from './api/auth.js'

/**
 * App — enrutador raíz de EmergenciaYA.
 *
 * Rutas:
 *   /                → Bienvenida (Google login + invitado, Épica 2 issue #16)
 *   /mapa            → Mapa interactivo de centros cercanos (Épica 3 issue #17)
 *   /centros/:id     → Detalle de centro + solicitud de atención (Épica 3 issue #18)
 *   /seguimiento/:id → Seguimiento en tiempo real con polling (Épica 3 issue #19)
 *   /seguimiento     → Recupera solicitud activa de sessionStorage
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
      <Route path="/centros/:id" element={<DetalleCentro />} />
      <Route path="/seguimiento/:id" element={<SeguimientoSolicitud />} />
      <Route path="/seguimiento" element={<SeguimientoSolicitud />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
