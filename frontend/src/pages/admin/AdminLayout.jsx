/**
 * AdminLayout - Consola del superadmin (/admin/*), sólo rol ADMIN.
 */

import { Buildings, ChartBar, FirstAidKit, UsersThree } from '@phosphor-icons/react'
import ConsolaLayout from '../../components/ConsolaLayout.jsx'

export const SECCIONES_ADMIN = [
  { to: '/admin', label: 'Resumen', icon: ChartBar, end: true },
  { to: '/admin/instituciones', label: 'Instituciones', icon: Buildings },
  { to: '/admin/especialidades', label: 'Especialidades', icon: FirstAidKit },
  { to: '/admin/usuarios', label: 'Usuarios', icon: UsersThree },
]

export default function AdminLayout() {
  return <ConsolaLayout titulo="Administración general" subtitulo="Red de guardias" items={SECCIONES_ADMIN} />
}
