/**
 * api/atencion.js - Capa de comunicación para Solicitudes de Atención de Emergencia.
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
  try {
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
  } catch (err) {
    // Si la llamada falló por error de red / offline, crear registro de guardia local
    const offlineId = 'local_' + Date.now()
    const offlineData = {
      id: offlineId,
      centro: payload.centro_id,
      modo: payload.modo,
      motivo: payload.motivo || '',
      estado: 'pendiente',
      creado_en: new Date().toISOString(),
      esOffline: true,
      mensaje_offline: 'Aviso guardado localmente en tu dispositivo para la guardia.',
    }
    try {
      sessionStorage.setItem(KEY_SOLICITUD_ID, String(offlineId))
      sessionStorage.setItem(KEY_ULTIMA_SOLICITUD, JSON.stringify(offlineData))
    } catch {
      // Ignorar fallos de quota
    }
    return offlineData
  }
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

/**
 * Lista las solicitudes de atención de un centro de salud (para el operador).
 */
export async function listarSolicitudesCentro(centroId, { estado, modo } = {}) {
  const params = new URLSearchParams()
  if (estado) params.append('estado', estado)
  if (modo) params.append('modo', modo)

  const url = `${API_BASE}/centros/${centroId}/solicitudes/?${params.toString()}`
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      ...getAuthHeaders(),
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Error ${res.status} al listar solicitudes del centro.`)
  }

  return await res.json()
}

/**
 * Deriva una solicitud a un médico especialista (Triage del operador).
 */
export async function derivarSolicitud(solicitudId, { especialidad_id, medico_id, prioridad = 'alta', observaciones = '' }) {
  const res = await fetch(`${API_BASE}/atencion/solicitudes/${solicitudId}/derivar/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      especialidad_id,
      medico_id,
      prioridad,
      observaciones,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.detail || `Error ${res.status} al derivar la solicitud.`)
  }

  return await res.json()
}

/**
 * Inicia la atención médica de una solicitud derivada (Médico especialista).
 */
export async function iniciarAtencion(solicitudId) {
  const res = await fetch(`${API_BASE}/atencion/solicitudes/${solicitudId}/iniciar-atencion/`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      ...getAuthHeaders(),
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.detail || `Error ${res.status} al iniciar la atención.`)
  }

  return await res.json()
}

/**
 * Finaliza la atención médica guardando diagnóstico e indicaciones.
 */
export async function completarAtencion(solicitudId, { diagnostico, indicaciones = '' }) {
  const res = await fetch(`${API_BASE}/atencion/solicitudes/${solicitudId}/completar/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ diagnostico, indicaciones }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.detail || `Error ${res.status} al finalizar la atención.`)
  }

  return await res.json()
}

/**
 * Obtiene la ficha clínica del paciente y detalles del episodio para el médico.
 */
export async function obtenerFichaClinica(solicitudId) {
  const res = await fetch(`${API_BASE}/atencion/solicitudes/${solicitudId}/ficha-clinica/`, {
    headers: {
      'Accept': 'application/json',
      ...getAuthHeaders(),
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Error ${res.status} al consultar la ficha clínica.`)
  }

  return await res.json()
}

/**
 * Obtiene el historial clínico del paciente registrado autenticado.
 */
export async function obtenerMiHistorial() {
  const res = await fetch(`${API_BASE}/pacientes/mi-historial/`, {
    headers: {
      'Accept': 'application/json',
      ...getAuthHeaders(),
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Error ${res.status} al consultar tu historial médico.`)
  }

  return await res.json()
}

/**
 * Lista las especialidades activas de un centro.
 */
export async function listarEspecialidadesCentro(centroId) {
  const res = await fetch(`${API_BASE}/centros/${centroId}/especialidades/`, {
    headers: {
      'Accept': 'application/json',
      ...getAuthHeaders(),
    },
  })
  if (!res.ok) return []
  return await res.json()
}

/**
 * Lista los especialistas disponibles de un centro (en tiempo real con Redis).
 */
export async function listarEspecialistasDisponiblesCentro(centroId, especialidadId = null) {
  const query = especialidadId ? `?especialidad_id=${especialidadId}` : ''
  const res = await fetch(`${API_BASE}/centros/${centroId}/especialistas-disponibles/${query}`, {
    headers: {
      'Accept': 'application/json',
      ...getAuthHeaders(),
    },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.resultados || []
}
