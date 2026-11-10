/**
 * Prueba de carga de EmergenciaYA (AE4) con k6.
 *
 * Simula la mezcla de tráfico de una guardia real:
 *   70 % — búsqueda de centros cercanos (pantalla del mapa, la más usada)
 *   20 % — invitado que avisa "voy en camino" y consulta su seguimiento
 *   10 % — paciente que inicia sesión y abre su historial clínico
 *
 * Correr (con el stack levantado por docker compose):
 *   docker run --rm -v "${PWD}/carga:/carga" -e BASE_URL=http://host.docker.internal:8000 \
 *     grafana/k6:0.54.0 run /carga/k6-emergenciaya.js
 *
 * Perfiles (variable PERFIL):
 *   ci        10 usuarios virtuales durante 30 s (corre en el pipeline)
 *   completo  rampa 0 → 50 usuarios en 3 min (la que se reporta en el README)
 *
 * El resumen (media, p90, p95, máximo por endpoint) queda en
 * carga/resultados/<perfil>.json.
 */
import http from 'k6/http'
import { check, group, sleep } from 'k6'

const BASE = (__ENV.BASE_URL || 'http://localhost:8000') + '/api/v1'
const PERFIL = __ENV.PERFIL || 'completo'
// Los avisos de carga van a un centro que no es el de la demo (Sanatorio Boratti).
const CENTRO_CARGA_NOMBRE = __ENV.CENTRO_NOMBRE || 'Sanatorio Posadas'

const PERFILES = {
  ci: { executor: 'constant-vus', vus: 10, duration: '30s' },
  completo: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 20 },
      { duration: '1m', target: 50 },
      { duration: '1m', target: 50 },
      { duration: '30s', target: 0 },
    ],
  },
}

export const options = {
  scenarios: { guardia: PERFILES[PERFIL] },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max'],
  thresholds: {
    // Criterio de aceptación: menos de 1 % de errores y p95 global < 1,5 s.
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
    // Sub-métricas por endpoint: aparecen desglosadas en el resumen.
    'http_req_duration{endpoint:cercanos}': ['p(95)<800'],
    'http_req_duration{endpoint:crear_solicitud}': ['p(95)<1500'],
    'http_req_duration{endpoint:seguimiento}': ['p(95)<800'],
    'http_req_duration{endpoint:login}': ['p(95)<2500'],
    'http_req_duration{endpoint:historial}': ['p(95)<800'],
  },
}

const PACIENTES = [
  'camila.benitez@gmail.com',
  'jorge.szymanski@gmail.com',
  'rocio.alegre@gmail.com',
  'hector.duarte@gmail.com',
  'valentina.mereles@gmail.com',
]
const JSON_HEADERS = { 'Content-Type': 'application/json' }

function alrededorDePosadas() {
  return {
    lat: (-27.3671 + (Math.random() - 0.5) * 0.08).toFixed(5),
    lon: (-55.8961 + (Math.random() - 0.5) * 0.08).toFixed(5),
  }
}

function buscarCercanos() {
  const { lat, lon } = alrededorDePosadas()
  const r = http.get(`${BASE}/centros/cercanos/?lat=${lat}&lon=${lon}&radio_km=10`, {
    tags: { endpoint: 'cercanos' },
  })
  check(r, { 'cercanos 200': (res) => res.status === 200 })
}

export function setup() {
  // Los ids dependen del orden del seed: se busca el centro por nombre.
  const r = http.get(`${BASE}/centros/cercanos/?lat=-27.3671&lon=-55.8961&radio_km=50`)
  const centros = r.json('resultados') || []
  const centro = centros.find((c) => c.nombre === CENTRO_CARGA_NOMBRE) || centros[0]
  if (!centro) throw new Error('No hay centros activos: ¿corrió seed_demo?')
  return { centroId: centro.id }
}

function avisoDeInvitado(centroId) {
  const r = http.post(
    `${BASE}/atencion/solicitudes/`,
    JSON.stringify({
      centro_id: centroId,
      modo: 'aviso',
      motivo: '[carga k6] dolor abdominal',
      nombre_invitado: `Carga ${__VU}-${__ITER}`,
    }),
    { headers: JSON_HEADERS, tags: { endpoint: 'crear_solicitud' } },
  )
  if (!check(r, { 'aviso 201': (res) => res.status === 201 })) return
  const { id, codigo_seguimiento } = r.json()
  sleep(0.5)
  const seg = http.get(`${BASE}/atencion/solicitudes/${id}/`, {
    headers: { 'X-Codigo-Seguimiento': codigo_seguimiento },
    tags: { endpoint: 'seguimiento' },
  })
  check(seg, { 'seguimiento 200': (res) => res.status === 200 })
}

function pacienteVeHistorial() {
  const email = PACIENTES[Math.floor(Math.random() * PACIENTES.length)]
  const login = http.post(`${BASE}/auth/login/`, JSON.stringify({ email, password: 'Paciente2026!' }), {
    headers: JSON_HEADERS,
    tags: { endpoint: 'login' },
  })
  if (!check(login, { 'login 200': (res) => res.status === 200 })) return
  const r = http.get(`${BASE}/pacientes/mi-historial/`, {
    headers: { Authorization: `Bearer ${login.json('access_token')}` },
    tags: { endpoint: 'historial' },
  })
  check(r, { 'historial 200': (res) => res.status === 200 })
}

export default function (datos) {
  const dado = Math.random()
  if (dado < 0.7) group('mapa', buscarCercanos)
  else if (dado < 0.9) group('aviso invitado', () => avisoDeInvitado(datos.centroId))
  else group('historial paciente', pacienteVeHistorial)
  sleep(1 + Math.random()) // tiempo de lectura del usuario
}

export function handleSummary(data) {
  const fila = (nombre, m) =>
    m
      ? `${nombre.padEnd(18)} media ${m.values.avg.toFixed(0).padStart(5)} ms   ` +
        `p95 ${m.values['p(95)'].toFixed(0).padStart(5)} ms   máx ${m.values.max.toFixed(0).padStart(5)} ms`
      : `${nombre.padEnd(18)} (sin datos)`
  const endpoints = ['cercanos', 'crear_solicitud', 'seguimiento', 'login', 'historial']
  const lineas = [
    `\nEmergenciaYA — prueba de carga (perfil ${PERFIL})`,
    `Peticiones: ${data.metrics.http_reqs.values.count}  ` +
      `(${data.metrics.http_reqs.values.rate.toFixed(1)} req/s)  ` +
      `errores: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)} %`,
    fila('GLOBAL', data.metrics.http_req_duration),
    ...endpoints.map((e) => fila(e, data.metrics[`http_req_duration{endpoint:${e}}`])),
    '',
  ]
  return {
    stdout: lineas.join('\n'),
    [`/carga/resultados/${PERFIL}.json`]: JSON.stringify(data, null, 2),
  }
}
