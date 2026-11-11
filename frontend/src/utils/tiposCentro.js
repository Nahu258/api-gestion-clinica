/**
 * utils/tiposCentro.js - Nombre, ícono y color de cada tipo de centro.
 *
 * El color sólo se usa para distinguir categorías en el mapa (pin e ícono
 * de la tarjeta); el resto de la interfaz mantiene el acento único.
 */

import { Ambulance, Buildings, FireTruck, FirstAidKit, Hospital, MapPin, ShieldStar } from '@phosphor-icons/react'

export const TIPOS_CENTRO = {
  hospital: { corto: 'Hospitales', label: 'Hospital', Icon: Hospital, color: '#c42f3a' },
  clinica: { corto: 'Clínicas', label: 'Clínica o sanatorio', Icon: Buildings, color: '#8a3f66' },
  upa: { corto: 'CAPS y UPA', label: 'Atención primaria', Icon: FirstAidKit, color: '#1d7349' },
  same: { corto: 'SAME 107', label: 'Base del SAME', Icon: Ambulance, color: '#1f5f99' },
  bomberos: { corto: 'Bomberos', label: 'Bomberos', Icon: FireTruck, color: '#b3530b' },
  policia: { corto: 'Policía', label: 'Policía', Icon: ShieldStar, color: '#2a3140' },
}

const GENERICO = { corto: 'Centros', label: 'Centro', Icon: MapPin, color: '#c42f3a' }

export function tipoCentro(tipo) {
  return TIPOS_CENTRO[tipo] || GENERICO
}

/** Minutos estimados en auto dentro de la ciudad (aprox. 27 km/h de promedio). */
export function minutosEnAuto(distanciaKm) {
  if (distanciaKm == null) return null
  return Math.max(3, Math.round(Number(distanciaKm) * 2.2))
}

export function textoDistancia(distanciaKm) {
  if (distanciaKm == null) return ''
  const km = Number(distanciaKm)
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`
}
