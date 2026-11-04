/**
 * MapaPin - Mapa Leaflet con un único pin para ubicar una institución.
 *
 *   <MapaPin lat={-27.36} lon={-55.9} onChange={(lat, lon) => ...} />   editable
 *   <MapaPin lat={...} lon={...} />                                      sólo lectura
 *
 * En modo editable el pin se arrastra y un click en el mapa lo mueve.
 * Si lat/lon cambian desde afuera (inputs manuales, "Usar mi ubicación"),
 * el pin y la vista se reposicionan.
 */

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const POSADAS = [-27.3671, -55.8961]

const icono = L.divIcon({
  className: 'ui-pin',
  html: '<span class="ui-pin__dot"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

function valido(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

export default function MapaPin({ lat, lon, onChange, alto = 320 }) {
  const contenedor = useRef(null)
  const mapa = useRef(null)
  const pin = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const editable = typeof onChange === 'function'

  useEffect(() => {
    if (!contenedor.current) return undefined
    const la = Number(lat)
    const lo = Number(lon)
    const inicio = valido(la, lo) ? [la, lo] : POSADAS

    mapa.current = L.map(contenedor.current, {
      center: inicio,
      zoom: valido(la, lo) ? 15 : 12,
      scrollWheelZoom: false,
      dragging: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(mapa.current)

    pin.current = L.marker(inicio, { icon: icono, draggable: editable, keyboard: editable }).addTo(mapa.current)

    if (editable) {
      const emitir = (latlng) => onChangeRef.current?.(Number(latlng.lat.toFixed(7)), Number(latlng.lng.toFixed(7)))
      pin.current.on('dragend', () => emitir(pin.current.getLatLng()))
      mapa.current.on('click', (e) => {
        pin.current.setLatLng(e.latlng)
        emitir(e.latlng)
      })
    }

    return () => {
      mapa.current?.remove()
      mapa.current = null
    }
  }, [editable]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reposicionar si las coordenadas cambian desde afuera
  useEffect(() => {
    const la = Number(lat)
    const lo = Number(lon)
    if (!mapa.current || !pin.current || !valido(la, lo)) return
    const actual = pin.current.getLatLng()
    if (Math.abs(actual.lat - la) < 1e-7 && Math.abs(actual.lng - lo) < 1e-7) return
    pin.current.setLatLng([la, lo])
    mapa.current.setView([la, lo], Math.max(mapa.current.getZoom(), 15))
  }, [lat, lon])

  return (
    <div
      ref={contenedor}
      className="mapa-preview mapa-pin"
      style={{ height: alto }}
      role="region"
      aria-label={editable ? 'Mapa: arrastrá el pin o tocá el mapa para ubicar la institución' : 'Ubicación de la institución'}
    />
  )
}
