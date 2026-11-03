/**
 * Landing.jsx - Portada de EmergenciaYA.
 *
 * Lectura de diseño: servicio de salud de uso ciudadano en Posadas, para gente
 * apurada y con el celular en la mano, más el personal de los centros que lo opera.
 * Tono sobrio y de confianza; un solo acento (rojo clínico) y tema claro.
 * El visual del hero es el mapa real de la red, no una foto genérica.
 */

import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Bell,
  ClipboardText,
  FirstAid,
  MapPinLine,
  NavigationArrow,
  Phone,
  Stethoscope,
  SquaresFour,
} from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext.jsx'
import { CENTROS_DEFAULT_POSADAS } from '../api/centros.js'
import { ROLES } from '../utils/roles.js'
import MapaPreview from '../components/MapaPreview.jsx'

const LINEAS = [
  { numero: '107', nombre: 'SAME', detalle: 'Ambulancias y emergencias médicas' },
  { numero: '911', nombre: 'Policía', detalle: 'Emergencias policiales en Misiones' },
  { numero: '100', nombre: 'Bomberos', detalle: 'Incendios, rescates y accidentes' },
]

const PASOS = [
  {
    icon: MapPinLine,
    titulo: 'Elegí el centro',
    texto: 'El mapa ordena las guardias por distancia y muestra cuáles atienden las 24 horas.',
  },
  {
    icon: NavigationArrow,
    titulo: 'Avisá que vas',
    texto: 'Contá en una línea qué te pasa. La guardia lo recibe antes de que llegues.',
  },
  {
    icon: Bell,
    titulo: 'Seguí tu solicitud',
    texto: 'La pantalla se actualiza sola cuando el centro acepta o te deriva a un especialista.',
  },
]

const COBERTURA = [
  { tipos: ['hospital'], label: 'Hospitales públicos' },
  { tipos: ['clinica'], label: 'Sanatorios privados' },
  { tipos: ['upa'], label: 'Centros de atención primaria' },
  { tipos: ['same', 'bomberos', 'policia'], label: 'Bases de SAME, bomberos y policía' },
]

export default function Landing() {
  const navigate = useNavigate()
  const { estaAutenticado, rol, esInvitado } = useAuth()

  const conCuenta = estaAutenticado && !esInvitado && ROLES[rol]

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-nav__inner">
          <Link to="/" className="ui-brand">
            <span className="ui-brand__mark" aria-hidden="true"><FirstAid size={17} weight="bold" /></span>
            EmergenciaYA
          </Link>

          <nav className="landing-nav__links" aria-label="Secciones">
            <a href="#como-funciona" className="ui-nav__link">Cómo funciona</a>
            <a href="#centros" className="ui-nav__link">Para centros de salud</a>
          </nav>

          <div className="landing-nav__actions">
            {conCuenta ? (
              <Link to={ROLES[rol].inicio} className="ui-btn ui-btn--sm">{ROLES[rol].destino}</Link>
            ) : (
              <Link to="/ingreso" className="ui-btn ui-btn--quiet ui-btn--sm">Ingresar</Link>
            )}
            <Link to="/mapa" className="ui-btn ui-btn--primary ui-btn--sm">Buscar guardia</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="landing-hero__copy">
            <h1 id="hero-title" className="landing-hero__title">
              La guardia más cercana, en un toque.
            </h1>
            <p className="landing-hero__sub">
              Mirá qué centros de Posadas atienden ahora, a qué distancia estás y avisá que vas en camino.
            </p>
            <div className="landing-hero__ctas">
              <button type="button" className="ui-btn ui-btn--primary ui-btn--lg" onClick={() => navigate('/mapa')}>
                Buscar guardia
                <ArrowRight size={18} />
              </button>
              <a href="tel:107" className="ui-btn ui-btn--lg">
                <Phone size={18} />
                Llamar al 107
              </a>
            </div>
          </div>

          <figure className="landing-hero__map">
            <MapaPreview />
            <figcaption className="landing-hero__legend">
              <span><i className="legend-dot legend-dot--salud" /> Hospitales, sanatorios y CAPS</span>
              <span><i className="legend-dot legend-dot--otro" /> Bomberos y policía</span>
            </figcaption>
          </figure>
        </section>

        <section className="landing-lineas" aria-label="Líneas de emergencia">
          <p className="landing-lineas__intro">Si hay riesgo de vida, llamá antes de salir.</p>
          <div className="landing-lineas__row">
            {LINEAS.map((l) => (
              <a key={l.numero} href={`tel:${l.numero}`} className="landing-linea">
                <span className="landing-linea__num">{l.numero}</span>
                <span>
                  <strong>{l.nombre}</strong>
                  <span className="landing-linea__det">{l.detalle}</span>
                </span>
              </a>
            ))}
          </div>
        </section>

        <section className="landing-pasos" id="como-funciona" aria-labelledby="pasos-title">
          <img
            className="landing-pasos__img"
            src="/triage-consulta.jpg"
            alt="Una enfermera de triage conversa con una pareja en el consultorio de guardia"
            loading="lazy"
          />
          <div>
            <h2 id="pasos-title" className="landing-h2">Sin registro y sin llamar para preguntar.</h2>
            <ol className="landing-pasos__list">
              {PASOS.map(({ icon: Icon, titulo, texto }) => (
                <li key={titulo}>
                  <span className="landing-pasos__icon"><Icon size={20} /></span>
                  <div>
                    <h3>{titulo}</h3>
                    <p>{texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="landing-centros" id="centros" aria-labelledby="centros-title">
          <h2 id="centros-title" className="landing-h2">Cada rol tiene su pantalla.</h2>
          <p className="landing-centros__sub">
            El mismo aviso del paciente llega a la administración del centro, se deriva al médico de guardia y queda en el historial.
          </p>

          <div className="landing-bento">
            <article className="landing-tile landing-tile--ink">
              <SquaresFour size={26} />
              <h3>Administración del centro</h3>
              <p>Bandeja de guardia en vivo, triage con prioridad y derivación al especialista que está libre en ese momento.</p>
            </article>
            <article className="landing-tile landing-tile--tint">
              <Stethoscope size={26} />
              <h3>Médicos de guardia</h3>
              <p>Cola de pacientes derivados, estado de disponibilidad, ficha clínica y cierre con diagnóstico.</p>
            </article>
            <article className="landing-tile">
              <ClipboardText size={26} />
              <h3>Pacientes</h3>
              <p>Historial de atenciones con diagnóstico e indicaciones, en cualquier centro de la red.</p>
            </article>
          </div>
        </section>

        <section className="landing-cobertura" aria-labelledby="cobertura-title">
          <h2 id="cobertura-title" className="landing-h2">Posadas y Garupá, con direcciones verificadas.</h2>
          <dl className="landing-cobertura__grid">
            {COBERTURA.map(({ tipos, label }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="ui-mono">
                  {CENTROS_DEFAULT_POSADAS.filter((c) => tipos.includes(c.tipo)).length}
                </dd>
              </div>
            ))}
          </dl>
          <p className="ui-help">Ubicaciones tomadas de OpenStreetMap.</p>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div>
            <span className="ui-brand">
              <span className="ui-brand__mark" aria-hidden="true"><FirstAid size={17} weight="bold" /></span>
              EmergenciaYA
            </span>
            <p className="landing-footer__aviso">
              Ante un paro cardiorrespiratorio o un trauma grave, llamá primero al 107.
            </p>
          </div>
          <nav className="landing-footer__links" aria-label="Pie de página">
            <Link to="/mapa">Mapa de guardias</Link>
            <Link to="/ingreso">Ingresar</Link>
            <a href="#como-funciona">Cómo funciona</a>
          </nav>
        </div>
        <p className="landing-footer__copy">© {new Date().getFullYear()} EmergenciaYA, Misiones.</p>
      </footer>
    </div>
  )
}
