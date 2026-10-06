import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import Bienvenida from './pages/Bienvenida.jsx'
import Mapa from './pages/Mapa.jsx'
import DetalleCentro from './pages/DetalleCentro.jsx'
import SeguimientoSolicitud from './pages/SeguimientoSolicitud.jsx'

/**
 * App - enrutador raíz de EmergenciaYA.
 *
 * Rutas:
 *   /                → Landing page principal con información y acceso
 *   /ingreso         → Pantalla de bienvenida (Google login + modo invitado)
 *   /login           → Alias de /ingreso
 *   /mapa            → Mapa interactivo de centros cercanos (Épica 3 issue #17)
 *   /centros/:id     → Detalle de centro + solicitud de atención (Épica 3 issue #18)
 *   /seguimiento/:id → Seguimiento en tiempo real con polling (Épica 3 issue #19)
 *   /seguimiento     → Recupera solicitud activa de sessionStorage
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/ingreso" element={<Bienvenida />} />
      <Route path="/login" element={<Navigate to="/ingreso" replace />} />
      <Route path="/mapa" element={<Mapa />} />
      <Route path="/centros/:id" element={<DetalleCentro />} />
      <Route path="/seguimiento/:id" element={<SeguimientoSolicitud />} />
      <Route path="/seguimiento" element={<SeguimientoSolicitud />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
