/**
 * DetalleCentro.jsx - Ficha de un centro y aviso "voy en camino".
 *
 * - Datos del centro: tipo, horario, distancia, tiempo estimado, dirección,
 *   teléfono y especialidades de guardia.
 * - Acción principal visible sin scroll: avisar a la guardia que la persona va.
 * - Acciones de apoyo: llamar al centro y abrir el recorrido en Google Maps.
 * - El aviso se carga en una hoja inferior (mobile) o diálogo (desktop), con
 *   motivos frecuentes de un toque. Quien no tiene cuenta deja su nombre.
 */

import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Car, Clock, MapPin, NavigationArrow, Phone, Siren, WarningCircle, X } from '@phosphor-icons/react'

import Navbar from '../components/Navbar.jsx'
import { obtenerCentroPorId } from '../api/centros.js'
import { crearSolicitud, listarEspecialidadesCentro } from '../api/atencion.js'
import { getAuthHeaders } from '../api/auth.js'
import { minutosEnAuto, textoDistancia, tipoCentro } from '../utils/tiposCentro.js'
import { IconoEspecialidad } from '../utils/iconosEspecialidad.jsx'

const MOTIVOS_FRECUENTES = [
  'Accidente o golpe',
  'Dificultad para respirar',
  'Dolor en el pecho',
  'Fiebre alta',
  'Hemorragia o corte',
  'Desmayo',
]

const MAX_MOTIVO = 200

export default function DetalleCentro() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const ubicacionUsuario = location.state?.ubicacionUsuario || null

  const [centro, setCentro] = useState(location.state?.centro || null)
  const [cargando, setCargando] = useState(!location.state?.centro)
  const [errorCarga, setErrorCarga] = useState(null)
  const [especialidades, setEspecialidades] = useState([])

  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [motivo, setMotivo] = useState('')
  const [errorNombre, setErrorNombre] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState(null)

  // Sin JWT (invitado o sin sesión) la guardia necesita un nombre para identificar a la persona
  const sinCuenta = !getAuthHeaders().Authorization

  useEffect(() => {
    if (centro || !id) return
    setCargando(true)
    obtenerCentroPorId(id)
      .then(setCentro)
      .catch((err) => setErrorCarga(err.message || 'No se pudo cargar la información del centro.'))
      .finally(() => setCargando(false))
  }, [centro, id])

  useEffect(() => {
    let activo = true
    listarEspecialidadesCentro(id)
      .then((lista) => activo && setEspecialidades(Array.isArray(lista) ? lista : []))
      .catch(() => activo && setEspecialidades([]))
    return () => {
      activo = false
    }
  }, [id])

  // Escape cierra el diálogo; el fondo no se desplaza mientras está abierto
  useEffect(() => {
    if (!abierto) return undefined
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const alTeclear = (e) => {
      if (e.key === 'Escape' && !enviando) setAbierto(false)
    }
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.body.style.overflow = previo
      document.removeEventListener('keydown', alTeclear)
    }
  }, [abierto, enviando])

  const abrir = () => {
    setErrorNombre('')
    setErrorEnvio(null)
    setAbierto(true)
  }

  const cerrar = () => {
    if (!enviando) setAbierto(false)
  }

  const alternarMotivo = (texto) => {
    if (motivo.includes(texto)) {
      setMotivo(motivo.split(', ').filter((m) => m !== texto).join(', '))
    } else {
      setMotivo((motivo ? `${motivo}, ${texto}` : texto).slice(0, MAX_MOTIVO))
    }
  }

  const enviar = async (e) => {
    e.preventDefault()
    setErrorEnvio(null)

    if (sinCuenta && !nombre.trim()) {
      setErrorNombre('Escribí tu nombre para que la guardia te identifique al llegar.')
      return
    }
    setErrorNombre('')
    setEnviando(true)

    try {
      const solicitud = await crearSolicitud({
        centro_id: centro.id,
        modo: 'aviso',
        motivo: motivo.trim() || undefined,
        nombre_invitado: sinCuenta ? nombre.trim() : undefined,
        telefono_invitado: telefono.trim() || undefined,
        lat_usuario: ubicacionUsuario?.lat,
        lon_usuario: ubicacionUsuario?.lon,
      })
      setAbierto(false)
      navigate(`/seguimiento/${solicitud.id}`, { state: { solicitud, centro } })
    } catch (err) {
      setErrorEnvio(err.message || 'No se pudo enviar el aviso. Probá de nuevo o llamá al centro.')
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) {
    return (
      <div className="ui-shell">
        <Navbar />
        <main className="ui-page ui-page--narrow" aria-busy="true">
          <div className="ui-skeleton" style={{ height: 14, width: 120, marginBottom: 20 }} />
          <div className="ui-skeleton" style={{ height: 34, width: '70%', marginBottom: 12 }} />
          <div className="ui-skeleton" style={{ height: 16, width: '45%', marginBottom: 28 }} />
          <div className="ui-skeleton" style={{ height: 60, marginBottom: 12 }} />
          <div className="ui-skeleton" style={{ height: 180 }} />
        </main>
      </div>
    )
  }

  if (errorCarga || !centro) {
    return (
      <div className="ui-shell">
        <Navbar />
        <main className="ui-page ui-page--narrow">
          <div className="ui-card">
            <div className="ui-empty">
              <div className="ui-empty__icon ui-empty__icon--alert"><WarningCircle size={22} /></div>
              <p className="ui-empty__title">No encontramos este centro</p>
              <p className="ui-empty__text">{errorCarga || 'Puede que ya no esté en la red de guardias.'}</p>
              <Link to="/mapa" className="ui-btn ui-btn--dark" style={{ marginTop: 16 }}>Volver al mapa</Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const cfg = tipoCentro(centro.tipo)
  const minutos = minutosEnAuto(centro.distancia_km)
  const comoLlegar = `https://www.google.com/maps/dir/?api=1&destination=${centro.latitud},${centro.longitud}`

  return (
    <div className="ui-shell">
      <Navbar />

      <main className="ui-page ui-page--narrow dc">
        <Link to="/mapa" className="ui-backlink">
          <ArrowLeft size={16} aria-hidden="true" />
          Volver al mapa
        </Link>

        <header className="dc__cabecera">
          <span className="dc__icono" style={{ '--c': cfg.color }} aria-hidden="true">
            <cfg.Icon size={26} weight="fill" />
          </span>
          <div className="ui-grow">
            <p className="dc__tipo">{centro.tipo_legible || cfg.label}</p>
            <h1 className="dc__nombre">{centro.nombre}</h1>
          </div>
        </header>

        <ul className="dc__datos">
          <li className={centro.atiende_24h ? 'is-ok' : ''}>
            <Clock size={18} aria-hidden="true" />
            <span>{centro.atiende_24h ? 'Abierto 24 horas' : 'Horario reducido'}</span>
          </li>
          {centro.distancia_km != null && (
            <li>
              <MapPin size={18} aria-hidden="true" />
              <span>A <strong className="ui-mono">{textoDistancia(centro.distancia_km)}</strong></span>
            </li>
          )}
          {minutos != null && (
            <li>
              <Car size={18} aria-hidden="true" />
              <span>Unos <strong className="ui-mono">{minutos} min</strong> en auto</span>
            </li>
          )}
        </ul>

        <section className="dc__acciones" aria-label="Acciones">
          <button id="btn-voy-en-camino" type="button" className="ui-btn ui-btn--primary ui-btn--xl ui-btn--block dc__avisar" onClick={abrir}>
            <Siren size={24} weight="fill" aria-hidden="true" />
            <span className="dc__avisar-texto">
              <strong>Voy en camino</strong>
              <small>La guardia recibe tu aviso antes de que llegues</small>
            </span>
          </button>

          <div className="dc__apoyo">
            {centro.telefono && (
              <a href={`tel:${centro.telefono}`} className="ui-btn ui-btn--lg">
                <Phone size={18} aria-hidden="true" />
                Llamar al centro
              </a>
            )}
            <a href={comoLlegar} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn--lg">
              <NavigationArrow size={18} aria-hidden="true" />
              Cómo llegar
            </a>
          </div>
        </section>

        <section className="ui-card dc__ficha" aria-label="Datos del centro">
          <dl className="dc__kv">
            <div>
              <dt>Dirección</dt>
              <dd>{centro.ciudad && !(centro.direccion || '').includes(centro.ciudad) ? `${centro.direccion}, ${centro.ciudad}` : centro.direccion}</dd>
            </div>
            {centro.telefono && (
              <div>
                <dt>Teléfono de guardia</dt>
                <dd><a href={`tel:${centro.telefono}`} className="ui-link-strong ui-mono">{centro.telefono}</a></dd>
              </div>
            )}
          </dl>

          {especialidades.length > 0 && (
            <div className="dc__especialidades">
              <h2 className="ui-h2">Especialidades de guardia</h2>
              <ul className="dc__esp-lista">
                {especialidades.map((esp) => (
                  <li key={esp.id}>
                    <IconoEspecialidad nombre={esp.icono} size={16} aria-hidden="true" />
                    {esp.nombre}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <p className="dc__nota">
          Si hay riesgo de vida, llamá al <a href="tel:107" className="ui-link-strong">107</a> antes de salir.
        </p>
      </main>

      {abierto && (
        <div className="ui-backdrop ui-backdrop--sheet" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
          <div className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="aviso-titulo">
            <div className="ui-dialog__head">
              <div className="ui-grow">
                <h2 id="aviso-titulo" className="ui-dialog__title">Avisar que voy en camino</h2>
                <p className="ui-help" style={{ marginTop: 4 }}>Para {centro.nombre}</p>
              </div>
              <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm ui-btn--icon" onClick={cerrar} disabled={enviando} aria-label="Cerrar">
                <X size={16} />
              </button>
            </div>

            <form className="ui-dialog__body ui-form" onSubmit={enviar} noValidate>
              {errorEnvio && (
                <div className="ui-alert" role="alert" style={{ marginBottom: 0 }}>
                  <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{errorEnvio}</span>
                </div>
              )}

              <div className="ui-field">
                <label className="ui-label" htmlFor="input-motivo-consulta">¿Qué te pasa?</label>
                <div className="dc__motivos" role="group" aria-label="Motivos frecuentes">
                  {MOTIVOS_FRECUENTES.map((texto) => (
                    <button
                      key={texto}
                      type="button"
                      className="ui-fchip"
                      aria-pressed={motivo.includes(texto)}
                      onClick={() => alternarMotivo(texto)}
                      disabled={enviando}
                    >
                      {texto}
                    </button>
                  ))}
                </div>
                <textarea
                  id="input-motivo-consulta"
                  className="ui-textarea"
                  rows={3}
                  maxLength={MAX_MOTIVO}
                  placeholder="Contalo en una línea: síntomas, desde cuándo, si es un chico"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={enviando}
                  aria-describedby="motivo-ayuda"
                />
                <span id="motivo-ayuda" className="ui-help">
                  Opcional. <span className="ui-mono">{motivo.length}/{MAX_MOTIVO}</span>
                </span>
              </div>

              {sinCuenta && (
                <div className={`ui-field${errorNombre ? ' has-error' : ''}`}>
                  <label className="ui-label" htmlFor="input-nombre-invitado">
                    Tu nombre y apellido <span className="ui-required" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="input-nombre-invitado"
                    type="text"
                    className="ui-input"
                    autoComplete="name"
                    placeholder="Juan Gómez"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    disabled={enviando}
                    aria-invalid={Boolean(errorNombre)}
                    aria-describedby="nombre-ayuda"
                    required
                  />
                  <span id="nombre-ayuda" className={errorNombre ? 'ui-error-text' : 'ui-help'}>
                    {errorNombre || 'Con este nombre te van a llamar en la guardia.'}
                  </span>
                </div>
              )}

              <div className="ui-field">
                <label className="ui-label" htmlFor="input-telefono-contacto">Teléfono de contacto (opcional)</label>
                <input
                  id="input-telefono-contacto"
                  type="tel"
                  className="ui-input"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="376 412-3456"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  disabled={enviando}
                />
              </div>

              <div className="ui-dialog__foot dc__pie">
                <button type="button" className="ui-btn ui-btn--quiet ui-btn--lg" onClick={cerrar} disabled={enviando}>
                  Cancelar
                </button>
                <button id="btn-confirmar-solicitud" type="submit" className="ui-btn ui-btn--primary ui-btn--lg" disabled={enviando}>
                  {enviando && <span className="ui-spinner" aria-hidden="true" />}
                  {enviando ? 'Enviando' : 'Confirmar y enviar aviso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
