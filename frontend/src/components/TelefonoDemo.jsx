/**
 * TelefonoDemo - Maqueta de la pantalla de la app para la portada.
 *
 * Sigue la lámina "Aplicaciones" del manual de identidad: fondo Niebla,
 * tarjeta blanca, botón Rojo Señal y los cuatro estados con ícono y texto.
 * `paso` (0 a 3) es el momento del recorrido que se está contando:
 * elegir centro, aviso en espera, en camino y atención completada.
 */

import { ArrowRight, Check, Clock, MapPin } from '@phosphor-icons/react'
import Logo from './Logo.jsx'

// Recorrido del paciente hasta la guardia, en las coordenadas del mapa (264 x 190)
const RUTA = 'M40 152 L40 112 L122 112 L122 62 L206 62 L206 42'

const ESTADOS = [
  null,
  { clase: 'espera', icon: Clock, label: 'En espera', texto: 'El centro ya recibió tu aviso.' },
  { clase: 'camino', icon: ArrowRight, label: 'En camino', texto: 'Te esperan en la guardia.' },
  { clase: 'listo', icon: Check, label: 'Atención completada', texto: 'Quedó guardada en tu historial.' },
]

export default function TelefonoDemo({ paso = 0 }) {
  return (
    <div className="tel" data-paso={paso} aria-hidden="true">
      <div className="tel__barra">
        <Logo size={26} />
      </div>

      <div className="tel__mapa">
        <div className="tel__lienzo">
        <svg viewBox="0 0 264 190" width="264" height="190" focusable="false">
          <rect width="264" height="190" fill="#FFFFFF" />
          <path d="M0 0H264V22C214 34 168 14 118 26C74 36 36 22 0 30Z" fill="#F4F6F8" />
          <g stroke="#D8DEE6" strokeWidth="6" strokeLinecap="round" fill="none">
            <path d="M-4 112H268M-4 62H268M-4 152H268" />
            <path d="M40 40V194M122 34V194M206 30V194" />
            <path d="M82 84V194M164 40V140" strokeWidth="3" />
          </g>
          <g fill="#5B6676">
            <circle cx="82" cy="62" r="4" />
            <circle cx="164" cy="152" r="4" />
            <circle cx="232" cy="112" r="4" />
          </g>
          <path className="tel__ruta" d={RUTA} pathLength="1" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <g transform="translate(190 8) scale(0.34)">
            <path d="M48 84C48 84 22 60 22 40a26 26 0 0 1 52 0C74 60 48 84 48 84Z" fill="#D9252B" stroke="#FFFFFF" strokeWidth="5" />
            <rect x="44" y="26" width="8" height="28" rx="2" fill="#FFFFFF" />
            <rect x="34" y="36" width="28" height="8" rx="2" fill="#FFFFFF" />
          </g>
        </svg>
        <span className="tel__yo" style={{ offsetPath: `path('${RUTA}')` }} />
        </div>
      </div>

      <div className="tel__capas">
        <div className="tel__capa" data-capa="0">
          <div className="tel__tarjeta">
            <span className="ea-etiqueta">Centro más cercano</span>
            <div className="tel__centro">
              <MapPin size={24} weight="bold" />
              <div>
                <strong>Sanatorio Boratti</strong>
                <span>1,4 km · 5 min</span>
              </div>
            </div>
          </div>
          <span className="tel__boton tel__boton--rojo">Solicitar atención</span>
        </div>

        {ESTADOS.map((e, i) => e && (
          <div className="tel__capa" data-capa={i} key={e.clase}>
            <div className={`ea-estado ea-estado--${e.clase}`}>
              <e.icon size={20} weight="bold" />
              {e.label}
            </div>
            <p className="tel__nota">{e.texto}</p>
            <div className="tel__tarjeta tel__tarjeta--guardia">
              <span className="ea-etiqueta">Tu guardia</span>
              <div className="tel__centro">
                <MapPin size={24} weight="bold" />
                <div>
                  <strong>Sanatorio Boratti</strong>
                  <span>{i === 3 ? 'Atención N.º 128' : i === 2 ? 'Llegás en 3 min' : '1,4 km · 5 min'}</span>
                </div>
              </div>
            </div>
            <span className="tel__boton">{i === 3 ? 'Ver historial' : 'Ver mi aviso'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
