/**
 * api/auth.js - Capa de comunicación con el backend de autenticación.
 *
 * Cubre los flujos de la Épica 2:
 *   - Google OAuth2: id_token → JWT propio (POST /api/v1/auth/google/)
 *   - Modo invitado: POST /api/v1/auth/invitado/ → X-Guest-Token
 *
 * Almacenamiento:
 *   - JWT (usuario registrado) → localStorage['emergenciaya_jwt']
 *   - Guest token (invitado)   → sessionStorage['emergenciaya_guest_token']
 */

const API_BASE = '/api/v1'

const KEY_JWT         = 'emergenciaya_jwt'
const KEY_REFRESH     = 'emergenciaya_refresh'
const KEY_GUEST_TOKEN = 'emergenciaya_guest_token'

/**
 * Intercambia el id_token de Google por JWT propios del backend.
 */
export async function loginConGoogle(idToken) {
  const solicitudId = sessionStorage.getItem('emergenciaya_solicitud_id')
  const payload = { id_token: idToken }
  if (solicitudId && !isNaN(Number(solicitudId))) {
    payload.solicitud_id = Number(solicitudId)
  }

  const res = await fetch(`${API_BASE}/auth/google/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Error ${res.status} al autenticar con Google.`)
  }

  const data = await res.json()
  localStorage.setItem(KEY_JWT, data.access_token)
  localStorage.setItem(KEY_REFRESH, data.refresh_token)
  return data
}

/**
 * Crea un token de invitado en el backend (Redis, TTL 2h).
 */
export async function loginComoInvitado(nombre = '') {
  try {
    const res = await fetch(`${API_BASE}/auth/invitado/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `Error ${res.status} al crear sesión de invitado.`)
    }

    const data = await res.json()
    sessionStorage.setItem(KEY_GUEST_TOKEN, data.token)
    return data
  } catch (err) {
    // Si la API no está disponible o hay error de red, no bloquear al usuario en una emergencia:
    const fallbackToken = 'guest_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now()
    sessionStorage.setItem(KEY_GUEST_TOKEN, fallbackToken)
    return { token: fallbackToken, esOffline: true }
  }
}

/**
 * Decodifica las claims de un JWT en base64url sin dependencias externas.
 */
export function parseJwt(token) {
  if (!token) return null
  try {
    const base64Url = token.split('.')[1]
    if (!base64Url) return null
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch (e) {
    return null
  }
}

/**
 * Obtiene el perfil completo y rol del usuario autenticado (/api/v1/auth/me/).
 */
export async function obtenerUsuarioActual() {
  const headers = getAuthHeaders()
  if (!headers.Authorization) return null

  const res = await fetch(`${API_BASE}/auth/me/`, {
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    if (res.status === 401) {
      // Intentar refrescar antes de fallar
      const refreshed = await refrescarToken()
      if (refreshed) {
        return obtenerUsuarioActual()
      }
      cerrarSesion()
      return null
    }
    return null
  }

  return await res.json()
}

/**
 * Refresca el access token usando el refresh token almacenado.
 */
export async function refrescarToken() {
  const refreshToken = localStorage.getItem(KEY_REFRESH)
  if (!refreshToken) return null

  try {
    const res = await fetch(`${API_BASE}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    })

    if (!res.ok) {
      cerrarSesion()
      return null
    }

    const data = await res.json()
    if (data.access) {
      localStorage.setItem(KEY_JWT, data.access)
      return data.access
    }
    return null
  } catch {
    cerrarSesion()
    return null
  }
}

/**
 * Retorna true si hay una sesión activa (JWT o token de invitado).
 */
export function tieneSessionActiva() {
  return !!(
    localStorage.getItem(KEY_JWT) ||
    sessionStorage.getItem(KEY_GUEST_TOKEN)
  )
}

/**
 * Devuelve el header de autenticación apropiado para requests a la API.
 */
export function getAuthHeaders() {
  const jwt = localStorage.getItem(KEY_JWT)
  if (jwt) return { Authorization: `Bearer ${jwt}` }

  const guestToken = sessionStorage.getItem(KEY_GUEST_TOKEN)
  if (guestToken) return { 'X-Guest-Token': guestToken }

  return {}
}

/**
 * Cierra la sesión actual eliminando todos los tokens almacenados.
 */
export function cerrarSesion() {
  localStorage.removeItem(KEY_JWT)
  localStorage.removeItem(KEY_REFRESH)
  sessionStorage.removeItem(KEY_GUEST_TOKEN)
}
