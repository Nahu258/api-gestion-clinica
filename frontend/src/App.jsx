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
import { ToastProvider } from './components/ui/Toast.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'
import GestionLayout from './pages/gestion/GestionLayout.jsx'
import EnConstruccion from './pages/EnConstruccion.jsx'
import Instituciones from './pages/admin/Instituciones.jsx'
import InstitucionForm from './pages/admin/InstitucionForm.jsx'
import InstitucionDetalle from './pages/admin/InstitucionDetalle.jsx'
import Especialidades from './pages/admin/Especialidades.jsx'
import Usuarios from './pages/admin/Usuarios.jsx'
import Resumen from './pages/admin/Resumen.jsx'
import GestionInicio from './pages/gestion/GestionInicio.jsx'
import EspecialidadesCentro from './pages/gestion/EspecialidadesCentro.jsx'
import MedicosCentro from './pages/gestion/MedicosCentro.jsx'
import GuardiasCentro from './pages/gestion/GuardiasCentro.jsx'

/**
 * App - enrutador raíz de EmergenciaYA con RBAC (Épica 4 issue #26).
 *
 * Épica 5 (AE5-05): consola del superadmin en /admin/* y gestión de la
 * institución en /panel-centro/gestion/*.
 */
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
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
            <Route path="/panel-centro/gestion" element={<GestionLayout />}>
              <Route index element={<GestionInicio />} />
              <Route path="especialidades" element={<EspecialidadesCentro />} />
              <Route path="medicos" element={<MedicosCentro />} />
              <Route path="guardias" element={<GuardiasCentro />} />
            </Route>
          </Route>

          {/* Consola del superadmin */}
          <Route element={<RoleGuard allowedRoles={['ADMIN']} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Resumen />} />
              <Route path="instituciones" element={<Instituciones />} />
              <Route path="instituciones/nueva" element={<InstitucionForm />} />
              <Route path="instituciones/:id" element={<InstitucionDetalle />} />
              <Route path="instituciones/:id/editar" element={<InstitucionForm />} />
              <Route path="especialidades" element={<Especialidades />} />
              <Route path="usuarios" element={<Usuarios />} />
            </Route>
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
      </ToastProvider>
    </AuthProvider>
  )
}
