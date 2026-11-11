/**
 * ChipRail - Fila de chips que nunca se corta.
 *
 * Los chips van en una sola línea que se desliza con el dedo, con la rueda
 * del mouse o con las flechas que aparecen cuando hay contenido fuera de la
 * vista. Un degradé en el borde avisa que hay más.
 *
 *   <ChipRail label="Tipo de centro">
 *     <button className="ui-fchip" aria-pressed="true">Todos</button>
 *     ...
 *   </ChipRail>
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'

export default function ChipRail({ children, label, className = '' }) {
  const pista = useRef(null)
  const [bordes, setBordes] = useState({ prev: false, next: false })

  const medir = useCallback(() => {
    const el = pista.current
    if (!el) return
    const prev = el.scrollLeft > 4
    const next = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    setBordes((b) => (b.prev === prev && b.next === next ? b : { prev, next }))
  }, [])

  useEffect(() => {
    const el = pista.current
    if (!el) return undefined
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    // La rueda vertical del mouse mueve el carril en horizontal
    const conRueda = (e) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', conRueda, { passive: false })
    return () => {
      el.removeEventListener('scroll', medir)
      el.removeEventListener('wheel', conRueda)
      observador.disconnect()
    }
  }, [medir, children])

  const mover = (direccion) => {
    const el = pista.current
    if (el) el.scrollBy({ left: direccion * el.clientWidth * 0.7, behavior: 'smooth' })
  }

  return (
    <div className={`ui-rail${bordes.prev ? ' has-prev' : ''}${bordes.next ? ' has-next' : ''} ${className}`}>
      {bordes.prev && (
        <button type="button" className="ui-rail__arrow ui-rail__arrow--prev" onClick={() => mover(-1)} aria-label="Ver filtros anteriores" tabIndex={-1}>
          <CaretLeft size={14} weight="bold" />
        </button>
      )}
      <div ref={pista} className="ui-rail__track" role="group" aria-label={label}>
        {children}
      </div>
      {bordes.next && (
        <button type="button" className="ui-rail__arrow ui-rail__arrow--next" onClick={() => mover(1)} aria-label="Ver más filtros" tabIndex={-1}>
          <CaretRight size={14} weight="bold" />
        </button>
      )}
    </div>
  )
}
