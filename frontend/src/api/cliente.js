/**
 * api/cliente.js - Helper de fetch común para las consolas de administración.
 *
 * - Agrega el JWT (o el token de invitado) a cada request.
 * - Ante un 401 intenta refrescar el access token una sola vez y reintenta.
 * - Normaliza los errores del backend en un ApiError:
 *     { status, codigo, mensaje, campos: { campo: 'mensaje' }, detalles }
 *   El backend responde siempre { error: { codigo, mensaje, detalles } } y,
 *   en los 400 de validación, `detalles` trae los errores de DRF por campo.
 */

import { cerrarSesion, getAuthHeaders, refrescarToken } from './auth.js'

export const API_BASE = '/api/v1'

export class ApiError extends Error {
  constructor({ status, codigo = 'ERROR', mensaje, campos = {}, detalles = {} }) {
    super(mensaje || `Error ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.codigo = codigo
    this.campos = campos
    this.detalles = detalles
  }
}

/** Primer mensaje legible de un valor de error de DRF (string, lista u objeto anidado). */
function primerMensaje(valor) {
  if (valor == null) return ''
  if (typeof valor === 'string') return valor
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const msg = primerMensaje(item)
      if (msg) return msg
    }
    return ''
  }
  if (typeof valor === 'object') {
    for (const item of Object.values(valor)) {
      const msg = primerMensaje(item)
      if (msg) return msg
    }
  }
  return String(valor)
}

/** Convierte `{campo: ['msg', ...]}` de DRF en `{campo: 'msg'}`. */
export function camposDesdeDRF(detalles) {
  const campos = {}
  if (!detalles || typeof detalles !== 'object' || Array.isArray(detalles)) return campos
  for (const [campo, valor] of Object.entries(detalles)) {
    const msg = primerMensaje(valor)
    if (msg) campos[campo] = msg
  }
  return campos
}

function construirError(status, data) {
  const err = data?.error
  if (err && typeof err === 'object') {
    const detalles = err.detalles || {}
    const campos = err.codigo === 'DATOS_INVALIDOS' ? camposDesdeDRF(detalles) : {}
    let mensaje = err.mensaje
    if (campos.non_field_errors) {
      mensaje = campos.non_field_errors
      delete campos.non_field_errors
    }
    return new ApiError({ status, codigo: err.codigo, mensaje, campos, detalles })
  }
  if (typeof err === 'string') return new ApiError({ status, mensaje: err })
  if (data?.detail) return new ApiError({ status, mensaje: data.detail })
  return new ApiError({ status, mensaje: `Error ${status} al comunicarse con el servidor.` })
}

function armarUrl(path, query) {
  const url = `${API_BASE}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, v)
  })
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

/**
 * Request JSON a la API.
 *
 * @param {string} path - Ruta relativa a /api/v1 (ej. '/admin/centros/').
 * @param {object} [opciones]
 * @param {string} [opciones.method='GET']
 * @param {object} [opciones.body] - Se envía como JSON.
 * @param {object} [opciones.query] - Query string; se omiten valores vacíos.
 * @param {AbortSignal} [opciones.signal]
 */
export async function apiFetch(path, { method = 'GET', body, query, signal } = {}, reintento = true) {
  let res
  try {
    res = await fetch(armarUrl(path, query), {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...getAuthHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError({ status: 0, codigo: 'SIN_CONEXION', mensaje: 'No se pudo conectar con el servidor.' })
  }

  if (res.status === 401 && reintento) {
    const nuevo = await refrescarToken()
    if (nuevo) return apiFetch(path, { method, body, query, signal }, false)
    cerrarSesion()
    throw new ApiError({ status: 401, codigo: 'NO_AUTENTICADO', mensaje: 'Tu sesión venció. Volvé a ingresar.' })
  }

  if (res.status === 204) return null

  const data = await res.json().catch(() => null)
  if (!res.ok) throw construirError(res.status, data)
  return data
}

/** Recorre todas las páginas de un listado paginado de DRF. */
export async function apiFetchTodo(path, { query = {}, signal } = {}) {
  const resultados = []
  let page = 1
  // Tope defensivo: 20 páginas de 100 elementos
  while (page <= 20) {
    const data = await apiFetch(path, { query: { ...query, page, page_size: 100 }, signal })
    resultados.push(...(data?.results || []))
    if (!data?.next) break
    page += 1
  }
  return resultados
}
