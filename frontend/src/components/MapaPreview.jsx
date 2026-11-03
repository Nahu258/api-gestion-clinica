/**
 * MapaPreview - Mapa estático de Posadas con los centros cargados en la red.
 *
 * Se usa en la landing como vista previa real del mapa de guardias:
 * sin arrastre ni zoom, pines rojos para salud y grises para bomberos y policía.
 */

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CENTROS_DEFAULT_POSADAS } from '../api/centros.js'

const TIPOS_SALUD = new Set(['hospital', 'clinica', 'upa', 'same'])

export default function MapaPreview({ destacado = 'Sanatorio Boratti' }) {
  const contenedor = useRef(null)

  useEffect(() => {
    if (!contenedor.current) return undefined

    const mapa = L.map(contenedor.current, {
      center: [-27.392, -55.912],
      zoom: 12,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      attributionControl: true,
    })

    // Mismos tiles que el mapa principal; se pasan a gris por CSS para que resalten los pines
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    }).addTo(mapa)

    CENTROS_DEFAULT_POSADAS.forEach((c) => {
      const salud = TIPOS_SALUD.has(c.tipo)
      L.circleMarker([c.latitud, c.longitud], {
        radius: c.nombre === destacado ? 8 : 5,
        color: '#ffffff',
        weight: 1.5,
        fillColor: salud ? '#c42f3a' : '#4a515c',
        fillOpacity: 1,
      })
        .bindTooltip(c.nombre, { direction: 'top', offset: [0, -6] })
        .addTo(mapa)
    })

    const boratti = CENTROS_DEFAULT_POSADAS.find((c) => c.nombre === destacado)
    if (boratti) {
      L.tooltip({ permanent: true, direction: 'right', offset: [10, 0], className: 'mapa-preview__label' })
        .setLatLng([boratti.latitud, boratti.longitud])
        .setContent(boratti.nombre)
        .addTo(mapa)
    }

    return () => mapa.remove()
  }, [destacado])

  return <div ref={contenedor} className="mapa-preview" role="img" aria-label="Mapa de Posadas con los centros de la red" />
}
