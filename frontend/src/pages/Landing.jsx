/**
 * Landing.jsx - Portada de EmergenciAPP, contada con el scroll.
 *
 * Sigue el manual de identidad (carpeta /manual): Tinta Noche y fondos claros,
 * Rojo Señal sólo como acento, Sora para títulos e Inter para texto, y la voz
 * clara, calma y cercana.
 *
 * El recorrido:
 *   1. Hero fijo: "Emergencia" se transforma en "EmergenciAPP" y se arma el logo.
 *   2. Líneas directas, siempre a mano.
 *   3. "Para cada emergencia": cuatro situaciones y quién responde en cada una.
 *   4. Cómo funciona: la pantalla de la app acompaña los cuatro pasos.
 *   5. Para instituciones, cobertura (con el mapa real) y cierre.
 *
 * Los números de cobertura salen del catálogo de centros cargado.
 */

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Ambulance,
  ArrowRight,
  CaretDoubleDown,
  ChartLineUp,
  ClipboardText,
  Clock,
  FireTruck,
  FirstAidKit,
  Hospital,
  Phone,
  SquaresFour,
  Stethoscope,
  Warning,
} from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext.jsx'
import { CENTROS_DEFAULT_POSADAS } from '../api/centros.js'
import { ROLES } from '../utils/roles.js'
import useEscenas from '../hooks/useEscenas.js'
import Logo from '../components/Logo.jsx'
import MapaPreview from '../components/MapaPreview.jsx'
import TelefonoDemo from '../components/TelefonoDemo.jsx'

const cuantos = (...tipos) => CENTROS_DEFAULT_POSADAS.filter((c) => tipos.includes(c.tipo)).length

// Tramos del scroll del hero (0 a 1) en los que se mueve cada pieza
const PISTAS = {
  hero: {
    intro: [0.02, 0.12, 'out'],
    sale: [0.1, 0.2, 'in'],
    entra: [0.2, 0.32, 'out'],
    crece: [0.14, 0.44, 'inOut'],
    p1: [0.28, 0.4, 'rebote'],
    p2: [0.34, 0.46, 'rebote'],
    onda: [0.22, 0.6, 'out'],
    iso: [0.44, 0.58, 'rebote'],
    pin: [0.52, 0.66, 'rebote'],
    cruz: [0.62, 0.72, 'out'],
    lema: [0.68, 0.82],
    cta: [0.8, 0.9, 'out'],
  },
  recorrido: { linea: [0, 1] },
}

const LEMA = ['Una', 'app', 'para', 'cada', 'emergencia.']

const LINEAS = [
  { numero: '107', nombre: 'SAME', detalle: 'Ambulancias y emergencias médicas' },
  { numero: '911', nombre: 'Policía', detalle: 'Emergencias policiales en Misiones' },
  { numero: '100', nombre: 'Bomberos', detalle: 'Incendios, rescates y accidentes' },
]

const CASOS = [
  {
    frase: 'Un dolor en el pecho.',
    icon: Hospital,
    quien: 'Hospitales y sanatorios',
    texto: 'Las guardias que atienden las 24 horas, ordenadas por distancia.',
    dato: cuantos('hospital', 'clinica'),
    unidad: 'guardias en la red',
  },
  {
    frase: 'Fiebre a la madrugada.',
    icon: FirstAidKit,
    quien: 'Atención primaria',
    texto: 'CAPS y UPA para lo que no puede esperar a mañana.',
    dato: cuantos('upa'),
    unidad: 'centros cerca de casa',
  },
  {
    frase: 'Un choque en la ruta.',
    icon: Ambulance,
    quien: 'SAME y policía',
    texto: 'Las bases más cercanas y la línea directa, a un toque.',
    dato: cuantos('same', 'policia'),
    unidad: 'bases en el mapa',
    tel: '107',
  },
  {
    frase: 'Humo en la casa de al lado.',
    icon: FireTruck,
    quien: 'Bomberos',
    texto: 'Los cuarteles de la zona, con su teléfono a la vista.',
    dato: cuantos('bomberos'),
    unidad: 'cuarteles en el mapa',
    tel: '100',
  },
]

const PASOS = [
  {
    titulo: 'Elegí el centro',
    texto: 'El mapa ordena las guardias por distancia y muestra cuáles atienden las 24 horas.',
  },
  {
    titulo: 'Avisá que vas',
    texto: 'Contá en una línea qué te pasa. La guardia lo recibe antes de que llegues.',
  },
  {
    titulo: 'Seguí tu aviso',
    texto: 'La pantalla se actualiza sola cuando el centro confirma o te deriva a un especialista.',
  },
  {
    titulo: 'Queda en tu historial',
    texto: 'El diagnóstico y las indicaciones de cada atención, con constancia para imprimir.',
  },
]

const RECORRIDO = [
  { quien: 'Paciente', que: 'Avisa desde el mapa, con o sin cuenta.' },
  { quien: 'Centro', que: 'Recibe el aviso, hace el triage y deriva.' },
  { quien: 'Médico', que: 'Atiende y cierra con diagnóstico.' },
  { quien: 'Historial', que: 'La atención queda guardada y se puede imprimir.' },
]

const COBERTURA = [
  { valor: cuantos('hospital'), label: 'Hospitales públicos' },
  { valor: cuantos('clinica'), label: 'Clínicas y sanatorios' },
  { valor: cuantos('upa'), label: 'Centros de atención primaria' },
  { valor: cuantos('same', 'bomberos', 'policia'), label: 'Bases de SAME, bomberos y policía' },
]

/** Número que cuenta desde cero la primera vez que entra en pantalla. */
function Cuenta({ valor }) {
  const ref = useRef(null)
  const [n, setN] = useState(valor)

  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    let cuadro = 0
    setN(0)
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return
      io.disconnect()
      const inicio = performance.now()
      const paso = (ahora) => {
        const t = Math.min(1, (ahora - inicio) / 900)
        setN(Math.round(valor * (1 - (1 - t) ** 3)))
        if (t < 1) cuadro = requestAnimationFrame(paso)
      }
      cuadro = requestAnimationFrame(paso)
    }, { threshold: 0.6 })
    io.observe(el)

    return () => {
      io.disconnect()
      cancelAnimationFrame(cuadro)
    }
  }, [valor])

  return <span ref={ref}>{n}</span>
}

export default function Landing() {
  const { rol, usuario, esInvitado } = useAuth()
  const conCuenta = Boolean(usuario) && !esInvitado && ROLES[rol]

  const raiz = useRef(null)
  const palabra = useRef(null)
  const [noche, setNoche] = useState(true)
  const [heroListo, setHeroListo] = useState(false)
  const [caso, setCaso] = useState(0)
  const [paso, setPaso] = useState(0)

  useEscenas(raiz, {
    pistas: PISTAS,
    onTono: setNoche,
    onPaso: (escena, n) => {
      if (escena === 'hero') setHeroListo(n >= 8)
      if (escena === 'casos') setCaso(n)
    },
  })

  // La cola de la palabra pasa del ancho de la "a" al de "APP": se miden con la fuente ya cargada
  useEffect(() => {
    const el = palabra.current
    if (!el) return undefined
    const medir = () => {
      el.style.setProperty('--wa', `${el.querySelector('.hw__a-in').offsetWidth}px`)
      el.style.setProperty('--wapp', `${el.querySelector('.hw__app').offsetWidth}px`)
    }
    medir()
    document.fonts?.ready.then(medir)
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])

  // El paso activo de "Cómo funciona" es el que cruza el centro de la pantalla
  useEffect(() => {
    if (!raiz.current || !('IntersectionObserver' in window)) return undefined
    // En el celular la pantalla de la app queda fija arriba: la línea de corte baja
    const movil = window.matchMedia('(max-width: 899px)').matches
    const io = new IntersectionObserver(
      (entradas) => entradas.forEach((en) => en.isIntersecting && setPaso(Number(en.target.dataset.paso))),
      { rootMargin: movil ? '-64% 0px -36% 0px' : '-50% 0px -50% 0px' },
    )
    raiz.current.querySelectorAll('.como__paso').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="landing" ref={raiz}>
      <header className={`lnav${noche ? ' lnav--noche' : ''}`}>
        <div className="lnav__inner">
          <Link to="/" className="lnav__marca" aria-label="EmergenciAPP, inicio">
            <Logo size={30} sobre={noche ? 'noche' : 'claro'} nameClass="lnav__nombre" />
          </Link>

          <nav className="lnav__links" aria-label="Secciones">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#instituciones">Para instituciones</a>
            <a href="#cobertura">Cobertura</a>
          </nav>

          <div className="lnav__acciones">
            {conCuenta ? (
              <Link to={ROLES[rol].inicio} className="ea-btn ea-btn--sm ea-btn--texto">{ROLES[rol].destino}</Link>
            ) : (
              <Link to="/ingreso" className="ea-btn ea-btn--sm ea-btn--texto">Ingresar</Link>
            )}
            <Link to="/mapa" className="ea-btn ea-btn--sm ea-btn--rojo">Buscar guardia</Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── 1. Emergencia → EmergenciAPP ── */}
        <section
          className="hero"
          data-escena="hero"
          data-tono="noche"
          data-quieto="final"
          data-pasos="10"
          aria-labelledby="hero-title"
        >
          <div className="hero__fija">
            <svg className="hero__fondo" viewBox="0 0 96 96" aria-hidden="true" focusable="false">
              <path d="M48 84C48 84 22 60 22 40a26 26 0 0 1 52 0C74 60 48 84 48 84Z" fill="none" stroke="#1D2E48" strokeWidth="1.2" />
              <rect x="44" y="26" width="8" height="28" rx="2" fill="#16253B" />
              <rect x="34" y="36" width="28" height="8" rx="2" fill="#16253B" />
            </svg>
            <div className="hero__brillo" aria-hidden="true" />

            <div className="hero__centro">
              <svg className="hero__iso" viewBox="0 0 96 96" aria-hidden="true" focusable="false">
                <rect className="hero__iso-app" width="96" height="96" rx="22" fill="#D9252B" />
                <path className="hero__iso-pin" d="M48 84C48 84 22 60 22 40a26 26 0 0 1 52 0C74 60 48 84 48 84Z" fill="#FFFFFF" />
                <rect className="hero__iso-cruz hero__iso-cruz--v" x="44" y="26" width="8" height="28" rx="2" fill="#D9252B" />
                <rect className="hero__iso-cruz hero__iso-cruz--h" x="34" y="36" width="28" height="8" rx="2" fill="#D9252B" />
              </svg>

              <h1 id="hero-title" className="hw" ref={palabra}>
                <span className="ea-sr">EmergenciAPP. Una app para cada emergencia.</span>
                <span className="hw__linea" aria-hidden="true">
                  {'Emergenci'.split('').map((letra, i) => (
                    <span className="hw__ch" style={{ '--i': i }} key={i}>{letra}</span>
                  ))}
                  <span className="hw__cola">
                    <span className="hw__onda" />
                    <span className="hw__onda hw__onda--2" />
                    <span className="hw__a" style={{ '--i': 9 }}><span className="hw__a-in">a</span></span>
                    <span className="hw__app">
                      <span className="hw__A">A</span>
                      <span className="hw__p hw__p--1">P</span>
                      <span className="hw__p hw__p--2">P</span>
                    </span>
                  </span>
                </span>
              </h1>

              <div className="hero__bajo">
                <p className="hero__previa">Cuando pasa, cada minuto cuenta.</p>
                <p className="hero__lema" aria-hidden="true">
                  {LEMA.map((w, i) => (
                    <span style={{ '--i': i }} key={w}>{w}</span>
                  ))}
                </p>
              </div>

              <div className={`hero__ctas${heroListo ? ' is-lista' : ''}`}>
                <Link to="/mapa" className="ea-btn ea-btn--lg ea-btn--rojo">
                  Buscar guardia
                  <ArrowRight size={20} weight="bold" />
                </Link>
                <a href="tel:107" className="ea-btn ea-btn--lg ea-btn--claro">
                  <Phone size={20} weight="bold" />
                  Llamar al 107
                </a>
              </div>
            </div>

            <p className="hero__pista" aria-hidden="true">
              Deslizá
              <CaretDoubleDown size={18} weight="bold" />
            </p>
          </div>
        </section>

        {/* ── 2. Líneas directas ── */}
        <section className="lineas" aria-label="Líneas de emergencia">
          <div className="lineas__inner">
            <p className="lineas__intro" data-revela>Si hay riesgo de vida, llamá antes de salir.</p>
            <div className="lineas__fila">
              {LINEAS.map((l, i) => (
                <a key={l.numero} href={`tel:${l.numero}`} className="linea" data-revela style={{ '--i': i }}>
                  <span className="linea__num">{l.numero}</span>
                  <span>
                    <strong>{l.nombre}</strong>
                    <span className="linea__det">{l.detalle}</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── 3. Para cada emergencia ── */}
        <section className="casos" data-escena="casos" data-pasos={CASOS.length} aria-labelledby="casos-title">
          <div className="casos__fija">
            <div className="casos__inner">
              <div className="casos__texto">
                <h2 id="casos-title" className="ea-etiqueta">Una app para cada emergencia</h2>
                <ol className="casos__lista">
                  {CASOS.map((c, i) => (
                    <li key={c.frase} className={`caso${i === caso ? ' is-activo' : ''}`}>
                      <p className="caso__frase">{c.frase}</p>
                      <div className="caso__resp">
                        <p className="caso__dato">
                          <span>{c.dato}</span>
                          {c.unidad}
                        </p>
                        <h3>{c.quien}</h3>
                        <p className="caso__texto">{c.texto}</p>
                        {c.tel && (
                          <a href={`tel:${c.tel}`} className="caso__tel" tabIndex={i === caso ? 0 : -1}>
                            <Phone size={18} weight="bold" />
                            Llamar al {c.tel}
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="casos__marcas" aria-hidden="true">
                  {CASOS.map((c, i) => (
                    <i key={c.frase} className={i <= caso ? 'is-hecha' : ''} />
                  ))}
                  <span>{caso + 1} de {CASOS.length}</span>
                </div>
              </div>

              <div className="casos__visual" aria-hidden="true">
                <span className="casos__suelo" />
                <span className="casos__suelo casos__suelo--2" />
                <div className="casos__pin" key={caso}>
                  <svg viewBox="16 8 64 80" focusable="false">
                    <path d="M48 84C48 84 22 60 22 40a26 26 0 0 1 52 0C74 60 48 84 48 84Z" fill="#D9252B" />
                  </svg>
                  {CASOS.map((c, i) => (
                    <c.icon key={c.frase} className={i === caso ? 'is-activo' : ''} weight="fill" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 4. Cómo funciona ── */}
        <section className="como" id="como-funciona" aria-labelledby="como-title">
          <div className="como__inner">
            <div className="como__visual">
              <TelefonoDemo paso={paso} />
            </div>

            <div className="como__relato">
              <header className="como__cabeza" data-revela>
                <p className="ea-etiqueta">Cómo funciona</p>
                <h2 id="como-title" className="ea-display">Sin registro y sin llamar para preguntar.</h2>
              </header>
              <ol className="como__pasos">
                {PASOS.map((p, i) => (
                  <li key={p.titulo} className={`como__paso${i === paso ? ' is-activo' : ''}`} data-paso={i}>
                    <span className="como__num">{String(i + 1).padStart(2, '0')}</span>
                    <h3>{p.titulo}</h3>
                    <p>{p.texto}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ── 5. Para instituciones ── */}
        <section className="inst" id="instituciones" aria-labelledby="inst-title">
          <div className="inst__inner">
            <header className="inst__cabeza" data-revela>
              <p className="ea-etiqueta">Para instituciones</p>
              <h2 id="inst-title" className="ea-display">La guardia del centro, ordenada en una pantalla.</h2>
              <p className="ea-bajada">
                Cada aviso entra a la bandeja del centro con su prioridad. Desde ahí se deriva al médico que está libre y queda medido.
              </p>
            </header>

            <div className="bento">
              <article className="tile tile--noche" data-revela style={{ '--i': 0 }}>
                <div className="tile__bandeja" aria-hidden="true">
                  <div className="ea-estado ea-estado--urgente" style={{ '--j': 0 }}><Warning size={20} weight="bold" /> Pedido urgente</div>
                  <div className="ea-estado ea-estado--espera" style={{ '--j': 1 }}><Clock size={20} weight="bold" /> En espera</div>
                  <div className="ea-estado ea-estado--camino" style={{ '--j': 2 }}><ArrowRight size={20} weight="bold" /> En camino</div>
                </div>
                <SquaresFour size={28} />
                <h3>Bandeja de guardia en vivo</h3>
                <p>Avisos ordenados por prioridad, triage con notas y derivación al especialista disponible en ese momento.</p>
              </article>
              <article className="tile tile--ancha" data-revela style={{ '--i': 1 }}>
                <ChartLineUp size={28} />
                <h3>Tablero con métricas por médico</h3>
                <p>Atenciones, casos en curso, tiempos de espera y de resolución, y a qué hora llega la demanda.</p>
              </article>
              <article className="tile" data-revela style={{ '--i': 2 }}>
                <Stethoscope size={28} />
                <h3>Portal del médico</h3>
                <p>Cola de pacientes derivados, disponibilidad, ficha clínica y cierre con diagnóstico.</p>
              </article>
              <article className="tile" data-revela style={{ '--i': 3 }}>
                <ClipboardText size={28} />
                <h3>Historial para el paciente</h3>
                <p>Diagnóstico e indicaciones de cada atención, con constancia para imprimir.</p>
              </article>
            </div>

            <ol className="recorrido" data-escena="recorrido" data-modo="cruce" data-quieto="final" aria-label="Recorrido de un aviso">
              {RECORRIDO.map((r, i) => (
                <li key={r.quien} style={{ '--i': i }}>
                  <strong>{r.quien}</strong>
                  <span>{r.que}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── 6. Cobertura ── */}
        <section className="cobertura" id="cobertura" aria-labelledby="cobertura-title">
          <div className="cobertura__inner">
            <div className="cobertura__texto">
              <header data-revela>
                <p className="ea-etiqueta">Cobertura</p>
                <h2 id="cobertura-title" className="ea-display">Posadas y Garupá, con direcciones verificadas.</h2>
              </header>
              <dl className="cobertura__cifras">
                {COBERTURA.map(({ valor, label }, i) => (
                  <div key={label} data-revela style={{ '--i': i }}>
                    <dt>{label}</dt>
                    <dd><Cuenta valor={valor} /></dd>
                  </div>
                ))}
              </dl>
              <p className="cobertura__fuente">Ubicaciones tomadas de OpenStreetMap.</p>
            </div>

            <figure className="cobertura__mapa" data-revela>
              <MapaPreview />
              <figcaption>
                <span><i className="punto punto--salud" /> Hospitales, sanatorios y CAPS</span>
                <span><i className="punto punto--otro" /> Bomberos y policía</span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ── 7. Cierre ── */}
        <section className="cierre" data-tono="noche" aria-labelledby="cierre-title">
          <svg className="cierre__fondo" viewBox="0 0 96 96" aria-hidden="true" focusable="false">
            <path d="M48 84C48 84 22 60 22 40a26 26 0 0 1 52 0C74 60 48 84 48 84Z" fill="none" stroke="#1D2E48" strokeWidth="1.2" />
            <rect x="44" y="26" width="8" height="28" rx="2" fill="#16253B" />
            <rect x="34" y="36" width="28" height="8" rx="2" fill="#16253B" />
          </svg>
          <div className="cierre__inner" data-revela>
            <h2 id="cierre-title">¿Necesitás atención?</h2>
            <p>No hace falta crear una cuenta. Abrí el mapa y avisá que vas.</p>
            <div className="cierre__ctas">
              <Link to="/mapa" className="ea-btn ea-btn--lg ea-btn--rojo">
                Buscar guardia
                <ArrowRight size={20} weight="bold" />
              </Link>
              <a href="tel:107" className="ea-btn ea-btn--lg ea-btn--claro">
                <Phone size={20} weight="bold" />
                Llamar al 107
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="pie">
        <div className="pie__inner">
          <div>
            <Logo size={32} sobre="noche" />
            <p className="pie__lema">Cada emergencia en una app.</p>
            <p className="pie__aviso">Ante un paro cardiorrespiratorio o un trauma grave, llamá primero al 107.</p>
          </div>
          <nav className="pie__links" aria-label="Pie de página">
            <Link to="/mapa">Mapa de guardias</Link>
            <Link to="/ingreso">Ingresar</Link>
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#instituciones">Para instituciones</a>
          </nav>
        </div>
        <div className="pie__base">
          <div className="pie__barras" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          <p>© {new Date().getFullYear()} EmergenciAPP, Misiones.</p>
        </div>
      </footer>
    </div>
  )
}
