/**
 * MapaInstituciones - Mapa Leaflet con las instituciones de la red (consola del superadmin).
 *
 * Mismo estilo que MapaPreview (tiles en gris, pines circulares), pero con
 * zoom/arrastre y encuadre automático a los centros recibidos.
 * Rojo = activo, gris = inactivo. Al tocar un pin se llama a `onSelect(centro)`.
 */

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const CENTRO_POSADAS = [-27.392, -55.912]

export default function MapaInstituciones({ centros = [], onSelect, alto = 480 }) {
  const contenedor = useRef(null)
  const mapa = useRef(null)
  const capa = useRef(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!contenedor.current) return undefined
    mapa.current = L.map(contenedor.current, { center: CENTRO_POSADAS, zoom: 12, scrollWheelZoom: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    }).addTo(mapa.current)
    capa.current = L.layerGroup().addTo(mapa.current)
    return () => {
      mapa.current?.remove()
      mapa.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapa.current || !capa.current) return
    capa.current.clearLayers()

    const puntos = []
    centros.forEach((c) => {
      const lat = Number(c.latitud)
      const lon = Number(c.longitud)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
      puntos.push([lat, lon])
      L.circleMarker([lat, lon], {
        radius: 7,
        color: '#ffffff',
        weight: 1.5,
        fillColor: c.activo ? '#c42f3a' : '#8a919c',
        fillOpacity: 1,
      })
        .bindTooltip(`${c.nombre}${c.activo ? '' : ' (inactivo)'}`, { direction: 'top', offset: [0, -6] })
        .on('click', () => onSelectRef.current?.(c))
        .addTo(capa.current)
    })

    if (puntos.length === 1) mapa.current.setView(puntos[0], 14)
    else if (puntos.length > 1) mapa.current.fitBounds(puntos, { padding: [32, 32], maxZoom: 14 })
  }, [centros])

  return (
    <div
      ref={contenedor}
      className="mapa-preview mapa-instituciones"
      style={{ height: alto }}
      role="region"
      aria-label="Mapa de instituciones de la red"
    />
  )
}
