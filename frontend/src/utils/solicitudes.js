/**
 * utils/solicitudes.js - Estados, prioridades y fechas de una solicitud de atención.
 *
 * Una sola fuente para el seguimiento del paciente, su historial, la bandeja
 * del centro y el tablero.
 */

export const ESTADO = {
  PENDIENTE: 'pendiente',
  ACEPTADO: 'aceptado',
  EN_CAMINO: 'en_camino',
  DERIVADO: 'derivado',
  EN_ATENCION: 'en_atencion',
  ATENDIDO: 'atendido',
  CANCELADO: 'cancelado',
}

export const EN_ESPERA = [ESTADO.PENDIENTE, ESTADO.ACEPTADO, ESTADO.EN_CAMINO]
export const EN_CURSO = [ESTADO.DERIVADO, ESTADO.EN_ATENCION]
export const CERRADAS = [ESTADO.ATENDIDO, ESTADO.CANCELADO]

/** Texto corto y color del chip de cada estado. */
export const ESTADOS = {
  pendiente: { label: 'Pendiente', chip: 'ui-chip--alert' },
  aceptado: { label: 'Aceptado', chip: 'ui-chip--warn' },
  en_camino: { label: 'En camino', chip: 'ui-chip--warn' },
  derivado: { label: 'Derivado', chip: 'ui-chip--ink' },
  en_atencion: { label: 'En consulta', chip: 'ui-chip--info' },
  atendido: { label: 'Atendido', chip: 'ui-chip--ok' },
  cancelado: { label: 'Cancelado', chip: '' },
}

export function estadoDe(clave) {
  return ESTADOS[clave] || { label: clave || 'Sin estado', chip: '' }
}

export const ORDEN_PRIORIDAD = { urgente: 0, alta: 1, media: 2, baja: 3 }

export const PRIORIDADES = [
  { id: 'baja', label: 'Baja' },
  { id: 'media', label: 'Media' },
  { id: 'alta', label: 'Alta' },
  { id: 'urgente', label: 'Urgente' },
]

export function etiquetaPrioridad(id) {
  return PRIORIDADES.find((p) => p.id === id)?.label || 'Sin prioridad'
}

export function nombrePaciente(s) {
  return s?.paciente_nombre || s?.nombre_invitado || 'Paciente sin nombre'
}

// ── Fechas ──────────────────────────────────────────────────────────────────

export function esHoy(fecha) {
  return Boolean(fecha) && new Date(fecha).toDateString() === new Date().toDateString()
}

export function hora(fecha) {
  if (!fecha) return ''
  return new Date(fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function fechaCorta(fecha) {
  if (!fecha) return ''
  return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fechaLarga(fecha) {
  if (!fecha) return ''
  return new Date(fecha).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function fechaHora(fecha) {
  if (!fecha) return ''
  return `${fechaCorta(fecha)} ${hora(fecha)}`
}

export function haceCuanto(fecha) {
  if (!fecha) return ''
  const min = Math.max(0, Math.floor((Date.now() - new Date(fecha)) / 60000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h ${min % 60} min`
  return new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

/** Minutos entre dos fechas, o null si falta alguna o el orden es inválido. */
export function minutosEntre(desde, hasta) {
  if (!desde || !hasta) return null
  const min = (new Date(hasta) - new Date(desde)) / 60000
  return Number.isFinite(min) && min >= 0 ? min : null
}

/** "42 min" o "1 h 20 min"; raya si no hay dato. */
export function duracion(min) {
  if (min == null || !Number.isFinite(min)) return '-'
  if (min < 1) return '<1 min'
  const total = Math.round(min)
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  if (h < 24) return `${h} h ${String(total % 60).padStart(2, '0')} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

export function mediana(valores) {
  const orden = valores.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b)
  if (!orden.length) return null
  const medio = Math.floor(orden.length / 2)
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2
}
