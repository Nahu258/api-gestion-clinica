/**
 * api/atencion.js — Capa de comunicación para Solicitudes de Atención de Emergencia.
 *
 * Cubre:
 *   - Crear solicitud (aviso o solicitud urgente): POST /api/v1/atencion/solicitudes/
 *   - Obtener estado de solicitud: GET /api/v1/atencion/solicitudes/{id}/
 *   - Cancelar o actualizar estado: PATCH /api/v1/atencion/solicitudes/{id}/
 */

import { getAuthHeaders } from './auth.js'

const API_BASE = '/api/v1'
export const KEY_SOLICITUD_ID = 'emergenciaya_solicitud_id'
export const KEY_ULTIMA_SOLICITUD = 'emergenciaya_ultima_solicitud'

/**
 * Envía una nueva solicitud de atención urgente o aviso de camino.
 *
 * @param {Object} payload
 * @param {number} payload.centro_id - ID del centro de emergencia
 * @param {'aviso'|'solicitud'} payload.modo - Modo de atención
 * @param {string} [payload.motivo] - Motivo breve de consulta (opcional, max 200 chars)
 * @param {string} [payload.nombre_invitado] - Nombre del usuario invitado
 * @param {string} [payload.telefono_invitado] - Teléfono de contacto
 * @param {number} [payload.lat_usuario] - Latitud del usuario
 * @param {number} [payload.lon_usuario] - Longitud del usuario
 * @returns {Promise<Object>} Datos de la solicitud creada
 */
export async function crearSolicitud(payload) {
  const res = await fetch(`${API_BASE}/atencion/solicitudes/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    let msg = errorData.error || errorData.detail
    if (!msg && typeof errorData === 'object') {
      const keys = Object.keys(errorData)
      if (keys.length > 0) {
        msg = `${keys[0]}: ${Array.isArray(errorData[keys[0]]) ? errorData[keys[0]].join(', ') : errorData[keys[0]]}`
      }
    }
    throw new Error(msg || `Error ${res.status} al crear la solicitud de atención.`)
  }

  const data = await res.json()

  // Guardar en sessionStorage para persistencia ante recarga de pantalla (criterio AE3-10)
  try {
    sessionStorage.setItem(KEY_SOLICITUD_ID, String(data.id))
    sessionStorage.setItem(KEY_ULTIMA_SOLICITUD, JSON.stringify(data))
  } catch {
    // Ignorar fallos de quota
  }

  return data
}

/**
 * Obtiene el estado actual de una solicitud (usado para el polling en seguimiento).
 *
 * @param {number|string} id - ID de la solicitud
 * @returns {Promise<Object>}
 */
export async function obtenerSolicitud(id) {
  try {
    const res = await fetch(`${API_BASE}/atencion/solicitudes/${id}/`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...getAuthHeaders(),
      },
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `Error ${res.status} al obtener estado de la solicitud.`)
    }

    const data = await res.json()
    // Actualizar cache local
    try {
      sessionStorage.setItem(KEY_ULTIMA_SOLICITUD, JSON.stringify(data))
    } catch {
      // Ignorar fallos
    }
    return data
  } catch (error) {
    // Si la red falla durante polling, devolver el último estado conocido si coincide el ID
    const cached = obtenerUltimaSolicitudGuardada()
    if (cached && String(cached.id) === String(id)) {
      return { ...cached, _esCacheOffline: true }
    }
    throw error
  }
}

/**
 * Cancela una solicitud activa.
 *
 * @param {number|string} id - ID de la solicitud
 * @returns {Promise<Object>}
 */
export async function cancelarSolicitud(id) {
  const res = await fetch(`${API_BASE}/atencion/solicitudes/${id}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ estado: 'cancelado' }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Error ${res.status} al cancelar la solicitud.`)
  }

  const data = await res.json()
  try {
    sessionStorage.setItem(KEY_ULTIMA_SOLICITUD, JSON.stringify(data))
  } catch {
    // Ignorar fallos
  }
  return data
}

/**
 * Devuelve la última solicitud guardada en sessionStorage si existe.
 */
export function obtenerUltimaSolicitudGuardada() {
  try {
    const raw = sessionStorage.getItem(KEY_ULTIMA_SOLICITUD)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
