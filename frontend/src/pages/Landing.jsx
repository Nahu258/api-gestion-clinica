/**
 * Landing.jsx - Portada de EmergenciaYA.
 *
 * Lectura de diseño: servicio de salud de uso ciudadano en Posadas, para gente
 * apurada y con el celular en la mano, y carta de presentación para las
 * instituciones que lo operan. Tono sobrio y de confianza, tema claro y un
 * solo acento (rojo clínico).
 *
 * El visual del hero es el mapa real de la red, no una ilustración.
 * Los números de cobertura salen del catálogo de centros cargado.
 */

import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bell,
  ChartLineUp,
  ClipboardText,
  FirstAid,
  MapPinLine,
  NavigationArrow,
  Phone,
  SquaresFour,
  Stethoscope,
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
    titulo: 'Seguí tu aviso',
    texto: 'La pantalla se actualiza sola cuando el centro confirma o te deriva a un especialista.',
  },
]

const RECORRIDO = [
  { quien: 'Paciente', que: 'Avisa desde el mapa, con o sin cuenta.' },
  { quien: 'Centro', que: 'Recibe el aviso, hace el triage y deriva.' },
  { quien: 'Médico', que: 'Atiende y cierra con diagnóstico.' },
  { quien: 'Historial', que: 'La atención queda guardada y se puede imprimir.' },
]

const COBERTURA = [
  { tipos: ['hospital'], label: 'Hospitales públicos' },
  { tipos: ['clinica'], label: 'Clínicas y sanatorios' },
  { tipos: ['upa'], label: 'Centros de atención primaria' },
  { tipos: ['same', 'bomberos', 'policia'], label: 'Bases de SAME, bomberos y policía' },
]

function Marca() {
  return (
    <>
      <span className="ui-brand__mark" aria-hidden="true"><FirstAid size={17} weight="bold" /></span>
      EmergenciaYA
    </>
  )
}

export default function Landing() {
  const { rol, usuario, esInvitado } = useAuth()
  const conCuenta = Boolean(usuario) && !esInvitado && ROLES[rol]

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-nav__inner">
          <Link to="/" className="ui-brand"><Marca /></Link>

          <nav className="landing-nav__links" aria-label="Secciones">
            <a href="#como-funciona" className="ui-nav__link">Cómo funciona</a>
            <a href="#instituciones" className="ui-nav__link">Para instituciones</a>
            <a href="#cobertura" className="ui-nav__link">Cobertura</a>
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
            <h1 id="hero-title" className="landing-hero__title">La guardia más cercana, en un toque.</h1>
            <p className="landing-hero__sub">
              Mirá qué centros de Posadas atienden ahora, a qué distancia estás y avisá que vas en camino.
            </p>
            <div className="landing-hero__ctas">
              <Link to="/mapa" className="ui-btn ui-btn--primary ui-btn--lg">
                Buscar guardia
                <ArrowRight size={18} />
              </Link>
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
            width="1200"
            height="896"
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

        <section className="landing-inst" id="instituciones" aria-labelledby="inst-title">
          <div className="landing-inst__head">
            <h2 id="inst-title" className="landing-h2">La guardia del centro, ordenada en una pantalla.</h2>
            <p className="landing-lead">
              Cada aviso entra a la bandeja del centro con su prioridad. Desde ahí se deriva al médico que está libre y queda medido.
            </p>
          </div>

          <div className="landing-bento">
            <article className="landing-tile landing-tile--ink">
              <SquaresFour size={26} />
              <h3>Bandeja de guardia en vivo</h3>
              <p>Avisos ordenados por prioridad, triage con notas y derivación al especialista disponible en ese momento.</p>
            </article>
            <article className="landing-tile landing-tile--tint">
              <ChartLineUp size={26} />
              <h3>Tablero con métricas por médico</h3>
              <p>Atenciones, casos en curso, tiempos de espera y de resolución, y a qué hora llega la demanda.</p>
            </article>
            <article className="landing-tile">
              <Stethoscope size={26} />
              <h3>Portal del médico</h3>
              <p>Cola de pacientes derivados, disponibilidad, ficha clínica y cierre con diagnóstico.</p>
            </article>
            <article className="landing-tile landing-tile--soft">
              <ClipboardText size={26} />
              <h3>Historial para el paciente</h3>
              <p>Diagnóstico e indicaciones de cada atención, con constancia para imprimir.</p>
            </article>
          </div>

          <ol className="landing-recorrido" aria-label="Recorrido de un aviso">
            {RECORRIDO.map((r) => (
              <li key={r.quien}>
                <strong>{r.quien}</strong>
                <span>{r.que}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-cobertura" id="cobertura" aria-labelledby="cobertura-title">
          <h2 id="cobertura-title" className="landing-h2">Posadas y Garupá, con direcciones verificadas.</h2>
          <dl className="landing-cobertura__grid">
            {COBERTURA.map(({ tipos, label }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="ui-mono">{CENTROS_DEFAULT_POSADAS.filter((c) => tipos.includes(c.tipo)).length}</dd>
              </div>
            ))}
          </dl>
          <p className="ui-help">Ubicaciones tomadas de OpenStreetMap.</p>
        </section>

        <section className="landing-cierre" aria-labelledby="cierre-title">
          <h2 id="cierre-title" className="landing-h2">¿Necesitás una guardia ahora?</h2>
          <p className="landing-lead">No hace falta crear una cuenta. Abrí el mapa y avisá que vas.</p>
          <Link to="/mapa" className="ui-btn ui-btn--primary ui-btn--lg">
            Buscar guardia
            <ArrowRight size={18} />
          </Link>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div>
            <span className="ui-brand"><Marca /></span>
            <p className="landing-footer__aviso">
              Ante un paro cardiorrespiratorio o un trauma grave, llamá primero al 107.
            </p>
          </div>
          <nav className="landing-footer__links" aria-label="Pie de página">
            <Link to="/mapa">Mapa de guardias</Link>
            <Link to="/ingreso">Ingresar</Link>
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#instituciones">Para instituciones</a>
          </nav>
        </div>
        <p className="landing-footer__copy">© {new Date().getFullYear()} EmergenciaYA, Misiones.</p>
      </footer>
    </div>
  )
}
