/**
 * api/admin.js - Endpoints de las consolas de administración (Épica 5).
 *
 *   Instituciones (ADMIN)        /admin/centros/            (AE5-01)
 *   Usuarios del personal        /admin/usuarios/           (AE5-02)
 *   Catálogo de especialidades   /especialidades/           (AE5-03)
 *   Especialidades y plantel     /centros/{id}/...          (AE5-03)
 *   Guardias programadas         /centros/{id}/guardias/    (AE5-04)
 *
 * Todas las funciones lanzan ApiError (ver api/cliente.js).
 */

import { apiFetch, apiFetchTodo } from './cliente.js'

export const TIPOS_CENTRO = [
  { id: 'hospital', label: 'Hospital público' },
  { id: 'clinica', label: 'Clínica / Sanatorio' },
  { id: 'upa', label: 'UPA / Primeros auxilios' },
  { id: 'same', label: 'SAME / Ambulancia' },
  { id: 'bomberos', label: 'Bomberos' },
  { id: 'policia', label: 'Policía' },
  { id: 'otro', label: 'Otro' },
]

export const ROLES_PERSONAL = [
  { id: 'OPERADOR_CENTRO', label: 'Administrador de institución' },
  { id: 'MEDICO', label: 'Médico' },
  { id: 'ADMIN', label: 'Administrador general' },
]

export function etiquetaTipo(tipo) {
  return TIPOS_CENTRO.find((t) => t.id === tipo)?.label || tipo
}

export function etiquetaRolPersonal(rol) {
  return ROLES_PERSONAL.find((r) => r.id === rol)?.label || rol
}

// ── Instituciones ────────────────────────────────────────────────────────────

export const listarCentrosAdmin = (filtros = {}, opciones = {}) =>
  apiFetch('/admin/centros/', { query: filtros, ...opciones })

export const listarTodosLosCentrosAdmin = (filtros = {}, opciones = {}) =>
  apiFetchTodo('/admin/centros/', { query: filtros, ...opciones })

export const obtenerCentroAdmin = (id) => apiFetch(`/admin/centros/${id}/`)

export const crearCentro = (datos) => apiFetch('/admin/centros/', { method: 'POST', body: datos })

export const actualizarCentro = (id, cambios) =>
  apiFetch(`/admin/centros/${id}/`, { method: 'PATCH', body: cambios })

export const desactivarCentro = (id) => apiFetch(`/admin/centros/${id}/desactivar/`, { method: 'POST' })

export const activarCentro = (id) => apiFetch(`/admin/centros/${id}/activar/`, { method: 'POST' })

// ── Usuarios del personal ────────────────────────────────────────────────────

export const listarTodosLosUsuarios = (filtros = {}, opciones = {}) =>
  apiFetchTodo('/admin/usuarios/', { query: filtros, ...opciones })

export const obtenerUsuario = (id) => apiFetch(`/admin/usuarios/${id}/`)

export const crearUsuario = (datos) => apiFetch('/admin/usuarios/', { method: 'POST', body: datos })

export const actualizarUsuario = (id, cambios) =>
  apiFetch(`/admin/usuarios/${id}/`, { method: 'PATCH', body: cambios })

export const resetearPassword = (id) =>
  apiFetch(`/admin/usuarios/${id}/reset-password/`, { method: 'POST' })

// ── Catálogo de especialidades ───────────────────────────────────────────────

export const listarCatalogoEspecialidades = (q = '') => apiFetch('/especialidades/', { query: { q } })

export const obtenerEspecialidadCatalogo = (id) => apiFetch(`/especialidades/${id}/`)

export const crearEspecialidad = (datos) => apiFetch('/especialidades/', { method: 'POST', body: datos })

export const actualizarEspecialidad = (id, cambios) =>
  apiFetch(`/especialidades/${id}/`, { method: 'PATCH', body: cambios })

// ── Especialidades y plantel de un centro ────────────────────────────────────

export const listarEspecialidadesGestion = (centroId) =>
  apiFetch(`/centros/${centroId}/especialidades/`, { query: { incluir_inactivas: 'true' } })

export const vincularEspecialidad = (centroId, especialidadId) =>
  apiFetch(`/centros/${centroId}/especialidades/`, {
    method: 'POST',
    body: { especialidad_id: especialidadId },
  })

export const cambiarEstadoEspecialidad = (centroId, especialidadId, activo, forzar = false) =>
  apiFetch(`/centros/${centroId}/especialidades/${especialidadId}/`, {
    method: 'PATCH',
    body: { activo, forzar },
  })

export const listarPlantel = (centroId, filtros = {}) =>
  apiFetch(`/centros/${centroId}/medicos/`, { query: filtros })

export const actualizarMedicoPlantel = (centroId, medicoId, cambios) =>
  apiFetch(`/centros/${centroId}/medicos/${medicoId}/`, { method: 'PATCH', body: cambios })

// ── Guardias programadas ─────────────────────────────────────────────────────

export const listarGuardias = (centroId, filtros = {}) =>
  apiFetch(`/centros/${centroId}/guardias/`, { query: filtros })

export const crearGuardia = (centroId, datos) =>
  apiFetch(`/centros/${centroId}/guardias/`, { method: 'POST', body: datos })

export const actualizarGuardia = (centroId, guardiaId, cambios) =>
  apiFetch(`/centros/${centroId}/guardias/${guardiaId}/`, { method: 'PATCH', body: cambios })

export const eliminarGuardia = (centroId, guardiaId) =>
  apiFetch(`/centros/${centroId}/guardias/${guardiaId}/`, { method: 'DELETE' })

export const listarMisGuardias = () => apiFetch('/medicos/mis-guardias/')

// ── Resumen de la red (AE5-14) ───────────────────────────────────────────────

export const obtenerResumenRed = (opciones = {}) => apiFetch('/admin/resumen/', opciones)
