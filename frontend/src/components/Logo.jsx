/**
 * Logo de EmergenciAPP según el manual de identidad (carpeta /manual).
 *
 * - Isotipo: cuadrado redondeado (la app), pin (ubica) y cruz (atiende).
 * - El nombre se escribe siempre "EmergenciAPP", en Sora 700 con "APP" en 800.
 * - `sobre` elige la versión: 'claro' (principal), 'noche' (negativo sobre
 *   Tinta Noche) o 'rojo' (negativo sobre Rojo Señal).
 *
 * Los mismos logos, con el texto trazado, están en /public/brand para usar
 * fuera de la app.
 */

const ROJO = '#D9252B'
const BLANCO = '#FFFFFF'

export function Isotipo({ size = 28, invertido = false, ...rest }) {
  const fondo = invertido ? BLANCO : ROJO
  const figura = invertido ? ROJO : BLANCO
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} aria-hidden="true" focusable="false" {...rest}>
      <rect width="96" height="96" rx="22" fill={fondo} />
      <path d="M48 84C48 84 22 60 22 40a26 26 0 0 1 52 0C74 60 48 84 48 84Z" fill={figura} />
      <rect x="44" y="26" width="8" height="28" rx="2" fill={fondo} />
      <rect x="34" y="36" width="28" height="8" rx="2" fill={fondo} />
    </svg>
  )
}

export default function Logo({ size = 28, sobre = 'claro', vertical = false, nameClass = '' }) {
  const clases = ['ea-logo', `ea-logo--${sobre}`, vertical ? 'ea-logo--vertical' : ''].filter(Boolean).join(' ')
  return (
    <span className={clases} style={{ '--logo': `${size}px` }}>
      <Isotipo size={size} invertido={sobre === 'rojo'} />
      <span className={`ea-logo__word ${nameClass}`.trim()}>
        Emergenci<span className="ea-logo__app">APP</span>
      </span>
    </span>
  )
}
