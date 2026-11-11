/**
 * SeguimientoSolicitud.jsx - Seguimiento en vivo de un aviso de guardia.
 *
 * - Consulta el estado cada 10 segundos y se detiene cuando la atención
 *   terminó o se canceló.
 * - Recorrido en 4 pasos; cubre todos los estados del backend, incluidos
 *   "en camino" y "derivado a especialista".
 * - Cuando el centro responde por primera vez suena un aviso corto y vibra.
 * - Al finalizar muestra el diagnóstico y permite imprimir la constancia.
 * - Sin red se muestra el último estado conocido y se avisa.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  CheckCircle,
  ClipboardText,
  HourglassMedium,
  Hospital,
  Lightning,
  MagnifyingGlass,
  MapPin,
  MapTrifold,
  PaperPlaneTilt,
  Phone,
  Printer,
  Stethoscope,
  UserCirclePlus,
  XCircle,
} from '@phosphor-icons/react'

import Navbar from '../components/Navbar.jsx'
import HojaAtencion from '../components/HojaAtencion.jsx'
import { cancelarSolicitud, obtenerSolicitud, obtenerSolicitudActivaId } from '../api/atencion.js'
import { ESTADO, hora } from '../utils/solicitudes.js'

const INTERVALO_MS = 10000

const PASOS = [
  { label: 'Aviso enviado', Icon: PaperPlaneTilt },
  { label: 'Guardia alertada', Icon: Hospital },
  { label: 'Con el médico', Icon: Stethoscope },
  { label: 'Atención completada', Icon: CheckCircle },
]

/** Qué se le dice al paciente en cada estado y en qué paso del recorrido está. */
const VISTAS = {
  [ESTADO.PENDIENTE]: {
    paso: 0,
    Icon: HourglassMedium,
    etiqueta: 'Esperando respuesta',
    titulo: 'Aviso enviado al centro de salud',
    texto: 'El centro recibió tu aviso. Si vas manejando, hacelo con precaución. Al llegar, acercate a la mesa de triage y decí tu nombre.',
  },
  [ESTADO.ACEPTADO]: {
    paso: 1,
    Icon: CheckCircle,
    etiqueta: 'Guardia confirmada',
    titulo: 'El centro confirmó tu llegada',
    texto: 'El equipo de triage ya sabe que vas. Tené a mano tu DNI y la credencial de la obra social si tenés. Entrá por el acceso de guardia.',
    tono: 'ok',
  },
  [ESTADO.EN_CAMINO]: {
    paso: 1,
    Icon: CheckCircle,
    etiqueta: 'Te están esperando',
    titulo: 'La guardia te espera',
    texto: 'El centro registró que estás en camino. Al llegar, presentate en la mesa de triage con tu DNI.',
    tono: 'ok',
  },
  [ESTADO.DERIVADO]: {
    paso: 2,
    Icon: Stethoscope,
    etiqueta: 'Derivado a especialista',
    titulo: 'Ya tenés médico asignado',
    texto: 'El triage te derivó a un especialista. Quedate en la sala de espera: te van a llamar por tu nombre.',
    tono: 'ok',
  },
  [ESTADO.EN_ATENCION]: {
    paso: 2,
    Icon: Stethoscope,
    etiqueta: 'En atención',
    titulo: 'Atención médica en curso',
    texto: 'Un médico está atendiendo tu caso. Seguí las indicaciones del equipo.',
    tono: 'ok',
  },
  [ESTADO.ATENDIDO]: {
    paso: 3,
    Icon: CheckCircle,
    etiqueta: 'Atención finalizada',
    titulo: 'Atención médica completada',
    texto: 'La consulta terminó. Abajo tenés el diagnóstico y las indicaciones del médico.',
    tono: 'ok',
  },
  [ESTADO.CANCELADO]: {
    paso: -1,
    Icon: XCircle,
    etiqueta: 'Aviso cancelado',
    titulo: 'Solicitud cancelada',
    texto: 'El aviso se canceló y el centro ya no te espera. Si todavía necesitás atención, buscá otro centro en el mapa o llamá al 107.',
    tono: 'idle',
  },
}

function sonarConfirmacion() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const ahora = ctx.currentTime
    const ganancia = ctx.createGain()
    ganancia.gain.setValueAtTime(0.22, ahora)
    ganancia.gain.exponentialRampToValueAtTime(0.01, ahora + 0.45)
    ganancia.connect(ctx.destination)
    ;[[523.25, 783.99, 0], [659.25, 1046.5, 0.05]].forEach(([desde, hasta, demora]) => {
      const osc = ctx.createOscillator()
      osc.frequency.setValueAtTime(desde, ahora + demora)
      osc.frequency.exponentialRampToValueAtTime(hasta, ahora + demora + 0.15)
      osc.connect(ganancia)
      osc.start(ahora + demora)
      osc.stop(ahora + 0.45)
    })
    navigator.vibrate?.([100, 50, 150])
  } catch {
    // El navegador puede bloquear audio sin interacción previa: no es un error
  }
}

export default function SeguimientoSolicitud() {
  const { id: paramId } = useParams()
  const location = useLocation()

  const solicitudId = paramId || (location.state?.solicitud?.id ? String(location.state.solicitud.id) : obtenerSolicitudActivaId())

  const [solicitud, setSolicitud] = useState(location.state?.solicitud || null)
  const [cargando, setCargando] = useState(!location.state?.solicitud)
  const [error, setError] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [errorCancelar, setErrorCancelar] = useState(null)

  const estadoPrevio = useRef(solicitud?.estado || null)

  useEffect(() => {
    if (!solicitudId) {
      setError('No hay ningún aviso en curso en este dispositivo.')
      setCargando(false)
      return undefined
    }

    let activo = true
    let intervalo = null

    const consultar = async () => {
      try {
        const data = await obtenerSolicitud(solicitudId)
        if (!activo) return
        setSolicitud(data)
        setError(null)

        if (estadoPrevio.current === ESTADO.PENDIENTE && data.estado !== ESTADO.PENDIENTE && data.estado !== ESTADO.CANCELADO) {
          sonarConfirmacion()
        }
        estadoPrevio.current = data.estado

        if (data.estado === ESTADO.ATENDIDO || data.estado === ESTADO.CANCELADO) clearInterval(intervalo)
      } catch (err) {
        if (!activo) return
        // Con un estado ya en pantalla, un fallo puntual no lo reemplaza
        setSolicitud((actual) => {
          if (!actual) setError(err.message || 'No se pudo consultar el aviso.')
          return actual
        })
      } finally {
        if (activo) setCargando(false)
      }
    }

    consultar()
    intervalo = setInterval(consultar, INTERVALO_MS)

    return () => {
      activo = false
      clearInterval(intervalo)
    }
  }, [solicitudId])

  const cancelar = async () => {
    setCancelando(true)
    setErrorCancelar(null)
    try {
      const data = await cancelarSolicitud(solicitudId)
      setSolicitud(data)
      estadoPrevio.current = data.estado
      setConfirmando(false)
    } catch (err) {
      setErrorCancelar(err.message || 'No se pudo cancelar el aviso.')
    } finally {
      setCancelando(false)
    }
  }

  if (cargando) {
    return (
      <div className="ui-shell">
        <Navbar />
        <main className="ui-page ui-page--narrow" aria-busy="true">
          <div className="ui-skeleton" style={{ height: 14, width: 120, marginBottom: 24 }} />
          <div className="ui-skeleton" style={{ height: 150, marginBottom: 16 }} />
          <div className="ui-skeleton" style={{ height: 96, marginBottom: 16 }} />
          <div className="ui-skeleton" style={{ height: 120 }} />
        </main>
      </div>
    )
  }

  if (error || !solicitud) {
    return (
      <div className="ui-shell">
        <Navbar />
        <main className="ui-page ui-page--narrow">
          <div className="ui-card">
            <div className="ui-empty">
              <div className="ui-empty__icon"><MagnifyingGlass size={22} /></div>
              <h1 className="ui-empty__title">Sin aviso activo</h1>
              <p className="ui-empty__text">{error || 'No tenés ningún aviso de guardia en curso.'}</p>
              <Link to="/mapa" className="ui-btn ui-btn--primary" style={{ marginTop: 16 }}>Buscar guardia</Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const vista = VISTAS[solicitud.estado] || VISTAS[ESTADO.PENDIENTE]
  const esAtendido = solicitud.estado === ESTADO.ATENDIDO
  const esCancelado = solicitud.estado === ESTADO.CANCELADO
  const enCurso = !esAtendido && !esCancelado
  const puedeCancelar = [ESTADO.PENDIENTE, ESTADO.ACEPTADO, ESTADO.EN_CAMINO].includes(solicitud.estado) && !solicitud.esOffline
  const sinConexion = solicitud.esOffline || solicitud._sinConexion

  return (
    <div className="ui-shell">
      <Navbar />

      <main className="ui-page ui-page--narrow sg">
        <Link to="/mapa" className="ui-backlink no-print">
          <ArrowLeft size={16} aria-hidden="true" />
          Volver al mapa
        </Link>

        {sinConexion && (
          <div className="ui-alert sg__offline no-print" role="status">
            <Lightning size={18} weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {solicitud.esOffline
                ? 'No hay conexión: el aviso quedó guardado en este dispositivo y el centro todavía no lo recibió. Llamá al centro o al 107.'
                : 'Sin conexión: se muestra el último estado conocido. Se actualiza solo cuando vuelva la red.'}
            </span>
          </div>
        )}

        <section className={`ui-card sg__estado sg__estado--${vista.tono || 'alert'} no-print`}>
          <span className="sg__icono" aria-hidden="true">
            <vista.Icon size={30} weight={vista.tono === 'ok' ? 'fill' : 'regular'} />
          </span>
          <div className="ui-grow">
            <p className="sg__etiqueta">{vista.etiqueta}</p>
            <h1 className="sg__titulo">{vista.titulo}</h1>
            <p className="sg__centro">{solicitud.centro_nombre || 'Centro de salud'}</p>
            <p className="sg__meta">
              Aviso N.º <span className="ui-mono">{solicitud.id}</span>
              {solicitud.creado_en && <>, enviado a las <span className="ui-mono">{hora(solicitud.creado_en)}</span></>}
            </p>
          </div>
        </section>

        {!esCancelado && (
          <ol className="sg__pasos clinical-stepper no-print" aria-label="Progreso de atención de emergencia">
            {PASOS.map((paso, i) => {
              // Atendido es el final del recorrido: los 4 pasos quedan completos
              const completado = esAtendido || vista.paso > i
              const activo = !esAtendido && vista.paso === i
              return (
                <li
                  key={paso.label}
                  className={`sg__paso stepper-node${completado ? ' stepper-node--completed' : ''}${activo ? ' stepper-node--active' : ''}`}
                  aria-current={activo ? 'step' : undefined}
                >
                  <span className="sg__burbuja">
                    {completado ? <Check size={16} weight="bold" /> : <paso.Icon size={18} />}
                  </span>
                  <span className="sg__paso-texto">{paso.label}</span>
                </li>
              )
            })}
          </ol>
        )}

        <section className="ui-card sg__guia no-print">
          <h2 className="ui-h2">
            <ClipboardText size={18} aria-hidden="true" />
            {esAtendido || esCancelado ? 'Resumen' : 'Qué hacer ahora'}
          </h2>
          <p>{vista.texto}</p>

          {(solicitud.medico_nombre || solicitud.centro_direccion) && (
            <dl className="sg__kv">
              {solicitud.medico_nombre && (
                <div>
                  <dt>Te atiende</dt>
                  <dd>
                    {solicitud.medico_nombre}
                    {solicitud.especialidad_nombre ? `, ${solicitud.especialidad_nombre}` : ''}
                  </dd>
                </div>
              )}
              {solicitud.centro_direccion && (
                <div>
                  <dt>Dirección</dt>
                  <dd>
                    <MapPin size={14} aria-hidden="true" /> {solicitud.centro_direccion}
                  </dd>
                </div>
              )}
            </dl>
          )}

          {enCurso && !sinConexion && (
            <p className="sg__vivo">
              <span className="ui-dot ui-dot--ok sg__latido" aria-hidden="true" />
              El estado se actualiza solo cada 10 segundos
            </p>
          )}
        </section>

        {esAtendido && (
          <section className="ui-card sg__hoja">
            <HojaAtencion atencion={solicitud} />
          </section>
        )}

        {!solicitud.usuario_id && !solicitud.esOffline && (
          <section className="ui-card sg__cuenta no-print">
            <UserCirclePlus size={26} aria-hidden="true" />
            <div className="ui-grow">
              <h2 className="ui-h2">Guardá esta atención en tu historial</h2>
              <p>Ingresá con tu cuenta y queda registrada con el diagnóstico y las indicaciones.</p>
            </div>
            <Link to="/ingreso" className="ui-btn">Ingresar con mi cuenta</Link>
          </section>
        )}

        <div className="sg__acciones no-print">
          {esAtendido && (
            <button type="button" className="ui-btn ui-btn--dark ui-btn--lg" onClick={() => window.print()}>
              <Printer size={18} aria-hidden="true" />
              Imprimir constancia
            </button>
          )}
          {solicitud.centro_telefono && !esAtendido && (
            <a href={`tel:${solicitud.centro_telefono}`} className="ui-btn ui-btn--lg">
              <Phone size={18} aria-hidden="true" />
              Llamar al centro
            </a>
          )}
          <Link to="/mapa" className="ui-btn ui-btn--lg">
            <MapTrifold size={18} aria-hidden="true" />
            Ver otros centros
          </Link>
        </div>

        {puedeCancelar && (
          <p className="sg__cancelar no-print">
            <button type="button" className="ui-linkbtn ui-linkbtn--danger" onClick={() => setConfirmando(true)}>
              Cancelar el aviso
            </button>
          </p>
        )}
      </main>

      {confirmando && (
        <div className="ui-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !cancelando && setConfirmando(false)}>
          <div className="ui-dialog ui-dialog--sm" role="alertdialog" aria-modal="true" aria-labelledby="cancelar-titulo">
            <div className="ui-dialog__head">
              <h2 id="cancelar-titulo" className="ui-dialog__title">¿Cancelar el aviso?</h2>
            </div>
            <div className="ui-dialog__body">
              <p className="ui-confirm__text">El centro deja de esperarte. Si después necesitás atención, vas a tener que avisar de nuevo.</p>
              {errorCancelar && (
                <div className="ui-alert" role="alert" style={{ margin: '12px 0 0' }}>
                  <span>{errorCancelar}</span>
                </div>
              )}
              <div className="ui-dialog__foot" style={{ marginTop: 20 }}>
                <button type="button" className="ui-btn ui-btn--quiet" onClick={() => setConfirmando(false)} disabled={cancelando}>
                  Mantener el aviso
                </button>
                <button type="button" className="ui-btn ui-btn--primary" onClick={cancelar} disabled={cancelando}>
                  {cancelando && <span className="ui-spinner" aria-hidden="true" />}
                  Sí, cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
