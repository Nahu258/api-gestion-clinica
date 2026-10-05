/**
 * api/centros.js — Capa de comunicación con la API de centros de emergencia.
 *
 * Endpoints:
 *   - GET /api/v1/centros/cercanos/?lat=...&lon=...&radio_km=...&tipo=...
 *   - GET /api/v1/centros/{id}/
 *
 * Incluye fallback offline utilizando sessionStorage para emergencias
 * con baja conectividad o sin conexión.
 */

import { getAuthHeaders } from './auth.js'

const API_BASE = '/api/v1'
const CACHE_KEY = 'emergenciaya_centros_cache'

/**
 * Obtiene centros de emergencia cercanos a las coordenadas indicadas.
 * Si falla la red (offline), intenta recuperar los últimos datos del cache.
 *
 * @param {Object} params
 * @param {number} params.lat - Latitud del usuario
 * @param {number} params.lon - Longitud del usuario
 * @param {number} [params.radio_km=10] - Radio de búsqueda en km
 * @param {string} [params.tipo] - Tipo opcional: hospital, upa, same, bomberos, policia, otro
 * @returns {Promise<{ cantidad: number, resultados: Array, esOffline?: boolean }>}
 */
export async function obtenerCentrosCercanos({ lat, lon, radio_km = 10, tipo = '' } = {}) {
  const query = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radio_km: String(radio_km),
  })
  if (tipo) {
    query.set('tipo', tipo)
  }

  try {
    const res = await fetch(`${API_BASE}/centros/cercanos/?${query.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...getAuthHeaders(),
      },
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Error ${res.status} al consultar centros cercanos.`)
    }

    const data = await res.json()
    // Guardar en cache para soporte offline
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        lat,
        lon,
        radio_km,
        tipo,
        data,
      }))
    } catch {
      // Ignorar errores de quota de sessionStorage
    }

    return { ...data, esOffline: false }
  } catch (error) {
    // Si la llamada falló por desconexión o error de red, intentar usar cache local
    const cached = obtenerCacheCentros()
    if (cached && cached.data) {
      return {
        ...cached.data,
        esOffline: true,
      }
    }
    throw error
  }
}

/**
 * Obtiene el detalle de un centro específico por ID.
 */
export async function obtenerCentroPorId(id) {
  try {
    const res = await fetch(`${API_BASE}/centros/${id}/`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...getAuthHeaders(),
      },
    })

    if (res.ok) {
      return await res.json()
    }
  } catch {
    // Intentar buscar en cache local si no hay red
  }

  // Fallback a buscar en la lista cacheada
  const cached = obtenerCacheCentros()
  if (cached?.data?.resultados) {
    const encontrado = cached.data.resultados.find(c => String(c.id) === String(id))
    if (encontrado) return encontrado
  }

  throw new Error(`Centro #${id} no encontrado.`)
}

/**
 * Helper para leer los centros del cache local.
 */
export function obtenerCacheCentros() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
