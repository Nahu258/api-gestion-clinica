/**
 * utils/roles.js - Nombre visible y pantalla de inicio de cada rol.
 */

export const ROLES = {
  ADMIN: { label: 'Administración general', inicio: '/panel-centro', destino: 'Panel de centro' },
  OPERADOR_CENTRO: { label: 'Administración del centro', inicio: '/panel-centro', destino: 'Panel de centro' },
  MEDICO: { label: 'Médico de guardia', inicio: '/portal-medico', destino: 'Mi guardia' },
  PACIENTE: { label: 'Paciente', inicio: '/mi-historial', destino: 'Mi historial' },
  INVITADO: { label: 'Invitado', inicio: '/mapa', destino: 'Mapa de guardias' },
}

export function rutaInicio(rol) {
  return ROLES[rol]?.inicio || '/mapa'
}

export function etiquetaRol(rol) {
  return ROLES[rol]?.label || 'Invitado'
}

export function iniciales(nombre = '') {
  const partes = nombre
    .replace(/^(Dr|Dra)\.\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?'
}
