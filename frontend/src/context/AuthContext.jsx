import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  loginConGoogle,
  loginComoInvitado,
  obtenerUsuarioActual,
  refrescarToken,
  parseJwt,
  cerrarSesion,
} from '../api/auth.js'

const AuthContext = createContext(null)

const KEY_JWT = 'emergenciaya_jwt'
const KEY_GUEST_TOKEN = 'emergenciaya_guest_token'

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [rol, setRol] = useState(null)
  const [esInvitado, setEsInvitado] = useState(false)
  const [cargando, setCargando] = useState(true)

  // Carga inicial y sincronización con el servidor
  const sincronizar = useCallback(async () => {
    const jwt = localStorage.getItem(KEY_JWT)
    const guestToken = sessionStorage.getItem(KEY_GUEST_TOKEN)

    if (jwt) {
      // 1. Decodificar claims inmediatas para respuesta instantánea de UI
      const claims = parseJwt(jwt)
      if (claims) {
        setRol(claims.rol || 'PACIENTE')
        setEsInvitado(false)
      }

      // 2. Sincronizar en vivo con /api/v1/auth/me/
      try {
        const perfil = await obtenerUsuarioActual()
        if (perfil) {
          setUsuario(perfil)
          setRol(perfil.rol || 'PACIENTE')
          setEsInvitado(false)
          return perfil
        }
      } catch (err) {
        console.warn('[AuthContext] Error al sincronizar usuario con el backend:', err)
      }
    } else if (guestToken) {
      setEsInvitado(true)
      setRol('INVITADO')
      setUsuario({
        id: null,
        nombre: 'Invitado',
        email: null,
        rol: 'INVITADO',
      })
    } else {
      setUsuario(null)
      setRol(null)
      setEsInvitado(false)
    }

    return null
  }, [])

  useEffect(() => {
    sincronizar().finally(() => setCargando(false))
  }, [sincronizar])

  const loginGoogle = useCallback(async (idToken) => {
    setCargando(true)
    try {
      const data = await loginConGoogle(idToken)
      sessionStorage.removeItem(KEY_GUEST_TOKEN)

      // Cargar claims del token recibido
      const claims = parseJwt(data.access_token)
      const userRol = claims?.rol || data.usuario?.rol || 'PACIENTE'

      const perfil = await sincronizar()
      return perfil || { rol: userRol }
    } finally {
      setCargando(false)
    }
  }, [sincronizar])

  const loginInvitado = useCallback(async (nombre = '') => {
    setCargando(true)
    try {
      cerrarSesion()
      const data = await loginComoInvitado(nombre)
      setEsInvitado(true)
      setRol('INVITADO')
      setUsuario({
        id: null,
        nombre: nombre || 'Invitado',
        email: null,
        rol: 'INVITADO',
      })
      return data
    } finally {
      setCargando(false)
    }
  }, [])

  const logout = useCallback(() => {
    cerrarSesion()
    setUsuario(null)
    setRol(null)
    setEsInvitado(false)
  }, [])

  const estaAutenticado = !!(usuario || esInvitado || rol)

  const value = {
    usuario,
    rol,
    centroId: usuario?.centro_id || null,
    medicoId: usuario?.medico_id || null,
    esInvitado,
    estaAutenticado,
    cargando,
    loginGoogle,
    loginInvitado,
    logout,
    sincronizar,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider')
  }
  return context
}
