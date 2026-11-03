/**
 * api/centros.js - Capa de comunicación con la API de centros de emergencia.
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

// Centros reales de Posadas y Garupá (OpenStreetMap). Espejo de seed_centros.py
export const CENTROS_DEFAULT_POSADAS = [
  {
    id: 1,
    nombre: 'Hospital Escuela de Agudos Dr. Ramón Madariaga',
    tipo: 'hospital',
    tipo_legible: 'Hospital público',
    direccion: 'Av. Cabred 1120, Parque de la Salud, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3844846,
    longitud: -55.8895025,
    telefono: '(0376) 444-3700',
    atiende_24h: true,
  },
  {
    id: 2,
    nombre: 'Hospital de Pediatría Dr. Fernando Barreyro',
    tipo: 'hospital',
    tipo_legible: 'Hospital público',
    direccion: 'Av. Mariano Moreno 110, Parque de la Salud, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3826578,
    longitud: -55.890341,
    telefono: '(0376) 444-7100',
    atiende_24h: true,
  },
  {
    id: 3,
    nombre: 'Hospital Materno Neonatal',
    tipo: 'hospital',
    tipo_legible: 'Hospital público',
    direccion: 'Av. Marconi 3464, Parque de la Salud, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3834756,
    longitud: -55.8890514,
    telefono: '(0376) 444-7842',
    atiende_24h: true,
  },
  {
    id: 4,
    nombre: 'Hospital Dr. René Favaloro',
    tipo: 'hospital',
    tipo_legible: 'Hospital público',
    direccion: 'Av. Tambor de Tacuarí 7300, Villa Cabello, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3651329,
    longitud: -55.9494256,
    telefono: '(0376) 444-5500',
    atiende_24h: true,
  },
  {
    id: 5,
    nombre: 'Hospital Dr. Pedro Baliña',
    tipo: 'hospital',
    tipo_legible: 'Hospital público',
    direccion: 'Av. Quaranta 7300, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3986643,
    longitud: -55.9517642,
    telefono: '(0376) 445-8248',
    atiende_24h: true,
  },
  {
    id: 6,
    nombre: 'Hospital Dr. Ramón Carrillo (Salud Mental)',
    tipo: 'hospital',
    tipo_legible: 'Hospital público',
    direccion: 'Av. Quaranta 7350, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3981824,
    longitud: -55.9522089,
    telefono: '(0376) 445-8263',
    atiende_24h: false,
  },
  {
    id: 7,
    nombre: 'Hospital Virgen de Fátima',
    tipo: 'hospital',
    tipo_legible: 'Hospital público',
    direccion: 'Av. Jorge Kemerer 1576, Garupá',
    ciudad: 'Garupá',
    latitud: -27.4364015,
    longitud: -55.8695798,
    telefono: '(0376) 440-9118',
    atiende_24h: true,
  },
  {
    id: 8,
    nombre: 'Hospital de Itaembé Guazú',
    tipo: 'hospital',
    tipo_legible: 'Hospital público',
    direccion: 'Las Orquídeas 6450, Itaembé Guazú, Posadas',
    ciudad: 'Posadas',
    latitud: -27.4100103,
    longitud: -55.9839982,
    telefono: '',
    atiende_24h: true,
  },
  {
    id: 9,
    nombre: 'Sanatorio Boratti',
    tipo: 'clinica',
    tipo_legible: 'Clínica / Sanatorio privado',
    direccion: 'Av. Mitre 2330, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3735314,
    longitud: -55.9001254,
    telefono: '(0376) 444-0140',
    atiende_24h: true,
  },
  {
    id: 10,
    nombre: 'Sanatorio Nosiglia',
    tipo: 'clinica',
    tipo_legible: 'Clínica / Sanatorio privado',
    direccion: 'Córdoba 1401, Posadas',
    ciudad: 'Posadas',
    latitud: -27.368483,
    longitud: -55.8896884,
    telefono: '(0376) 444-0100',
    atiende_24h: true,
  },
  {
    id: 11,
    nombre: 'Sanatorio Posadas',
    tipo: 'clinica',
    tipo_legible: 'Clínica / Sanatorio privado',
    direccion: 'Junín 1840, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3669731,
    longitud: -55.8979311,
    telefono: '(0376) 442-5092',
    atiende_24h: true,
  },
  {
    id: 12,
    nombre: 'Sanatorio Integral IOT',
    tipo: 'clinica',
    tipo_legible: 'Clínica / Sanatorio privado',
    direccion: 'Bolívar 2376, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3662625,
    longitud: -55.8995909,
    telefono: '(0376) 444-0540',
    atiende_24h: true,
  },
  {
    id: 13,
    nombre: 'CAPS 32 Itaembé Miní',
    tipo: 'upa',
    tipo_legible: 'UPA / Sala de primeros auxilios',
    direccion: 'Av. Isaco Abitbol 8300, Itaembé Miní, Posadas',
    ciudad: 'Posadas',
    latitud: -27.4141059,
    longitud: -55.9561833,
    telefono: '',
    atiende_24h: false,
  },
  {
    id: 14,
    nombre: 'CAPS 5 Yacyretá',
    tipo: 'upa',
    tipo_legible: 'UPA / Sala de primeros auxilios',
    direccion: 'Av. Blas Parera 4977, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3749503,
    longitud: -55.9262218,
    telefono: '',
    atiende_24h: false,
  },
  {
    id: 15,
    nombre: 'CAPS 8 Rocamora',
    tipo: 'upa',
    tipo_legible: 'UPA / Sala de primeros auxilios',
    direccion: 'Av. Blas Parera 3673, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3762281,
    longitud: -55.9134241,
    telefono: '',
    atiende_24h: false,
  },
  {
    id: 16,
    nombre: 'CAPS 4 La Picada',
    tipo: 'upa',
    tipo_legible: 'UPA / Sala de primeros auxilios',
    direccion: 'Av. Tambor de Tacuarí 3504, Posadas',
    ciudad: 'Posadas',
    latitud: -27.369394,
    longitud: -55.9111062,
    telefono: '',
    atiende_24h: false,
  },
  {
    id: 17,
    nombre: 'CAPS 20 Ñu Porá',
    tipo: 'upa',
    tipo_legible: 'UPA / Sala de primeros auxilios',
    direccion: 'Av. Alberto Roth 701, Garupá',
    ciudad: 'Garupá',
    latitud: -27.4474157,
    longitud: -55.8599393,
    telefono: '(0376) 448-8437',
    atiende_24h: false,
  },
  {
    id: 18,
    nombre: 'SAME 107 - Unidad Central de Emergencias y Traslados',
    tipo: 'same',
    tipo_legible: 'SAME / Ambulancia',
    direccion: 'Av. Quaranta s/n, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3985589,
    longitud: -55.9529532,
    telefono: '107',
    atiende_24h: true,
  },
  {
    id: 19,
    nombre: 'División de Bomberos Zona Centro',
    tipo: 'bomberos',
    tipo_legible: 'Bomberos',
    direccion: 'Av. Mitre 1560, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3746668,
    longitud: -55.8919391,
    telefono: '(0376) 444-7666',
    atiende_24h: true,
  },
  {
    id: 20,
    nombre: 'División de Bomberos Zona Sur',
    tipo: 'bomberos',
    tipo_legible: 'Bomberos',
    direccion: 'Av. Martín Fierro 2608, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3835305,
    longitud: -55.9046879,
    telefono: '100',
    atiende_24h: true,
  },
  {
    id: 21,
    nombre: 'División de Bomberos Zona Oeste',
    tipo: 'bomberos',
    tipo_legible: 'Bomberos',
    direccion: 'Fermín Fierro s/n, Villa Cabello, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3657538,
    longitud: -55.94928,
    telefono: '100',
    atiende_24h: true,
  },
  {
    id: 22,
    nombre: 'Bomberos Voluntarios Itaembé Miní',
    tipo: 'bomberos',
    tipo_legible: 'Bomberos',
    direccion: 'Av. Ozuna 8850, Itaembé Miní, Posadas',
    ciudad: 'Posadas',
    latitud: -27.4183194,
    longitud: -55.9489932,
    telefono: '(0376) 459-5199',
    atiende_24h: true,
  },
  {
    id: 23,
    nombre: 'División de Bomberos de Garupá',
    tipo: 'bomberos',
    tipo_legible: 'Bomberos',
    direccion: 'Colectora Leonardo Favio 2850, Garupá',
    ciudad: 'Garupá',
    latitud: -27.4587838,
    longitud: -55.8499153,
    telefono: '(0376) 449-1400',
    atiende_24h: true,
  },
  {
    id: 24,
    nombre: 'Jefatura de Policía de Misiones',
    tipo: 'policia',
    tipo_legible: 'Policía',
    direccion: 'Félix de Azara 2417, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3732865,
    longitud: -55.8942885,
    telefono: '(0376) 444-7645',
    atiende_24h: true,
  },
  {
    id: 25,
    nombre: 'Comisaría Seccional Primera',
    tipo: 'policia',
    tipo_legible: 'Policía',
    direccion: 'Alberdi 998, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3589038,
    longitud: -55.8937894,
    telefono: '(0376) 444-6540',
    atiende_24h: true,
  },
  {
    id: 26,
    nombre: 'Comisaría Seccional Tercera',
    tipo: 'policia',
    tipo_legible: 'Policía',
    direccion: 'Av. Uruguay 3534, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3822228,
    longitud: -55.899858,
    telefono: '(0376) 444-7655',
    atiende_24h: true,
  },
  {
    id: 27,
    nombre: 'Comisaría Seccional Séptima - Villa Cabello',
    tipo: 'policia',
    tipo_legible: 'Policía',
    direccion: 'Av. Tambor de Tacuarí 7599, Villa Cabello, Posadas',
    ciudad: 'Posadas',
    latitud: -27.3654771,
    longitud: -55.9492471,
    telefono: '(0376) 446-8004',
    atiende_24h: true,
  },
  {
    id: 28,
    nombre: 'Comisaría Seccional Novena - Itaembé Miní',
    tipo: 'policia',
    tipo_legible: 'Policía',
    direccion: 'Av. Isaco Abitbol s/n, Itaembé Miní, Posadas',
    ciudad: 'Posadas',
    latitud: -27.4114371,
    longitud: -55.9553222,
    telefono: '101',
    atiende_24h: true,
  },
]

// Fórmula de Haversine para cálculo de distancia en km en cliente
function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371 // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}

/**
 * Obtiene centros de emergencia cercanos a las coordenadas indicadas.
 * Si falla la red (offline), recupera de cache o recurre al catálogo offline garantizado.
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
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Error ${res.status} al consultar centros cercanos.`)
    }

    const data = await res.json()
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          lat,
          lon,
          radio_km,
          tipo,
          data,
        })
      )
    } catch {
      // Ignorar errores de quota
    }

    return { ...data, esOffline: false }
  } catch (error) {
    // 1. Intentar leer cache local previo
    const cached = obtenerCacheCentros()
    if (cached && cached.data && Array.isArray(cached.data.resultados) && cached.data.resultados.length > 0) {
      return {
        ...cached.data,
        esOffline: true,
      }
    }

    // 2. Fallback resiliente con datos garantizados de Posadas
    let filtrados = CENTROS_DEFAULT_POSADAS
    if (tipo) {
      filtrados = filtrados.filter((c) => c.tipo === tipo)
    }

    const conDistancia = filtrados
      .map((c) => {
        const d = calcularDistanciaKm(Number(lat), Number(lon), c.latitud, c.longitud)
        return { ...c, distancia_km: d }
      })
      .filter((c) => c.distancia_km <= Number(radio_km))
      .sort((a, b) => a.distancia_km - b.distancia_km)

    return {
      cantidad: conDistancia.length,
      resultados: conDistancia,
      esOffline: true,
    }
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
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
    })

    if (res.ok) {
      return await res.json()
    }
  } catch {
    // Si no hay red, buscar en cache o fallback
  }

  const cached = obtenerCacheCentros()
  if (cached?.data?.resultados) {
    const encontrado = cached.data.resultados.find((c) => String(c.id) === String(id))
    if (encontrado) return encontrado
  }

  const fallback = CENTROS_DEFAULT_POSADAS.find((c) => String(c.id) === String(id))
  if (fallback) return fallback

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
