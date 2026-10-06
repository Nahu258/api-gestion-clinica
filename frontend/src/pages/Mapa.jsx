/**
 * Mapa.jsx - Mapa Interactivo y Directorio de Centros de Emergencia.
 *
 * Épica 3 (AE4-08, issue #17) rediseñado bajo los lineamientos de design-taste-frontend:
 *   - Layout responsive adaptativo: Split-view de 2 columnas en desktop, vista fluida en mobile.
 *   - Clicks 100% confiables en marcadores, popups de Leaflet y cards de centros.
 *   - Búsqueda en tiempo real por texto (nombre, especialidad, barrio).
 *   - Filtros rápidos por categoría médica (Hospitales, SAME, UPAs, Bomberos, Policía).
 *   - Selector de radio dinámico (5 km, 10 km, 20 km, 50 km).
 *   - Detección GPS con fallback instantáneo a Posadas Centro.
 *   - Soporte offline garantizado con catálogo en tierra firme (sin ubicaciones en el río Paraná).
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { obtenerCentrosCercanos } from '../api/centros.js'
import { cerrarSesion, getAuthHeaders } from '../api/auth.js'

// Coordenadas de referencia garantizadas (Posadas Centro, tierra firme)
const COORDENADAS_POSADAS = {
  lat: -27.3621,
  lon: -55.9009,
  nombre: 'Posadas Centro',
}

const PRESETS_UBICACION = [
  { nombre: 'Posadas Centro', lat: -27.3621, lon: -55.9009 },
  { nombre: 'Villa Cabello (Oeste)', lat: -27.3825, lon: -55.931 },
  { nombre: 'Itaembé Miní (Sur)', lat: -27.4102, lon: -55.9611 },
  { nombre: 'Miguel Lanús (Campus)', lat: -27.4332, lon: -55.8895 },
]

// Configuración visual por tipo de servicio
const TIPOS_CONFIG = {
  hospital: { label: 'Hospitales', icon: '🏥', color: '#e63946', badgeClass: 'tipo-hospital' },
  same:     { label: 'SAME / 107', icon: '🚑', color: '#0284c7', badgeClass: 'tipo-same' },
  upa:      { label: 'UPAs / CAPS', icon: '🩺', color: '#059669', badgeClass: 'tipo-upa' },
  bomberos: { label: 'Bomberos 100', icon: '🚒', color: '#ea580c', badgeClass: 'tipo-bomberos' },
  policia:  { label: 'Policía 911', icon: '🚓', color: '#1e293b', badgeClass: 'tipo-policia' },
}

export default function Mapa() {
  const navigate = useNavigate()

  // Sesión del usuario
  const headers = getAuthHeaders()
  const esInvitado = !!headers['X-Guest-Token']
  const tipoSesion = esInvitado ? 'Invitado de guardia' : 'Usuario registrado'

  // Estado de geolocalización
  const [ubicacionUsuario, setUbicacionUsuario] = useState(COORDENADAS_POSADAS)
  const [errorUbicacion, setErrorUbicacion] = useState(null)
  const [obteniendoGPS, setObteniendoGPS] = useState(false)

  // Filtros y búsqueda
  const [radioKm, setRadioKm] = useState(10)
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [busquedaTexto, setBusquedaTexto] = useState('')

  // Vista en mobile ('mapa' | 'lista')
  const [vistaMobile, setVistaMobile] = useState('lista')

  // Centros y carga
  const [centros, setCentros] = useState([])
  const [cargandoCentros, setCargandoCentros] = useState(false)
  const [errorCentros, setErrorCentros] = useState(null)
  const [esOffline, setEsOffline] = useState(false)

  // Centro seleccionado actualmente
  const [centroSeleccionadoId, setCentroSeleccionadoId] = useState(null)

  // Selector manual de zona
  const [mostrarSelectorManual, setMostrarSelectorManual] = useState(false)

  // Referencias a Leaflet
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersLayerRef = useRef(null)
  const userMarkerRef = useRef(null)
  const markersMapRef = useRef(new Map())

  // 1. Inicializar mapa Leaflet una sola vez
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    const initialLat = COORDENADAS_POSADAS.lat
    const initialLon = COORDENADAS_POSADAS.lon

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom: 13,
      zoomControl: false,
    })

    // Controles de zoom abajo a la derecha para no tapar los headers
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)

    const markersGroup = L.layerGroup().addTo(map)
    markersLayerRef.current = markersGroup
    mapInstanceRef.current = map

    // Listener universal para clicks dentro del popup de Leaflet
    map.on('popupopen', (e) => {
      const popupEl = e.popup.getElement()
      if (!popupEl) return
      const btnDetalle = popupEl.querySelector('.btn--popup-detalle')
      if (btnDetalle) {
        L.DomEvent.disableClickPropagation(btnDetalle)
        btnDetalle.onclick = (evt) => {
          evt.preventDefault()
          evt.stopPropagation()
          const centroId = btnDetalle.getAttribute('data-id')
          if (centroId) {
            const encontrado = centros.find((c) => String(c.id) === String(centroId))
            navigate(`/centros/${centroId}`, {
              state: { centro: encontrado, ubicacionUsuario },
            })
          }
        }
      }
    })

    // Pedir GPS en el montaje
    solicitarGPS()

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // 2. Pedir geolocalización al navegador
  const solicitarGPS = () => {
    setObteniendoGPS(true)
    setErrorUbicacion(null)

    if (!('geolocation' in navigator)) {
      setErrorUbicacion('Tu navegador no admite GPS directo. Usando centro de Posadas.')
      setObteniendoGPS(false)
      aplicarCoordenadas(COORDENADAS_POSADAS.lat, COORDENADAS_POSADAS.lon, 'Posadas Centro')
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
        setErrorUbicacion(null)
        setMostrarSelectorManual(false)
        centrarMapaEnPunto(coords.lat, coords.lon, true)
      },
      (err) => {
        setObteniendoGPS(false)
        setErrorUbicacion('GPS no disponible. Ubicación establecida en Posadas Centro.')
        aplicarCoordenadas(COORDENADAS_POSADAS.lat, COORDENADAS_POSADAS.lon, 'Posadas Centro')
      },
      {
        enableHighAccuracy: true,
        timeout: 9000,
        maximumAge: 60000,
      }
    )
  }

  const aplicarCoordenadas = (lat, lon, nombre) => {
    const coords = { lat: Number(lat), lon: Number(lon), nombre }
    setUbicacionUsuario(coords)
    centrarMapaEnPunto(coords.lat, coords.lon, false)
  }

  const centrarMapaEnPunto = (lat, lon, esUsuario = false) => {
    const map = mapInstanceRef.current
    if (!map) return

    map.setView([lat, lon], 14, { animate: true })

    if (esUsuario) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([lat, lon])
      } else {
        const userIcon = L.divIcon({
          className: 'user-marker-leaflet-wrapper',
          html: `
            <div class="user-pulse-outer"></div>
            <div class="user-dot-core"></div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })

        const marker = L.marker([lat, lon], {
          icon: userIcon,
          zIndexOffset: 1200,
        }).addTo(map)

        marker.bindPopup(`
          <div style="font-family: inherit; font-size: 13px; text-align: center; padding: 4px;">
            <strong style="color: #0284c7;">📍 Tu ubicación actual</strong>
          </div>
        `)

        userMarkerRef.current = marker
      }
    }
  }

  // 3. Cargar centros cuando cambian los parámetros
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

  // 4. Centros filtrados por texto
  const centrosFiltrados = useMemo(() => {
    if (!busquedaTexto.trim()) return centros
    const q = busquedaTexto.toLowerCase().trim()
    return centros.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.direccion.toLowerCase().includes(q) ||
        (c.tipo_legible && c.tipo_legible.toLowerCase().includes(q))
    )
  }, [centros, busquedaTexto])

  // 5. Renderizar marcadores de centros en el mapa
  useEffect(() => {
    const map = mapInstanceRef.current
    const layer = markersLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    markersMapRef.current.clear()

    centrosFiltrados.forEach((centro) => {
      const config = TIPOS_CONFIG[centro.tipo] || {
        label: 'Centro',
        icon: '📍',
        color: '#e63946',
      }
      const emoji = config.icon
      const color = config.color

      const icon = L.divIcon({
        className: 'centro-pin-wrapper',
        html: `
          <div class="centro-pin-body" style="background-color: ${color};" id="pin-${centro.id}">
            <span class="centro-pin-glyph">${emoji}</span>
          </div>
        `,
        iconSize: [36, 42],
        iconAnchor: [18, 40],
        popupAnchor: [0, -38],
      })

      const marker = L.marker([centro.latitud, centro.longitud], { icon }).addTo(layer)

      const popupHtml = `
        <div class="leaflet-custom-card">
          <div class="leaflet-card-header">
            <span class="leaflet-card-icon" style="background-color: ${color}20;">${emoji}</span>
            <div>
              <h4 class="leaflet-card-title">${centro.nombre}</h4>
              <span class="leaflet-card-dist">${centro.distancia_km != null ? `${centro.distancia_km} km` : 'Cercano'}</span>
            </div>
          </div>
          <p class="leaflet-card-address">📍 ${centro.direccion}</p>
          <div class="leaflet-card-badges">
            <span class="badge ${centro.atiende_24h ? 'badge--green' : 'badge--gray'}">
              ${centro.atiende_24h ? '24 Horas' : 'Horario reducido'}
            </span>
            <span class="badge badge--tipo">${centro.tipo_legible || config.label}</span>
          </div>
          <button
            type="button"
            class="btn btn--popup-detalle"
            data-id="${centro.id}"
          >
            Ver guardia y avisar →
          </button>
        </div>
      `

      marker.bindPopup(popupHtml, { maxWidth: 290, className: 'leaflet-popup-shell' })

      marker.on('click', () => {
        setCentroSeleccionadoId(centro.id)
        scrollearACard(centro.id)
      })

      markersMapRef.current.set(centro.id, marker)
    })
  }, [centrosFiltrados])

  const scrollearACard = (id) => {
    const el = document.getElementById(`card-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  // Click en card: centra mapa y abre popup
  const handleSeleccionarCentro = (centro) => {
    setCentroSeleccionadoId(centro.id)
    const map = mapInstanceRef.current
    const marker = markersMapRef.current.get(centro.id)

    if (map && marker) {
      map.setView([centro.latitud, centro.longitud], 16, { animate: true })
      marker.openPopup()
    }
  }

  const handleIrADetalle = (centro) => {
    navigate(`/centros/${centro.id}`, { state: { centro, ubicacionUsuario } })
  }

  const handleSalir = () => {
    cerrarSesion()
    navigate('/', { replace: true })
  }

  return (
    <div className="mapa-app-shell">
      {/* ── Top Bar de la Aplicación ── */}
      <header className="mapa-topbar" role="banner">
        <div className="mapa-topbar-left">
          <Link to="/" className="mapa-brand-link" aria-label="Ir a portada EmergenciaYA">
            <span className="mapa-brand-icon" aria-hidden="true">🚨</span>
            <span className="mapa-brand-title">EmergenciaYA</span>
          </Link>

          <span className="sesion-pill" title={`Estado: ${tipoSesion}`}>
            <span className="pulse-green-dot" aria-hidden="true" />
            <span>{tipoSesion}</span>
          </span>
        </div>

        <div className="mapa-topbar-right">
          {/* Botón selector de vista en móvil */}
          <div className="mobile-view-toggle">
            <button
              type="button"
              className={`view-toggle-btn ${vistaMobile === 'lista' ? 'view-toggle-btn--active' : ''}`}
              onClick={() => setVistaMobile('lista')}
              aria-label="Ver lista de centros"
            >
              📋 Lista ({centrosFiltrados.length})
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${vistaMobile === 'mapa' ? 'view-toggle-btn--active' : ''}`}
              onClick={() => {
                setVistaMobile('mapa')
                setTimeout(() => mapInstanceRef.current?.invalidateSize(), 150)
              }}
              aria-label="Ver mapa"
            >
              🗺️ Mapa
            </button>
          </div>

          {/* Botón GPS */}
          <button
            type="button"
            className="topbar-action-btn"
            onClick={solicitarGPS}
            disabled={obteniendoGPS}
            title="Actualizar mi ubicación con GPS"
            aria-label="Actualizar GPS"
          >
            <span className={obteniendoGPS ? 'spin-icon' : ''}>🎯</span>
            <span className="desktop-btn-label">Mi ubicación</span>
          </button>

          {/* Botón Salir */}
          <button
            type="button"
            className="topbar-action-btn topbar-action-btn--exit"
            onClick={handleSalir}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <span>🚪</span>
          </button>
        </div>
      </header>

      {/* Banner de modo offline si aplica */}
      {esOffline && (
        <aside className="offline-alert-banner" role="status">
          <span aria-hidden="true">⚡</span>
          <span>Modo desconectado: mostrando guardias verificadas de Posadas en memoria local.</span>
        </aside>
      )}

      {/* Aviso de GPS fallback */}
      {errorUbicacion && !mostrarSelectorManual && (
        <div className="gps-fallback-bar">
          <span>{errorUbicacion}</span>
          <button
            type="button"
            className="btn-link-action"
            onClick={() => setMostrarSelectorManual(true)}
          >
            Cambiar zona
          </button>
        </div>
      )}

      {/* Selector Manual Desplegable */}
      {mostrarSelectorManual && (
        <div className="manual-zone-selector" role="region" aria-label="Seleccionar zona de Posadas">
          <div className="manual-zone-head">
            <h4>Elegí tu punto de referencia en Posadas</h4>
            <button
              type="button"
              className="btn-close-sm"
              onClick={() => setMostrarSelectorManual(false)}
              aria-label="Cerrar selector"
            >
              ✕
            </button>
          </div>
          <div className="manual-presets-row">
            {PRESETS_UBICACION.map((p) => (
              <button
                key={p.nombre}
                type="button"
                className="zone-preset-chip"
                onClick={() => {
                  aplicarCoordenadas(p.lat, p.lon, p.nombre)
                  setMostrarSelectorManual(false)
                }}
              >
                📍 {p.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Cuerpo Principal: 2 Columnas (Sidebar + Mapa) ── */}
      <div className="mapa-workspace">
        {/* ── Columna Izquierda: Búsqueda, Filtros y Lista de Centros ── */}
        <aside className={`mapa-sidebar ${vistaMobile === 'mapa' ? 'mobile-hidden' : ''}`}>
          {/* Barra de Filtros y Búsqueda */}
          <div className="sidebar-filter-hub">
            <div className="search-input-wrapper">
              <span className="search-icon" aria-hidden="true">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Buscar por nombre, barrio o especialidad..."
                value={busquedaTexto}
                onChange={(e) => setBusquedaTexto(e.target.value)}
                aria-label="Buscar centro de emergencia"
              />
              {busquedaTexto && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setBusquedaTexto('')}
                  aria-label="Borrar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Chips de tipo de centro */}
            <div className="category-chips-bar" role="tablist">
              <button
                type="button"
                className={`category-chip ${tipoFiltro === '' ? 'category-chip--active' : ''}`}
                onClick={() => setTipoFiltro('')}
              >
                Todos ({centros.length})
              </button>
              {Object.entries(TIPOS_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  className={`category-chip ${tipoFiltro === key ? 'category-chip--active' : ''}`}
                  onClick={() => setTipoFiltro(key)}
                >
                  <span aria-hidden="true">{cfg.icon}</span>
                  <span>{cfg.label}</span>
                </button>
              ))}
            </div>

            {/* Selector de Radio y Estadísticas */}
            <div className="radius-selector-row">
              <div className="radius-select-box">
                <label htmlFor="radius-select" className="radius-label">Radio:</label>
                <select
                  id="radius-select"
                  className="radius-select"
                  value={radioKm}
                  onChange={(e) => setRadioKm(Number(e.target.value))}
                >
                  <option value="5">5 km</option>
                  <option value="10">10 km (Recomendado)</option>
                  <option value="20">20 km</option>
                  <option value="50">50 km (Metropolitano)</option>
                </select>
              </div>

              <span className="active-location-tag">
                📍 {ubicacionUsuario.nombre}
              </span>
            </div>
          </div>

          {/* Listado de Cards de Centros */}
          <div className="sidebar-cards-scroll" id="centros-scroll-container">
            {cargandoCentros && (
              <div className="cards-loading-state">
                <span className="action-spinner action-spinner--red" aria-hidden="true" />
                <p>Calculando distancias y guardias disponibles...</p>
              </div>
            )}

            {errorCentros && !cargandoCentros && (
              <div className="cards-error-state">
                <p>⚠️ {errorCentros}</p>
                <button
                  type="button"
                  className="btn btn--sm-outline"
                  onClick={() => setRadioKm((r) => r)}
                >
                  Reintentar búsqueda
                </button>
              </div>
            )}

            {!cargandoCentros && centrosFiltrados.length === 0 && !errorCentros && (
              <div className="cards-empty-state">
                <span className="empty-icon" aria-hidden="true">🔍</span>
                <h3>Sin centros en un radio de {radioKm} km</h3>
                <p>Probá ampliar el radio a 20 o 50 km para ver centros de Posadas y alrededores.</p>
                <div className="empty-actions">
                  <button
                    type="button"
                    className="btn btn--hero-primary btn--sm"
                    onClick={() => setRadioKm(50)}
                  >
                    Buscar en 50 km
                  </button>
                  <button
                    type="button"
                    className="btn btn--hero-secondary btn--sm"
                    onClick={() => {
                      setTipoFiltro('')
                      setBusquedaTexto('')
                    }}
                  >
                    Restablecer filtros
                  </button>
                </div>
              </div>
            )}

            {!cargandoCentros &&
              centrosFiltrados.map((centro) => {
                const cfg = TIPOS_CONFIG[centro.tipo] || {
                  label: 'Centro',
                  icon: '📍',
                  color: '#e63946',
                }
                const esActivo = centroSeleccionadoId === centro.id

                return (
                  <article
                    key={centro.id}
                    id={`card-${centro.id}`}
                    className={`medical-center-card ${esActivo ? 'medical-center-card--active' : ''}`}
                    onClick={() => handleSeleccionarCentro(centro)}
                  >
                    <div className="center-card-topbar">
                      <div className="center-card-badge-group">
                        <span className="center-category-badge" style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}>
                          {cfg.icon} {centro.tipo_legible || cfg.label}
                        </span>
                        <span className={`badge ${centro.atiende_24h ? 'badge--green' : 'badge--gray'}`}>
                          {centro.atiende_24h ? '⏰ 24 Horas' : 'Horario diurno'}
                        </span>
                      </div>

                      {centro.distancia_km != null && (
                        <span className="center-distance-pill">
                          {centro.distancia_km} km
                        </span>
                      )}
                    </div>

                    <div className="center-card-body">
                      <h3 className="center-card-title">{centro.nombre}</h3>
                      <p className="center-card-address">
                        <span aria-hidden="true">📍</span> {centro.direccion}
                      </p>
                    </div>

                    <div className="center-card-actions">
                      {centro.telefono && (
                        <a
                          href={`tel:${centro.telefono}`}
                          className="center-phone-btn"
                          onClick={(e) => e.stopPropagation()}
                          title={`Llamar al ${centro.telefono}`}
                          aria-label={`Llamar a ${centro.nombre}`}
                        >
                          <span>📞</span>
                          <span>{centro.telefono}</span>
                        </a>
                      )}

                      <button
                        type="button"
                        className="btn btn--card-proceed"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleIrADetalle(centro)
                        }}
                        aria-label={`Ver detalles y avisar a ${centro.nombre}`}
                      >
                        <span>Avisar llegada</span>
                        <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </article>
                )
              })}
          </div>
        </aside>

        {/* ── Columna Derecha: Contenedor del Mapa Leaflet ── */}
        <section
          className={`mapa-stage ${vistaMobile === 'lista' ? 'mobile-hidden' : ''}`}
          aria-label="Mapa interactivo de Posadas"
        >
          <div ref={mapContainerRef} className="leaflet-map-canvas" id="leaflet-map" />

          {/* Quick HUD del mapa */}
          <div className="map-hud-overlay">
            <span className="hud-badge">
              📍 {centrosFiltrados.length} centros en pantalla
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}
