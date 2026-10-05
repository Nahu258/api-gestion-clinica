/**
 * Mapa.jsx — Pantalla principal de EmergenciaYA.
 *
 * AE4-08 (issue #17): Mapa interactivo con Leaflet + Geolocation API.
 * - Detecta ubicación del usuario (con fallback manual si rechaza GPS)
 * - Muestra marcadores coloreados por tipo con íconos
 * - Marcador de usuario azul con efecto de pulso
 * - Sincronización bidireccional mapa <-> lista de cards
 * - Filtros por tipo de servicio y por radio de búsqueda
 * - Soporte offline con datos en cache (sessionStorage)
 * - Botón de recarga manual de GPS y datos
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { obtenerCentrosCercanos } from '../api/centros.js'
import { cerrarSesion, getAuthHeaders } from '../api/auth.js'

// Coordenadas de referencia por defecto (Posadas, Misiones)
const COORDENADAS_POSADAS = {
  lat: -27.3621,
  lon: -55.9009,
  nombre: 'Posadas Centro',
}

const PRESETS_UBICACION = [
  { nombre: 'Posadas Centro', lat: -27.3621, lon: -55.9009 },
  { nombre: 'Villa Cabello (Oeste)', lat: -27.3789, lon: -55.9325 },
  { nombre: 'Itaembé Miní (Sur)', lat: -27.4265, lon: -55.9492 },
  { nombre: 'Miguel Lanús (Campus UNaM)', lat: -27.4332, lon: -55.8895 },
]

// Metadatos por tipo de centro: ícono, color, etiqueta
const TIPOS_CONFIG = {
  hospital: { label: 'Hospitales', icon: '🏥', color: '#e63946', badgeClass: 'tipo-hospital' },
  same:     { label: 'SAME / Ambulancia', icon: '🚑', color: '#118ab2', badgeClass: 'tipo-same' },
  upa:      { label: 'UPAs / Salas', icon: '🩺', color: '#06d6a0', badgeClass: 'tipo-upa' },
  bomberos: { label: 'Bomberos', icon: '🚒', color: '#f77f00', badgeClass: 'tipo-bomberos' },
  policia:  { label: 'Policía', icon: '🚓', color: '#073b4c', badgeClass: 'tipo-policia' },
  otro:     { label: 'Otros', icon: '📍', color: '#6c757d', badgeClass: 'tipo-otro' },
}

export default function Mapa() {
  const navigate = useNavigate()

  // Estado de sesión
  const headers = getAuthHeaders()
  const esInvitado = !!headers['X-Guest-Token']
  const tipoSesion = esInvitado ? 'Invitado' : 'Usuario registrado'

  // Estado de ubicación y búsqueda
  const [ubicacionUsuario, setUbicacionUsuario] = useState(null)
  const [errorUbicacion, setErrorUbicacion] = useState(null)
  const [obteniendoGPS, setObteniendoGPS] = useState(false)
  const [radioKm, setRadioKm] = useState(10)
  const [tipoFiltro, setTipoFiltro] = useState('') // '' = todos

  // Centros y carga
  const [centros, setCentros] = useState([])
  const [cargandoCentros, setCargandoCentros] = useState(false)
  const [errorCentros, setErrorCentros] = useState(null)
  const [esOffline, setEsOffline] = useState(false)

  // Selección activa para sincronizar mapa y lista
  const [centroSeleccionadoId, setCentroSeleccionadoId] = useState(null)

  // Fallback manual de ubicación
  const [mostrarFallbackManual, setMostrarFallbackManual] = useState(false)
  const [inputLat, setInputLat] = useState('')
  const [inputLon, setInputLon] = useState('')

  // Referencias a Leaflet
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersLayerRef = useRef(null)
  const userMarkerRef = useRef(null)
  const markersMapRef = useRef(new Map())
  const cardsContainerRef = useRef(null)

  // 1. Inicializar el mapa Leaflet una sola vez
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    const initialLat = COORDENADAS_POSADAS.lat
    const initialLon = COORDENADAS_POSADAS.lon

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom: 13,
      zoomControl: true,
      tap: false,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    const markersGroup = L.layerGroup().addTo(map)
    markersLayerRef.current = markersGroup
    mapInstanceRef.current = map

    // Solicitar ubicación al montar el componente
    solicitarUbicacion()

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // 2. Función para pedir geolocalización al navegador
  const solicitarUbicacion = () => {
    setObteniendoGPS(true)
    setErrorUbicacion(null)

    if (!('geolocation' in navigator)) {
      setErrorUbicacion('Tu dispositivo no soporta geolocalización. Usá la selección manual.')
      setObteniendoGPS(false)
      usarUbicacionManual(COORDENADAS_POSADAS.lat, COORDENADAS_POSADAS.lon, 'Posadas por defecto')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          nombre: 'Tu ubicación actual',
        }
        setUbicacionUsuario(coords)
        setObteniendoGPS(false)
        setMostrarFallbackManual(false)
        centrarMapaEnUsuario(coords.lat, coords.lon)
      },
      (err) => {
        setObteniendoGPS(false)
        let msg = 'No pudimos obtener tu ubicación automáticamente.'
        if (err.code === 1) msg = 'Permiso de ubicación denegado. Podés seleccionar tu zona manualmente.'
        if (err.code === 2) msg = 'Ubicación no disponible en este momento.'
        if (err.code === 3) msg = 'Tiempo de espera de GPS agotado.'
        setErrorUbicacion(msg)
        setMostrarFallbackManual(true)
        // Usar Posadas por defecto para no dejar al usuario sin datos en emergencia
        usarUbicacionManual(COORDENADAS_POSADAS.lat, COORDENADAS_POSADAS.lon, 'Posadas (por defecto)')
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    )
  }

  // Establecer ubicación manualmente
  const usarUbicacionManual = (lat, lon, nombre = 'Ubicación manual') => {
    const coords = { lat: Number(lat), lon: Number(lon), nombre }
    setUbicacionUsuario(coords)
    centrarMapaEnUsuario(coords.lat, coords.lon)
  }

  // Centrar y actualizar marcador del usuario
  const centrarMapaEnUsuario = (lat, lon) => {
    const map = mapInstanceRef.current
    if (!map) return

    map.setView([lat, lon], 14, { animate: true })

    // Marcador azul del usuario con animación de pulso
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([lat, lon])
    } else {
      const userIcon = L.divIcon({
        className: 'user-location-icon-wrapper',
        html: `
          <div class="user-marker-container">
            <div class="user-marker-pulse"></div>
            <div class="user-marker-dot"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })

      const marker = L.marker([lat, lon], {
        icon: userIcon,
        zIndexOffset: 1000,
      }).addTo(map)

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; text-align: center; padding: 2px;">
          <strong style="color: #2563eb;">📍 Estás acá</strong>
        </div>
      `)

      userMarkerRef.current = marker
    }
  }

  // 3. Cargar centros cuando cambia la ubicación, el radio o el tipo
  useEffect(() => {
    if (!ubicacionUsuario) return

    let activo = true
    setCargandoCentros(true)
    setErrorCentros(null)

    obtenerCentrosCercanos({
      lat: ubicacionUsuario.lat,
      lon: ubicacionUsuario.lon,
      radio_km: radioKm,
      tipo: tipoFiltro,
    })
      .then((data) => {
        if (!activo) return
        setCentros(data.resultados || [])
        setEsOffline(Boolean(data.esOffline))
        setCargandoCentros(false)
      })
      .catch((err) => {
        if (!activo) return
        setErrorCentros(err.message || 'Error al obtener los centros.')
        setCargandoCentros(false)
      })

    return () => {
      activo = false
    }
  }, [ubicacionUsuario, radioKm, tipoFiltro])

  // 4. Actualizar marcadores en el mapa cuando cambian los centros
  useEffect(() => {
    const map = mapInstanceRef.current
    const layer = markersLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    markersMapRef.current.clear()

    centros.forEach((centro) => {
      const config = TIPOS_CONFIG[centro.tipo] || TIPOS_CONFIG.otro
      const emoji = config.icon
      const color = config.color

      const icon = L.divIcon({
        className: 'centro-marker-wrapper',
        html: `
          <div class="centro-marker-pin" style="--pin-color: ${color};" id="marker-pin-${centro.id}">
            <span class="centro-marker-icon">${emoji}</span>
          </div>
        `,
        iconSize: [36, 42],
        iconAnchor: [18, 42],
        popupAnchor: [0, -38],
      })

      const marker = L.marker([centro.latitud, centro.longitud], { icon }).addTo(layer)

      const popupContent = `
        <div class="map-popup-card">
          <div class="map-popup-header">
            <span class="map-popup-icon">${emoji}</span>
            <div>
              <h4 class="map-popup-title">${centro.nombre}</h4>
              <span class="map-popup-distancia">${centro.distancia_km != null ? `${centro.distancia_km} km` : ''}</span>
            </div>
          </div>
          <p class="map-popup-dir">📍 ${centro.direccion}</p>
          <div class="map-popup-badges">
            <span class="badge ${centro.atiende_24h ? 'badge--green' : 'badge--gray'}">
              ${centro.atiende_24h ? '⏰ 24 Horas' : 'Horario limitado'}
            </span>
          </div>
          <button
            class="btn btn--invitado btn--popup"
            onclick="window.dispatchEvent(new CustomEvent('ver-detalle-centro', { detail: { id: ${centro.id} } }))"
          >
            Ver detalle
          </button>
        </div>
      `

      marker.bindPopup(popupContent, { maxWidth: 280, className: 'custom-leaflet-popup' })

      // Al hacer click en el marcador en el mapa: seleccionar y scrollear la card
      marker.on('click', () => {
        setCentroSeleccionadoId(centro.id)
        scrollearACard(centro.id)
      })

      markersMapRef.current.set(centro.id, marker)
    })
  }, [centros])

  // Escuchar evento del popup de Leaflet para navegar al detalle
  useEffect(() => {
    const handleVerDetalle = (e) => {
      const id = e.detail?.id
      if (id) {
        const centro = centros.find((c) => c.id === id)
        navigate(`/centros/${id}`, { state: { centro, ubicacionUsuario } })
      }
    }
    window.addEventListener('ver-detalle-centro', handleVerDetalle)
    return () => window.removeEventListener('ver-detalle-centro', handleVerDetalle)
  }, [centros, navigate, ubicacionUsuario])

  // Función para sincronizar: click en card -> zoom y abrir popup en el mapa
  const handleSeleccionarCentro = (centro) => {
    setCentroSeleccionadoId(centro.id)
    const map = mapInstanceRef.current
    const marker = markersMapRef.current.get(centro.id)

    if (map && marker) {
      map.setView([centro.latitud, centro.longitud], 16, { animate: true })
      marker.openPopup()
    }
  }

  const scrollearACard = (id) => {
    const el = document.getElementById(`centro-card-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  const handleIrADetalle = (centro) => {
    navigate(`/centros/${centro.id}`, { state: { centro, ubicacionUsuario } })
  }

  const handleSalir = () => {
    cerrarSesion()
    navigate('/', { replace: true })
  }

  const handleManualCoordsSubmit = (e) => {
    e.preventDefault()
    const lat = parseFloat(inputLat)
    const lon = parseFloat(inputLon)
    if (isNaN(lat) || isNaN(lon)) {
      alert('Por favor ingresá números válidos para latitud y longitud.')
      return
    }
    usarUbicacionManual(lat, lon, 'Coordenadas personalizadas')
    setMostrarFallbackManual(false)
  }

  return (
    <div className="mapa-page">
      {/* ── Barra Superior (Header) ── */}
      <header className="mapa-header">
        <div className="mapa-header-marca">
          <span className="mapa-logo-icono" aria-hidden="true">🚨</span>
          <span className="mapa-logo-texto">EmergenciaYA</span>
        </div>

        <div className="mapa-header-info">
          <span className="badge-sesion" title={`Sesión activa: ${tipoSesion}`}>
            <span className="punto-verde"></span>
            {tipoSesion}
          </span>
          <button
            className="btn-icono"
            onClick={solicitarUbicacion}
            disabled={obteniendoGPS}
            title="Actualizar mi ubicación GPS"
            aria-label="Actualizar GPS"
          >
            <span className={obteniendoGPS ? 'icono-giratorio' : ''}>🎯</span>
          </button>
          <button
            className="btn-icono btn-icono--salir"
            onClick={handleSalir}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            🚪
          </button>
        </div>
      </header>

      {/* Banner de modo offline si aplica */}
      {esOffline && (
        <aside className="aviso-offline" role="status">
          ⚠️ Sin conexión a internet. Mostrando los últimos centros guardados en cache.
        </aside>
      )}

      {/* Aviso / Banner si hubo error de GPS */}
      {errorUbicacion && !mostrarFallbackManual && (
        <div className="alerta-gps">
          <span>{errorUbicacion}</span>
          <button
            className="btn-link"
            onClick={() => setMostrarFallbackManual(true)}
          >
            Elegir zona
          </button>
        </div>
      )}

      {/* Panel desplegable de selección manual si GPS falló o el usuario lo elige */}
      {mostrarFallbackManual && (
        <div className="manual-location-panel">
          <div className="manual-location-header">
            <h4>📍 Seleccionar zona manualmente</h4>
            <button
              className="btn-close"
              onClick={() => setMostrarFallbackManual(false)}
              aria-label="Cerrar selección manual"
            >
              ✕
            </button>
          </div>

          <p className="manual-location-desc">
            Elegí un punto de referencia en Posadas o ingresá tus coordenadas:
          </p>

          <div className="presets-grid">
            {PRESETS_UBICACION.map((p) => (
              <button
                key={p.nombre}
                type="button"
                className="btn-preset"
                onClick={() => {
                  usarUbicacionManual(p.lat, p.lon, p.nombre)
                  setMostrarFallbackManual(false)
                }}
              >
                {p.nombre}
              </button>
            ))}
          </div>

          <form onSubmit={handleManualCoordsSubmit} className="coords-form">
            <input
              type="text"
              placeholder="Lat (ej. -27.3621)"
              value={inputLat}
              onChange={(e) => setInputLat(e.target.value)}
              className="input-coord"
            />
            <input
              type="text"
              placeholder="Lon (ej. -55.9009)"
              value={inputLon}
              onChange={(e) => setInputLon(e.target.value)}
              className="input-coord"
            />
            <button type="submit" className="btn btn--invitado btn--sm">
              Buscar
            </button>
          </form>
        </div>
      )}

      {/* ── Controles de Filtro ── */}
      <section className="controles-bar" aria-label="Filtros de búsqueda">
        {/* Selector de Radio */}
        <div className="filtro-radio">
          <label htmlFor="select-radio" className="filtro-label">Radio:</label>
          <select
            id="select-radio"
            value={radioKm}
            onChange={(e) => setRadioKm(Number(e.target.value))}
            className="select-filtro"
          >
            <option value="5">5 km</option>
            <option value="10">10 km (recomendado)</option>
            <option value="20">20 km</option>
            <option value="50">50 km</option>
          </select>
        </div>

        {/* Chips de tipo de centro */}
        <div className="chips-scroll" role="tablist">
          <button
            type="button"
            className={`chip ${tipoFiltro === '' ? 'chip--active' : ''}`}
            onClick={() => setTipoFiltro('')}
          >
            Todos
          </button>
          {Object.entries(TIPOS_CONFIG).map(([key, config]) => (
            <button
              key={key}
              type="button"
              className={`chip ${tipoFiltro === key ? 'chip--active' : ''}`}
              onClick={() => setTipoFiltro(key)}
            >
              <span>{config.icon}</span> {config.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Contenedor del Mapa ── */}
      <div className="mapa-viewport">
        <div ref={mapContainerRef} className="mapa-leaflet" id="mapa-emergencia" />

        {cargandoCentros && (
          <div className="mapa-loading-overlay">
            <div className="spinner" />
            <span>Buscando centros cercanos...</span>
          </div>
        )}
      </div>

      {/* ── Lista de Centros (Cards) ── */}
      <section className="centros-section" aria-label="Centros de emergencia disponibles">
        <div className="centros-section-header">
          <h2 className="centros-titulo">
            Centros de emergencia cercanos
            <span className="centros-contador">({centros.length})</span>
          </h2>
          <span className="ubicacion-actual-tag">
            📍 {ubicacionUsuario?.nombre || 'Posadas'}
          </span>
        </div>

        {errorCentros && (
          <div className="centros-error">
            <p>⚠️ {errorCentros}</p>
            <button
              className="btn btn--invitado btn--sm"
              onClick={() => setRadioKm((r) => r)}
            >
              Reintentar
            </button>
          </div>
        )}

        {!cargandoCentros && centros.length === 0 && !errorCentros && (
          <div className="centros-vacio">
            <span style={{ fontSize: '2.5rem' }}>🔍</span>
            <h3>No se encontraron centros en {radioKm} km</h3>
            <p>Probá aumentar el radio de búsqueda o cambiar el tipo de servicio.</p>
            <div className="acciones-vacio">
              <button
                className="btn btn--invitado btn--sm"
                onClick={() => setRadioKm(50)}
              >
                Buscar en 50 km
              </button>
              <button
                className="btn btn--secundario btn--sm"
                onClick={() => setTipoFiltro('')}
              >
                Ver todos los tipos
              </button>
            </div>
          </div>
        )}

        <div className="centros-lista" ref={cardsContainerRef}>
          {centros.map((centro) => {
            const config = TIPOS_CONFIG[centro.tipo] || TIPOS_CONFIG.otro
            const esSeleccionado = centroSeleccionadoId === centro.id

            return (
              <article
                key={centro.id}
                id={`centro-card-${centro.id}`}
                className={`centro-card ${esSeleccionado ? 'centro-card--activa' : ''}`}
                onClick={() => handleSeleccionarCentro(centro)}
              >
                <div className="centro-card-top">
                  <div className="centro-card-ident">
                    <span className="centro-card-icono" aria-hidden="true">
                      {config.icon}
                    </span>
                    <div>
                      <h3 className="centro-card-nombre">{centro.nombre}</h3>
                      <p className="centro-card-direccion">📍 {centro.direccion}</p>
                    </div>
                  </div>

                  <div className="centro-card-distancia">
                    {centro.distancia_km != null ? (
                      <span className="distancia-badge">{centro.distancia_km} km</span>
                    ) : null}
                  </div>
                </div>

                <div className="centro-card-meta">
                  <span className={`badge ${centro.atiende_24h ? 'badge--green' : 'badge--gray'}`}>
                    {centro.atiende_24h ? '⏰ Abierto 24h' : 'Horario limitado'}
                  </span>
                  <span className="badge badge--tipo">{centro.tipo_legible || config.label}</span>
                </div>

                <div className="centro-card-acciones">
                  {centro.telefono ? (
                    <a
                      href={`tel:${centro.telefono}`}
                      className="btn-tel"
                      onClick={(e) => e.stopPropagation()}
                      title={`Llamar al ${centro.telefono}`}
                    >
                      📞 {centro.telefono}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn--invitado btn--card-detalle"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleIrADetalle(centro)
                    }}
                  >
                    Ver detalle
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
