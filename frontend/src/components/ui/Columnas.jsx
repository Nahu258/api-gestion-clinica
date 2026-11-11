/**
 * Columnas - Gráfico de columnas de una sola serie.
 *
 *   <Columnas
 *     titulo="Solicitudes por hora del día"
 *     datos={[{ etiqueta: '08', valor: 4, detalle: '08:00 a 08:59' }, ...]}
 *     unidad="solicitudes"
 *     cadaCuantas={3}          // cada cuántas columnas se rotula el eje
 *   />
 *
 * Una sola serie: no lleva leyenda (el título dice qué se grafica). Columnas
 * finas con punta redondeada, grilla tenue, valor máximo rotulado y tooltip
 * al pasar el mouse o enfocar con teclado. Incluye una tabla equivalente
 * para lectores de pantalla.
 */

import { useState } from 'react'

function techo(max) {
  if (max <= 4) return 4
  const paso = 10 ** Math.floor(Math.log10(max))
  const candidatos = [1, 2, 4, 5, 10].map((m) => m * paso)
  return candidatos.find((c) => c >= max) || max
}

export default function Columnas({ titulo, datos = [], unidad = '', cadaCuantas = 1, alto = 180 }) {
  const [activo, setActivo] = useState(null)

  const max = Math.max(0, ...datos.map((d) => d.valor))
  const tope = techo(max)
  const marcas = [tope, tope / 2, 0]
  const indiceMax = max > 0 ? datos.findIndex((d) => d.valor === max) : -1
  const foco = activo != null ? datos[activo] : null

  return (
    <figure className="tb-cols">
      <figcaption className="ui-sr-only">{titulo}</figcaption>

      <div className="tb-cols__plot" style={{ height: alto }}>
        <div className="tb-cols__grid" aria-hidden="true">
          {marcas.map((m) => (
            <span key={m} style={{ bottom: `${(m / tope) * 100}%` }}>
              <i className="ui-mono">{Number.isInteger(m) ? m : m.toFixed(1)}</i>
            </span>
          ))}
        </div>

        <div className="tb-cols__bars" role="presentation" onMouseLeave={() => setActivo(null)}>
          {datos.map((d, i) => (
            <button
              key={d.etiqueta + i}
              type="button"
              className={`tb-cols__slot${activo === i ? ' is-active' : ''}`}
              onMouseEnter={() => setActivo(i)}
              onFocus={() => setActivo(i)}
              onBlur={() => setActivo(null)}
              aria-label={`${d.detalle || d.etiqueta}: ${d.valor} ${unidad}`}
            >
              {i === indiceMax && activo == null && <span className="tb-cols__tip ui-mono">{d.valor}</span>}
              <span className="tb-cols__bar" style={{ height: `${(d.valor / tope) * 100}%` }} />
            </button>
          ))}
        </div>

        {foco && (
          <div
            className="tb-tooltip"
            role="status"
            style={{ left: `${((activo + 0.5) / datos.length) * 100}%` }}
            data-borde={activo < datos.length * 0.2 ? 'izq' : activo > datos.length * 0.8 ? 'der' : 'centro'}
          >
            <strong className="ui-mono">{foco.valor}</strong> {unidad}
            <span>{foco.detalle || foco.etiqueta}</span>
          </div>
        )}
      </div>

      <div className="tb-cols__eje" aria-hidden="true">
        {datos.map((d, i) => (
          <span key={d.etiqueta + i}>{i % cadaCuantas === 0 ? d.etiqueta : ''}</span>
        ))}
      </div>

      <table className="ui-sr-only">
        <caption>{titulo}</caption>
        <thead>
          <tr><th>Período</th><th>{unidad}</th></tr>
        </thead>
        <tbody>
          {datos.map((d, i) => (
            <tr key={d.etiqueta + i}><td>{d.detalle || d.etiqueta}</td><td>{d.valor}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
