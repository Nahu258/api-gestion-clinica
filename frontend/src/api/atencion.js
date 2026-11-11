/**
 * api/atencion.js - Solicitudes de atención de emergencia.
 *
 * Todas las llamadas pasan por apiFetch (api/cliente.js): renueva el token
 * vencido y traduce los errores del backend ({error: {codigo, mensaje}}) a
 * un mensaje legible.
 *
 *   - Paciente: crear, consultar y cancelar su solicitud; historial.
 *   - Centro:   bandeja de solicitudes y derivación.
 *   - Médico:   cola, disponibilidad, ficha clínica y cierre.
 */

import { apiFetch } from './cliente.js'

export const KEY_SOLICITUD_ID = 'emergenciaya_solicitud_id'
export const KEY_ULTIMA_SOLICITUD = 'emergenciaya_ultima_solicitud'
const PREFIJO_CODIGO = 'emergenciaya_codigo_'

/**
 * Código secreto que el backend entrega al crear la solicitud. Sin él (o sin
 * el JWT del dueño) la API responde 404: el id solo no alcanza (anti-IDOR).
 */
function guardarCodigo(id, codigo) {
  if (!codigo) return
  try {
    localStorage.setItem(PREFIJO_CODIGO + id, codigo)
  } catch {
    // Sin espacio en el almacenamiento: el seguimiento sigue con el JWT
  }
}

function headersSeguimiento(id) {
  try {
    const codigo = localStorage.getItem(PREFIJO_CODIGO + id)
    return codigo ? { 'X-Codigo-Seguimiento': codigo } : {}
  } catch {
    return {}
  }
}

function recordarSolicitud(data) {
  try {
    sessionStorage.setItem(KEY_SOLICITUD_ID, String(data.id))
    sessionStorage.setItem(KEY_ULTIMA_SOLICITUD, JSON.stringify(data))
  } catch {
    // Ignorar fallos de quota
  }
}

/** True si la solicitud sólo existe en este dispositivo (se creó sin red). */
export function esSolicitudLocal(id) {
  return String(id).startsWith('local_')
}

/**
 * Crea un aviso ("voy en camino") o una solicitud de atención.
 *
 * Si el servidor rechaza los datos, el error llega a la pantalla. Sólo cuando
 * no hay red se guarda un aviso local, para no dejar a la persona sin
 * respuesta en una urgencia; esa copia se marca con `esOffline`.
 *
 * @param {{centro_id: number, modo: 'aviso'|'solicitud', motivo?: string,
 *   nombre_invitado?: string, telefono_invitado?: string,
 *   lat_usuario?: number, lon_usuario?: number}} payload
 */
export async function crearSolicitud(payload) {
  try {
    const { codigo_seguimiento: codigo, ...data } = await apiFetch('/atencion/solicitudes/', {
      method: 'POST',
      body: payload,
    })
    guardarCodigo(data.id, codigo)
    recordarSolicitud(data)
    return data
  } catch (err) {
    if (err.codigo !== 'SIN_CONEXION') throw err
    const local = {
      id: 'local_' + Date.now(),
      centro_id: payload.centro_id,
      modo: payload.modo,
      motivo: payload.motivo || '',
      nombre_invitado: payload.nombre_invitado || '',
      estado: 'pendiente',
      creado_en: new Date().toISOString(),
      esOffline: true,
    }
    recordarSolicitud(local)
    return local
  }
}

/**
 * Estado actual de una solicitud (lo usa el seguimiento, cada 10 s).
 * Sin red devuelve la última copia conocida marcada con `_sinConexion`.
 */
export async function obtenerSolicitud(id) {
  const guardada = obtenerUltimaSolicitudGuardada()
  const esLaGuardada = guardada && String(guardada.id) === String(id)

  if (esSolicitudLocal(id)) {
    if (esLaGuardada) return { ...guardada, _sinConexion: true }
    throw new Error('Este aviso se guardó sin conexión y ya no está en el dispositivo.')
  }

  try {
    const data = await apiFetch(`/atencion/solicitudes/${id}/`, { headers: headersSeguimiento(id) })
    if (esLaGuardada || !guardada) recordarSolicitud(data)
    return data
  } catch (err) {
    if (err.codigo === 'SIN_CONEXION' && esLaGuardada) return { ...guardada, _sinConexion: true }
    throw err
  }
}

/** Cancela una solicitud activa (sólo su dueño o el centro). */
export async function cancelarSolicitud(id) {
  const data = await apiFetch(`/atencion/solicitudes/${id}/`, {
    method: 'PATCH',
    body: { estado: 'cancelado' },
    headers: headersSeguimiento(id),
  })
  recordarSolicitud(data)
  return data
}

/** Última solicitud guardada en la sesión del navegador, si existe. */
export function obtenerUltimaSolicitudGuardada() {
  try {
    const raw = sessionStorage.getItem(KEY_ULTIMA_SOLICITUD)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Id de la solicitud en seguimiento en este navegador, o null. */
export function obtenerSolicitudActivaId() {
  try {
    return sessionStorage.getItem(KEY_SOLICITUD_ID) || null
  } catch {
    return null
  }
}

// ── Centro ──────────────────────────────────────────────────────────────────

/** Solicitudes de un centro (bandeja del operador y tablero). */
export const listarSolicitudesCentro = (centroId, { estado, modo } = {}) =>
  apiFetch(`/centros/${centroId}/solicitudes/`, { query: { estado, modo } })

/** Cambia el estado de una solicitud desde el centro (aceptar, en camino, cancelar). */
export const cambiarEstadoSolicitud = (solicitudId, estado) =>
  apiFetch(`/atencion/solicitudes/${solicitudId}/`, { method: 'PATCH', body: { estado } })

/** Deriva una solicitud a un médico (triage del operador). */
export const derivarSolicitud = (solicitudId, { especialidad_id, medico_id, prioridad = 'alta', observaciones = '' }) =>
  apiFetch(`/atencion/solicitudes/${solicitudId}/derivar/`, {
    method: 'POST',
    body: { especialidad_id, medico_id, prioridad, observaciones },
  })

/** Especialidades activas de un centro (dato público). */
export const listarEspecialidadesCentro = (centroId) => apiFetch(`/centros/${centroId}/especialidades/`)

/** Médicos de un centro con su disponibilidad en tiempo real. */
export async function listarEspecialistasDisponiblesCentro(centroId, especialidadId = null) {
  const data = await apiFetch(`/centros/${centroId}/especialistas-disponibles/`, {
    query: { especialidad_id: especialidadId },
  })
  return data?.resultados || []
}

// ── Médico ──────────────────────────────────────────────────────────────────

export const iniciarAtencion = (solicitudId) =>
  apiFetch(`/atencion/solicitudes/${solicitudId}/iniciar-atencion/`, { method: 'POST' })

export const completarAtencion = (solicitudId, { diagnostico, indicaciones = '' }) =>
  apiFetch(`/atencion/solicitudes/${solicitudId}/completar/`, {
    method: 'POST',
    body: { diagnostico, indicaciones },
  })

export const obtenerFichaClinica = (solicitudId) => apiFetch(`/atencion/solicitudes/${solicitudId}/ficha-clinica/`)

export const obtenerMiDisponibilidad = () => apiFetch('/medicos/mi-disponibilidad/')

export const actualizarMiDisponibilidad = (estado) =>
  apiFetch('/medicos/mi-disponibilidad/', { method: 'PATCH', body: { estado } })

export const obtenerColaMedico = (estado = 'derivado,en_atencion') =>
  apiFetch('/medicos/mis-solicitudes/', { query: { estado } })

// ── Paciente ────────────────────────────────────────────────────────────────

/** Historial del paciente autenticado: todas sus solicitudes, la más nueva primero. */
export const obtenerMiHistorial = () => apiFetch('/pacientes/mi-historial/')

/** Detalle completo de una consulta propia (diagnóstico, triage, médico, horarios). */
export const obtenerMiConsulta = (id) =>
  apiFetch(`/atencion/solicitudes/${id}/`, { headers: headersSeguimiento(id) })
