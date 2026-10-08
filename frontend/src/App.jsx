import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import RoleGuard from './components/RoleGuard.jsx'
import Landing from './pages/Landing.jsx'
import Bienvenida from './pages/Bienvenida.jsx'
import Mapa from './pages/Mapa.jsx'
import DetalleCentro from './pages/DetalleCentro.jsx'
import SeguimientoSolicitud from './pages/SeguimientoSolicitud.jsx'
import PanelCentro from './pages/PanelCentro.jsx'
import PortalMedico from './pages/PortalMedico.jsx'
import ConsultaMedica from './pages/ConsultaMedica.jsx'
import HistorialPaciente from './pages/HistorialPaciente.jsx'

/**
 * App - enrutador raíz de EmergenciaYA con RBAC (Épica 4 issue #26).
 */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Rutas públicas y de acceso general */}
        <Route path="/" element={<Landing />} />
        <Route path="/ingreso" element={<Bienvenida />} />
        <Route path="/login" element={<Navigate to="/ingreso" replace />} />
        <Route path="/mapa" element={<Mapa />} />
        <Route path="/centros/:id" element={<DetalleCentro />} />
        <Route path="/seguimiento/:id" element={<SeguimientoSolicitud />} />
        <Route path="/seguimiento" element={<SeguimientoSolicitud />} />

        {/* Rutas protegidas para Operadores de Centro de Guardia */}
        <Route element={<RoleGuard allowedRoles={['OPERADOR_CENTRO', 'ADMIN']} />}>
          <Route path="/panel-centro" element={<PanelCentro />} />
        </Route>

        {/* Rutas protegidas para Médicos Especialistas */}
        <Route element={<RoleGuard allowedRoles={['MEDICO', 'ADMIN']} />}>
          <Route path="/portal-medico" element={<PortalMedico />} />
          <Route path="/portal-medico/atencion/:id" element={<ConsultaMedica />} />
        </Route>

        {/* Rutas protegidas para Pacientes Registrados */}
        <Route element={<RoleGuard allowedRoles={['PACIENTE', 'ADMIN']} />}>
          <Route path="/mi-historial" element={<HistorialPaciente />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
