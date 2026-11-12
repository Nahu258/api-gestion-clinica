/**
 * useEscenas - Motor de scrollytelling de la portada, sin dependencias.
 *
 * Marcas que entiende dentro del contenedor:
 *   [data-escena="nombre"]   Sección cuyo avance (0 a 1) se escribe en --p.
 *                            Por defecto es una escena fija (alta, con un hijo
 *                            sticky). Con data-modo="cruce" mide el paso de un
 *                            bloque normal por la pantalla.
 *   [data-pasos="4"]         Divide el avance en pasos y avisa por onPaso.
 *   [data-tono="noche"]      Mientras cruza la barra superior, onTono(true).
 *   [data-revela]            Recibe .is-visible la primera vez que entra.
 *
 * `pistas` reparte el avance de cada escena en tramos con nombre:
 *   { hero: { titulo: [0.2, 0.5, 'out'] } }  ->  --k-titulo de 0 a 1.
 *
 * El avance se suaviza cuadro a cuadro para que la animación no salte con la
 * rueda del mouse. Con "reducir movimiento" no se suaviza y las escenas
 * marcadas con data-quieto="final" quedan en su estado final.
 */

import { useEffect, useRef } from 'react'

const CURVAS = {
  lineal: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  // Se pasa un poco del final y vuelve: da el rebote de las piezas del logo
  rebote: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
}

const entre01 = (v) => Math.min(1, Math.max(0, v))

export default function useEscenas(ref, { pistas = {}, onPaso, onTono } = {}) {
  const avisos = useRef({ onPaso, onTono })
  avisos.current = { onPaso, onTono }

  useEffect(() => {
    const raiz = ref.current
    if (!raiz) return undefined

    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    raiz.classList.toggle('landing--quieta', quieto)

    const escenas = [...raiz.querySelectorAll('[data-escena]')].map((el) => ({
      el,
      pistas: Object.entries(pistas[el.dataset.escena] || {}),
      cruce: el.dataset.modo === 'cruce',
      pasos: Number(el.dataset.pasos) || 0,
      final: quieto && el.dataset.quieto === 'final',
      avance: null,
      paso: -1,
    }))
    const oscuros = [...raiz.querySelectorAll('[data-tono="noche"]')]
    let cuadro = 0
    let tono = null

    const pintar = () => {
      cuadro = 0
      const alto = window.innerHeight
      let falta = false

      for (const e of escenas) {
        const r = e.el.getBoundingClientRect()
        let meta = e.cruce
          ? entre01((alto * 0.88 - r.top) / (alto * 0.5))
          : entre01(-r.top / Math.max(1, r.height - alto))
        if (e.final) meta = 1

        if (e.avance === null || quieto || Math.abs(meta - e.avance) < 0.0005) e.avance = meta
        else {
          e.avance += (meta - e.avance) * 0.14
          falta = true
        }

        e.el.style.setProperty('--p', e.avance.toFixed(4))
        for (const [nombre, [desde, hasta, curva = 'lineal']] of e.pistas) {
          const k = CURVAS[curva](entre01((e.avance - desde) / (hasta - desde)))
          e.el.style.setProperty(`--k-${nombre}`, k.toFixed(4))
        }

        if (e.pasos) {
          const paso = Math.min(e.pasos - 1, Math.floor(e.avance * e.pasos))
          if (paso !== e.paso) {
            e.paso = paso
            avisos.current.onPaso?.(e.el.dataset.escena, paso)
          }
        }
      }

      const ahora = oscuros.some((el) => {
        const r = el.getBoundingClientRect()
        return r.top <= 32 && r.bottom > 32
      })
      if (ahora !== tono) {
        tono = ahora
        avisos.current.onTono?.(ahora)
      }

      if (falta) cuadro = requestAnimationFrame(pintar)
    }

    const pedir = () => {
      if (!cuadro) cuadro = requestAnimationFrame(pintar)
    }

    pintar()
    window.addEventListener('scroll', pedir, { passive: true })
    window.addEventListener('resize', pedir)

    const porRevelar = [...raiz.querySelectorAll('[data-revela]')]
    let observador
    if (quieto || !('IntersectionObserver' in window)) {
      porRevelar.forEach((el) => el.classList.add('is-visible'))
    } else {
      observador = new IntersectionObserver(
        (entradas) => {
          entradas.forEach((en) => {
            if (!en.isIntersecting) return
            en.target.classList.add('is-visible')
            observador.unobserve(en.target)
          })
        },
        { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
      )
      porRevelar.forEach((el) => observador.observe(el))
    }

    return () => {
      window.removeEventListener('scroll', pedir)
      window.removeEventListener('resize', pedir)
      if (cuadro) cancelAnimationFrame(cuadro)
      observador?.disconnect()
    }
    // `pistas` es una constante de módulo en quien llama
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref])
}
