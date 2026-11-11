/**
 * Mapa.jsx - Mapa y listado de guardias cercanas.
 *
 * - Desktop: listado a la izquierda y mapa a la derecha. Mobile: una vista
 *   por vez, con un conmutador flotante Lista / Mapa.
 * - Filtros: búsqueda por texto, tipo de centro (carril deslizable, nunca se
 *   corta), radio y "sólo 24 horas". El tipo se filtra en el dispositivo, así
 *   cada chip muestra cuántos centros hay y cambiar de filtro es instantáneo.
 * - Ubicación por GPS con alternativa manual por zona.
 * - Sin red se muestran los centros guardados y se avisa el motivo real.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  ArrowRight,
  ArrowsClockwise,
  Clock,
  Crosshair,
  Lightning,
  ListBullets,
  MagnifyingGlass,
  MapPin,
  MapTrifold,
  Phone,
  Warning,
  X,
} from '@phosphor-icons/react'

import Navbar from '../components/Navbar.jsx'
import ChipRail from '../components/ui/ChipRail.jsx'
import { obtenerCentrosCercanos, MOTIVO_SIN_CONEXION } from '../api/centros.js'
import { TIPOS_CENTRO, textoDistancia, tipoCentro } from '../utils/tiposCentro.js'

// Punto de referencia cuando no hay GPS
const POSADAS_CENTRO = { lat: -27.3621, lon: -55.9009, nombre: 'Posadas Centro' }

const ZONAS = [
  POSADAS_CENTRO,
  { nombre: 'Villa Cabello', lat: -27.366, lon: -55.945 },
  { nombre: 'Itaembé Miní', lat: -27.4102, lon: -55.9611 },
  { nombre: 'Miguel Lanús', lat: -27.4332, lon: -55.8895 },
]

const RADIOS = [5, 10, 20, 50]

// Leaflet recibe HTML plano: los íconos se serializan a SVG
const iconoHtml = (Icon, props = {}) => renderToStaticMarkup(<Icon {...props} />)

const escapar = (texto = '') =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export default function Mapa() {
  const navigate = useNavigate()

  const [ubicacion, setUbicacion] = useState(POSADAS_CENTRO)
  const [avisoUbicacion, setAvisoUbicacion] = useState(null)
  const [buscandoGPS, setBuscandoGPS] = useState(false)
  const [eligiendoZona, setEligiendoZona] = useState(false)

  const [radioKm, setRadioKm] = useState(10)
  const [tipo, setTipo] = useState('')
  const [solo24h, setSolo24h] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  // Vista en mobile: 'lista' | 'mapa'
  const [vista, setVista] = useState('lista')

  const [centros, setCentros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [offline, setOffline] = useState(null) // null | motivo
  // Se incrementa para volver a pedir los centros (reintento o vuelta de la red)
  const [recargas, setRecargas] = useState(0)

  const [seleccionadoId, setSeleccionadoId] = useState(null)

  const contenedorMapa = useRef(null)
  const mapa = useRef(null)
  const capaPines = useRef(null)
  const pinUsuario = useRef(null)
  const pines = useRef(new Map())
  // Los manejadores de Leaflet se registran una vez: leen el estado por ref
  const estado = useRef({ centros: [], ubicacion })
  estado.current = { centros, ubicacion }

  const irADetalle = useCallback(
    (centro) => navigate(`/centros/${centro.id}`, { state: { centro, ubicacionUsuario: estado.current.ubicacion } }),
    [navigate]
  )

  const centrarEn = useCallback((lat, lon, esUsuario) => {
    const m = mapa.current
    if (!m) return
    m.setView([lat, lon], 14, { animate: true })
    if (!esUsuario) {
      pinUsuario.current?.remove()
      pinUsuario.current = null
      return
    }
    if (pinUsuario.current) {
      pinUsuario.current.setLatLng([lat, lon])
      return
    }
    pinUsuario.current = L.marker([lat, lon], {
      icon: L.divIcon({ className: 'mp-yo', html: '<span class="mp-yo__halo"></span><span class="mp-yo__punto"></span>', iconSize: [28, 28], iconAnchor: [14, 14] }),
      zIndexOffset: 1200,
      keyboard: false,
    })
      .bindTooltip('Estás acá', { direction: 'top', offset: [0, -10] })
      .addTo(m)
  }, [])

  const usarZona = useCallback(
    (zona) => {
      setUbicacion(zona)
      centrarEn(zona.lat, zona.lon, false)
    },
    [centrarEn]
  )

  const pedirGPS = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setAvisoUbicacion('Este navegador no permite usar el GPS. Mostramos las guardias desde Posadas Centro.')
      usarZona(POSADAS_CENTRO)
      return
    }
    setBuscandoGPS(true)
    setAvisoUbicacion(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude, nombre: 'Tu ubicación' }
        setUbicacion(coords)
        setBuscandoGPS(false)
        setEligiendoZona(false)
        centrarEn(coords.lat, coords.lon, true)
      },
      () => {
        setBuscandoGPS(false)
        setAvisoUbicacion('No pudimos leer tu ubicación. Mostramos las guardias desde Posadas Centro.')
        usarZona(POSADAS_CENTRO)
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    )
  }, [centrarEn, usarZona])

  // 1. Mapa Leaflet: se crea una sola vez
  useEffect(() => {
    if (!contenedorMapa.current || mapa.current) return undefined

    const m = L.map(contenedorMapa.current, { center: [POSADAS_CENTRO.lat, POSADAS_CENTRO.lon], zoom: 13, zoomControl: false })
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m)

    capaPines.current = L.layerGroup().addTo(m)
    mapa.current = m

    // El botón del popup es HTML plano: se conecta al abrirse
    m.on('popupopen', (e) => {
      const boton = e.popup.getElement()?.querySelector('[data-centro]')
      if (!boton) return
      L.DomEvent.disableClickPropagation(boton)
      boton.onclick = () => {
        const centro = estado.current.centros.find((c) => String(c.id) === boton.dataset.centro)
        if (centro) irADetalle(centro)
      }
    })

    pedirGPS()

    return () => {
      m.remove()
      mapa.current = null
      pinUsuario.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2. Al volver la red se recargan los centros y desaparece el aviso
  useEffect(() => {
    const alReconectar = () => setRecargas((n) => n + 1)
    window.addEventListener('online', alReconectar)
    return () => window.removeEventListener('online', alReconectar)
  }, [])

  // 3. Centros del radio elegido (el tipo se filtra en el dispositivo)
  useEffect(() => {
    let activo = true
    setCargando(true)
    setError(null)

    obtenerCentrosCercanos({ lat: ubicacion.lat, lon: ubicacion.lon, radio_km: radioKm })
      .then((data) => {
        if (!activo) return
        setCentros(data.resultados || [])
        setOffline(data.esOffline ? data.motivoOffline || 'error' : null)
      })
      .catch((err) => {
        if (activo) setError(err.message || 'No se pudieron cargar los centros.')
      })
      .finally(() => {
        if (activo) setCargando(false)
      })

    return () => {
      activo = false
    }
  }, [ubicacion, radioKm, recargas])

  // 4. Filtros en el dispositivo
  const porTexto = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return centros.filter((c) => {
      if (solo24h && !c.atiende_24h) return false
      if (!q) return true
      return [c.nombre, c.direccion, c.tipo_legible].some((campo) => (campo || '').toLowerCase().includes(q))
    })
  }, [centros, busqueda, solo24h])

  const cantidadPorTipo = useMemo(() => {
    const conteo = {}
    porTexto.forEach((c) => {
      conteo[c.tipo] = (conteo[c.tipo] || 0) + 1
    })
    return conteo
  }, [porTexto])

  const visibles = useMemo(() => (tipo ? porTexto.filter((c) => c.tipo === tipo) : porTexto), [porTexto, tipo])

  const hayFiltros = Boolean(tipo || solo24h || busqueda.trim())
  const limpiarFiltros = () => {
    setTipo('')
    setSolo24h(false)
    setBusqueda('')
  }

  // 5. Pines del mapa
  useEffect(() => {
    const capa = capaPines.current
    if (!capa) return

    capa.clearLayers()
    pines.current.clear()

    visibles.forEach((centro) => {
      const cfg = tipoCentro(centro.tipo)
      const pin = L.marker([centro.latitud, centro.longitud], {
        title: centro.nombre,
        icon: L.divIcon({
          className: 'mp-pin',
          html: `<span class="mp-pin__cuerpo" style="--c:${cfg.color}">${iconoHtml(cfg.Icon, { size: 17, weight: 'fill', color: '#ffffff' })}</span>`,
          iconSize: [36, 44],
          iconAnchor: [18, 42],
          popupAnchor: [0, -40],
        }),
      }).addTo(capa)

      pin.bindPopup(
        `<div class="mp-popup">
          <p class="mp-popup__tipo">${escapar(centro.tipo_legible || cfg.label)}</p>
          <h3 class="mp-popup__nombre">${escapar(centro.nombre)}</h3>
          <p class="mp-popup__dir">${escapar(centro.direccion)}</p>
          <p class="mp-popup__meta">
            ${centro.distancia_km != null ? `<span>${textoDistancia(centro.distancia_km)}</span>` : ''}
            <span>${centro.atiende_24h ? 'Abierto 24 horas' : 'Horario reducido'}</span>
          </p>
          <button type="button" class="ui-btn ui-btn--primary ui-btn--sm ui-btn--block" data-centro="${centro.id}">Ver guardia y avisar</button>
        </div>`,
        { maxWidth: 280, minWidth: 220, className: 'mp-popup-shell' }
      )

      pin.on('click', () => {
        setSeleccionadoId(centro.id)
        document.getElementById(`card-${centro.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })

      pines.current.set(centro.id, pin)
    })
  }, [visibles])

  // Al pasar a la vista de mapa en mobile, Leaflet necesita recalcular su tamaño
  useEffect(() => {
    if (vista !== 'mapa') return undefined
    const t = setTimeout(() => mapa.current?.invalidateSize(), 60)
    return () => clearTimeout(t)
  }, [vista])

  const seleccionar = (centro) => {
    setSeleccionadoId(centro.id)
    const pin = pines.current.get(centro.id)
    if (mapa.current && pin) {
      mapa.current.setView([centro.latitud, centro.longitud], 16, { animate: true })
      pin.openPopup()
    }
  }

  return (
    <div className="ui-shell mp">
      <Navbar />

      {offline && (
        <aside className="offline-alert-banner" role="status">
          <Lightning size={16} weight="fill" aria-hidden="true" />
          <span>
            {offline === MOTIVO_SIN_CONEXION
              ? 'Sin conexión: se muestran los centros de Posadas guardados en el dispositivo.'
              : 'No pudimos actualizar los centros: se muestran los guardados en el dispositivo.'}
          </span>
        </aside>
      )}

      <div className="mp__cuerpo" data-vista={vista}>
        <aside className="mp__panel" aria-label="Guardias cercanas">
          <div className="mp__filtros">
            <div className="mp__buscar">
              <MagnifyingGlass size={18} aria-hidden="true" />
              <input
                type="search"
                className="mp__buscar-input"
                placeholder="Buscar por nombre o dirección"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label="Buscar centro"
              />
              {busqueda && (
                <button type="button" className="mp__buscar-borrar" onClick={() => setBusqueda('')} aria-label="Borrar búsqueda">
                  <X size={14} weight="bold" />
                </button>
              )}
            </div>

            <ChipRail label="Tipo de centro" className="mp__carril">
              <button type="button" className="ui-fchip" aria-pressed={tipo === ''} onClick={() => setTipo('')}>
                Todos
                <span className="ui-fchip__count">{porTexto.length}</span>
              </button>
              {Object.entries(TIPOS_CENTRO).map(([clave, cfg]) => (
                <button
                  key={clave}
                  type="button"
                  className="ui-fchip"
                  aria-pressed={tipo === clave}
                  onClick={() => setTipo(tipo === clave ? '' : clave)}
                >
                  <cfg.Icon size={16} aria-hidden="true" />
                  {cfg.corto}
                  <span className="ui-fchip__count">{cantidadPorTipo[clave] || 0}</span>
                </button>
              ))}
            </ChipRail>

            <div className="mp__ajustes">
              <div className="ui-segmented mp__radio" role="group" aria-label="Radio de búsqueda">
                {RADIOS.map((km) => (
                  <button key={km} type="button" className={radioKm === km ? 'is-active' : ''} aria-pressed={radioKm === km} onClick={() => setRadioKm(km)}>
                    {km} km
                  </button>
                ))}
              </div>
              <button type="button" className="ui-fchip" aria-pressed={solo24h} onClick={() => setSolo24h((v) => !v)}>
                <Clock size={16} aria-hidden="true" />
                24 horas
              </button>
            </div>

            <div className="mp__ubicacion">
              <span className="mp__ubicacion-texto">
                <MapPin size={15} weight="fill" aria-hidden="true" />
                Desde <strong>{ubicacion.nombre}</strong>
              </span>
              <button type="button" className="ui-linkbtn" onClick={pedirGPS} disabled={buscandoGPS}>
                {buscandoGPS ? <span className="ui-spinner" aria-hidden="true" /> : <Crosshair size={15} aria-hidden="true" />}
                {buscandoGPS ? 'Ubicando' : 'Usar mi GPS'}
              </button>
              <button type="button" className="ui-linkbtn" onClick={() => setEligiendoZona((v) => !v)} aria-expanded={eligiendoZona}>
                Cambiar zona
              </button>
            </div>

            {eligiendoZona && (
              <div className="mp__zonas" role="group" aria-label="Zonas de Posadas">
                {ZONAS.map((z) => (
                  <button
                    key={z.nombre}
                    type="button"
                    className="ui-fchip"
                    aria-pressed={ubicacion.nombre === z.nombre}
                    onClick={() => {
                      usarZona(z)
                      setAvisoUbicacion(null)
                      setEligiendoZona(false)
                    }}
                  >
                    {z.nombre}
                  </button>
                ))}
              </div>
            )}

            {avisoUbicacion && !eligiendoZona && <p className="mp__aviso">{avisoUbicacion}</p>}
          </div>

          <div className="mp__lista">
            <p className="mp__conteo" aria-live="polite">
              {cargando
                ? 'Buscando guardias cercanas'
                : `${visibles.length} ${visibles.length === 1 ? 'centro' : 'centros'} a menos de ${radioKm} km`}
              {hayFiltros && !cargando && (
                <button type="button" className="ui-linkbtn" onClick={limpiarFiltros}>Quitar filtros</button>
              )}
            </p>

            {cargando && centros.length === 0 && (
              <div aria-busy="true">
                {[0, 1, 2, 3].map((n) => (
                  <div key={n} className="mp-card mp-card--carga">
                    <div className="ui-skeleton" style={{ height: 12, width: '35%' }} />
                    <div className="ui-skeleton" style={{ height: 18, width: '80%' }} />
                    <div className="ui-skeleton" style={{ height: 12, width: '60%' }} />
                  </div>
                ))}
              </div>
            )}

            {error && !cargando && (
              <div className="ui-empty">
                <div className="ui-empty__icon ui-empty__icon--alert"><Warning size={22} /></div>
                <p className="ui-empty__title">No pudimos cargar los centros</p>
                <p className="ui-empty__text">{error}</p>
                <button type="button" className="ui-btn" style={{ marginTop: 16 }} onClick={() => setRecargas((n) => n + 1)}>
                  <ArrowsClockwise size={16} />
                  Reintentar
                </button>
              </div>
            )}

            {!cargando && !error && visibles.length === 0 && (
              <div className="ui-empty">
                <div className="ui-empty__icon"><MagnifyingGlass size={22} /></div>
                <p className="ui-empty__title">
                  {hayFiltros ? 'Ningún centro coincide con los filtros' : `No hay centros a menos de ${radioKm} km`}
                </p>
                <p className="ui-empty__text">
                  {hayFiltros ? 'Probá con otro tipo de centro o quitá los filtros.' : 'Ampliá el radio para ver Posadas y alrededores.'}
                </p>
                <div className="mp__vacio-acciones">
                  {hayFiltros && <button type="button" className="ui-btn" onClick={limpiarFiltros}>Quitar filtros</button>}
                  {radioKm < 50 && (
                    <button type="button" className="ui-btn ui-btn--dark" onClick={() => setRadioKm(50)}>Buscar en 50 km</button>
                  )}
                </div>
              </div>
            )}

            {visibles.map((centro) => {
              const cfg = tipoCentro(centro.tipo)
              return (
                <article
                  key={centro.id}
                  id={`card-${centro.id}`}
                  className={`mp-card${seleccionadoId === centro.id ? ' is-active' : ''}`}
                  onClick={() => seleccionar(centro)}
                >
                  <span className="mp-card__icono" style={{ '--c': cfg.color }} aria-hidden="true">
                    <cfg.Icon size={20} weight="fill" />
                  </span>

                  <div className="mp-card__texto">
                    <p className="mp-card__tipo">{centro.tipo_legible || cfg.label}</p>
                    <h2 className="mp-card__nombre">{centro.nombre}</h2>
                    <p className="mp-card__dir">{centro.direccion}</p>
                    <div className="mp-card__chips">
                      <span className={`ui-chip${centro.atiende_24h ? ' ui-chip--ok' : ''}`}>
                        {centro.atiende_24h ? 'Abierto 24 horas' : 'Horario reducido'}
                      </span>
                    </div>
                  </div>

                  {centro.distancia_km != null && <span className="mp-card__dist ui-mono">{textoDistancia(centro.distancia_km)}</span>}

                  <div className="mp-card__acciones">
                    {centro.telefono && (
                      <a
                        href={`tel:${centro.telefono}`}
                        className="ui-btn ui-btn--sm"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Llamar a ${centro.nombre}`}
                      >
                        <Phone size={16} />
                        <span className="ui-mono">{centro.telefono}</span>
                      </a>
                    )}
                    <button
                      type="button"
                      className="ui-btn ui-btn--primary ui-btn--sm mp-card__ir"
                      onClick={(e) => {
                        e.stopPropagation()
                        irADetalle(centro)
                      }}
                      aria-label={`Ver detalles y avisar a ${centro.nombre}`}
                    >
                      Avisar llegada
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </aside>

        <section className="mp__mapa" aria-label="Mapa de Posadas">
          <div ref={contenedorMapa} className="mp__lienzo" />
        </section>

        <div className="mp__conmutador ui-segmented" role="group" aria-label="Vista">
          <button type="button" className={vista === 'lista' ? 'is-active' : ''} aria-pressed={vista === 'lista'} onClick={() => setVista('lista')}>
            <ListBullets size={16} />
            Lista
          </button>
          <button type="button" className={vista === 'mapa' ? 'is-active' : ''} aria-pressed={vista === 'mapa'} onClick={() => setVista('mapa')}>
            <MapTrifold size={16} />
            Mapa
          </button>
        </div>
      </div>
    </div>
  )
}
