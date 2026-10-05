/**
 * Landing.jsx — Portada principal de EmergenciaYA.
 *
 * Diseñada siguiendo la skill design-taste-frontend:
 * - Lectura: Landing de salud y emergencias ciudadanas en Posadas, Misiones.
 * - Tono: Autoridad médica, calma en momentos de crisis, sin fricción, mobile-first.
 * - Hero 50/50 con fotografía real generada y badge de estado de guardia activa.
 * - Bento grid de 3 celdas con variación visual real.
 * - Líneas de emergencia directa (107, 911, 100).
 * - Acceso directo al mapa interactivo o al portal de ingreso.
 */

import { Link, useNavigate } from 'react-router-dom'
import { tieneSessionActiva } from '../api/auth.js'

export default function Landing() {
  const navigate = useNavigate()
  const sesionActiva = tieneSessionActiva()

  const handleCtaPrincipal = () => {
    if (sesionActiva) {
      navigate('/mapa')
    } else {
      navigate('/ingreso')
    }
  }

  return (
    <div className="landing-page">
      {/* ── Barra de Navegación ── */}
      <header className="landing-nav" role="banner">
        <div className="landing-nav-inner">
          <Link to="/" className="landing-brand">
            <span className="landing-brand-icon" aria-hidden="true">🚨</span>
            <span className="landing-brand-text">EmergenciaYA</span>
          </Link>

          <div className="landing-nav-status">
            <span className="landing-pulse-dot" aria-hidden="true" />
            <span className="landing-status-text">Guardias activas en Posadas</span>
          </div>

          <div className="landing-nav-actions">
            <a href="#como-funciona" className="nav-link desktop-only">
              Cómo funciona
            </a>
            <a href="#telefonos" className="nav-link desktop-only">
              Líneas 107
            </a>
            <button
              type="button"
              className="btn btn--nav-cta"
              onClick={handleCtaPrincipal}
            >
              {sesionActiva ? 'Ir al mapa' : 'Buscar guardias'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero Section (Split 50/50, fits initial viewport) ── */}
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="landing-hero-container">
          <div className="landing-hero-content">
            <span className="hero-eyebrow">
              RED DE EMERGENCIAS · POSADAS
            </span>

            <h1 id="hero-title" className="hero-headline">
              Atención médica urgente en Posadas, sin demoras.
            </h1>

            <p className="hero-subtext">
              Localizá guardias en tiempo real, avisá que vas en camino y recibí asistencia inmediata sin registrarte.
            </p>

            <div className="hero-actions">
              <button
                type="button"
                className="btn btn--hero-primary"
                onClick={handleCtaPrincipal}
              >
                <span>🚨 Acceder a la guardia ahora</span>
              </button>

              <Link to="/mapa" className="btn btn--hero-secondary">
                <span>Ver mapa en vivo</span>
              </Link>
            </div>

            <div className="hero-trust-badges">
              <span className="trust-pill">⚡ Sin esperas de registro</span>
              <span className="trust-pill">📍 Geolocalización precisa</span>
              <span className="trust-pill">⏰ Cobertura 24 horas</span>
            </div>
          </div>

          <div className="landing-hero-media">
            <div className="hero-image-wrapper">
              <img
                src="/hero-emergencia.jpg"
                alt="Centro de atención de emergencias médicas de guardia en Posadas"
                className="hero-image"
                loading="eager"
              />
              <div className="hero-badge-overlay">
                <span className="badge-live-dot" />
                <div>
                  <strong>SAMIC Madariaga y Red 107</strong>
                  <p>Recepción médica y triage coordinado</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Franja de Instituciones de Salud ── */}
      <section className="instituciones-strip" aria-label="Centros conectados a la red">
        <div className="strip-container">
          <p className="strip-title">Centros de guardia integrados:</p>
          <div className="strip-items">
            <span className="strip-item">Hospital SAMIC Madariaga</span>
            <span className="strip-separator">·</span>
            <span className="strip-item">Hospital de Pediatría Fernando Barreyro</span>
            <span className="strip-separator">·</span>
            <span className="strip-item">Hospital Materno Neonatal</span>
            <span className="strip-separator">·</span>
            <span className="strip-item">Red de Traslados 107</span>
            <span className="strip-separator">·</span>
            <span className="strip-item">UPAs y CAPS de Posadas</span>
          </div>
        </div>
      </section>

      {/* ── Bento Grid: Capacidades en Situación de Crisis (3 celdas) ── */}
      <section className="landing-bento-section" id="servicios" aria-labelledby="bento-title">
        <div className="landing-section-header">
          <h2 id="bento-title" className="section-headline">
            Tecnología diseñada para cuando cada segundo cuenta
          </h2>
          <p className="section-subtext">
            Una plataforma pensada para usarse desde el celular en situaciones de alto estrés: simple, rápida y confiable.
          </p>
        </div>

        <div className="bento-grid">
          {/* Celda 1: Proximidad con Haversine */}
          <article className="bento-card bento-card--featured">
            <div className="bento-card-icon" aria-hidden="true">📍</div>
            <div className="bento-card-body">
              <h3 className="bento-card-title">Cálculo de cercanía en tiempo real</h3>
              <p className="bento-card-desc">
                Algoritmo de Haversine integrado con OpenStreetMap que detecta tu posición y prioriza las guardias con menor tiempo de traslado.
              </p>
            </div>
            <div className="bento-card-visual-pill">
              <span>Distancias exactas en km · Posadas, Misiones</span>
            </div>
          </article>

          {/* Celda 2: Alerta previa a la guardia */}
          <article className="bento-card bento-card--accent">
            <div className="bento-card-icon" aria-hidden="true">🚨</div>
            <div className="bento-card-body">
              <h3 className="bento-card-title">Aviso de "Voy en camino"</h3>
              <p className="bento-card-desc">
                Notificá al equipo médico antes de llegar para que el sector de triage anticipe los recursos necesarios según tu urgencia.
              </p>
            </div>
            <div className="bento-card-visual-pill bento-card-visual-pill--white">
              <span>Modo aviso urgente con 1 toque</span>
            </div>
          </article>

          {/* Celda 3: Acceso sin barreras ni registro previo */}
          <article className="bento-card bento-card--neutral">
            <div className="bento-card-icon" aria-hidden="true">⚡</div>
            <div className="bento-card-body">
              <h3 className="bento-card-title">Modo Invitado instantáneo</h3>
              <p className="bento-card-desc">
                No te pedimos crear contraseña ni validar correos electrónicos cuando necesitás ayuda. Entrá con Google o como invitado con token temporal.
              </p>
            </div>
            <div className="bento-card-visual-pill">
              <span>Autenticación en Redis con TTL de 2 horas</span>
            </div>
          </article>
        </div>
      </section>

      {/* ── Protocolo de Atención en 3 Pasos ── */}
      <section className="landing-protocolo-section" id="como-funciona" aria-labelledby="protocolo-title">
        <div className="protocolo-container">
          <div className="protocolo-media">
            <img
              src="/triage-consulta.jpg"
              alt="Personal médico asistiendo en el triage de emergencias"
              className="protocolo-image"
              loading="lazy"
            />
            <div className="protocolo-media-tag">
              <span>🩺 Triage hospitalario coordinado</span>
            </div>
          </div>

          <div className="protocolo-info">
            <span className="hero-eyebrow">
              PROTOCOLO DE URGENCIA
            </span>

            <h2 id="protocolo-title" className="section-headline">
              Cómo pedir atención inmediata desde tu celular
            </h2>

            <ol className="protocolo-steps">
              <li className="protocolo-step">
                <div className="step-num">1</div>
                <div>
                  <h4 className="step-title">Encontrá el centro adecuado</h4>
                  <p className="step-desc">
                    El mapa te muestra hospitales, UPAs, ambulancias y bomberos más cercanos con teléfono directo y estado 24 horas.
                  </p>
                </div>
              </li>

              <li className="protocolo-step">
                <div className="step-num">2</div>
                <div>
                  <h4 className="step-title">Avisá tu llegada o solicitá guardia</h4>
                  <p className="step-desc">
                    Ingresá un motivo breve de hasta 200 caracteres para orientar a los profesionales de la salud.
                  </p>
                </div>
              </li>

              <li className="protocolo-step">
                <div className="step-num">3</div>
                <div>
                  <h4 className="step-title">Seguimiento en tiempo real</h4>
                  <p className="step-desc">
                    La pantalla se actualiza automáticamente cuando el centro acepta tu solicitud, indicándote instrucciones de recepción.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* ── Franja de Teléfonos de Emergencia (Líneas de Vida) ── */}
      <section className="lineas-vida-section" id="telefonos" aria-label="Números de teléfono de emergencia">
        <div className="lineas-container">
          <div className="lineas-header">
            <h3 className="lineas-titulo">Llamadas telefónicas de auxilio inmediato</h3>
            <p className="lineas-desc">Si hay riesgo inminente de vida, comunicate por teléfono mientras te dirigís al centro:</p>
          </div>

          <div className="lineas-grid">
            <a href="tel:107" className="linea-card linea-card--same">
              <span className="linea-num">107</span>
              <div>
                <strong>Emergencias Médicas (SAME)</strong>
                <p>Ambulancias y asistencia en vía pública</p>
              </div>
            </a>

            <a href="tel:911" className="linea-card linea-card--policia">
              <span className="linea-num">911</span>
              <div>
                <strong>Emergencias Policiales</strong>
                <p>Comando radioeléctrico Misiones</p>
              </div>
            </a>

            <a href="tel:100" className="linea-card linea-card--bomberos">
              <span className="linea-num">100</span>
              <div>
                <strong>Bomberos Voluntarios</strong>
                <p>Rescate y siniestros urbanos</p>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* ── CTA Final de Alto Impacto ── */}
      <section className="landing-cta-final" aria-labelledby="cta-final-title">
        <div className="cta-final-container">
          <span className="cta-icon-pulse" aria-hidden="true">🚨</span>
          <h2 id="cta-final-title" className="cta-final-headline">
            No pierdas tiempo buscando guardias a ciegas
          </h2>
          <p className="cta-final-subtext">
            Ingresá a la plataforma ahora y conectate con el centro de salud más próximo a tu ubicación.
          </p>
          <button
            type="button"
            className="btn btn--hero-primary btn--cta-grande"
            onClick={handleCtaPrincipal}
          >
            <span>Acceder a la guardia ahora</span>
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer" role="contentinfo">
        <div className="footer-container">
          <div className="footer-top">
            <div className="footer-brand">
              <span className="footer-logo">🚨 EmergenciaYA</span>
              <p className="footer-desc">
                Sistema ágil de geolocalización y aviso de urgencias médicas para Posadas y la provincia de Misiones.
              </p>
            </div>

            <div className="footer-links">
              <div className="footer-col">
                <strong>Navegación</strong>
                <Link to="/mapa">Mapa de Centros</Link>
                <Link to="/ingreso">Acceso Usuarios / Invitados</Link>
                <a href="#como-funciona">Protocolo de Emergencia</a>
              </div>

              <div className="footer-col">
                <strong>Emergencias</strong>
                <a href="tel:107">Línea 107 (SAME)</a>
                <a href="tel:911">Línea 911 (Policía)</a>
                <a href="tel:100">Línea 100 (Bomberos)</a>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <p>© {new Date().getFullYear()} EmergenciaYA. Desarrollado para la comunidad de Misiones.</p>
            <p className="footer-aviso-legal">
              Aviso: En situaciones de paro cardiorrespiratorio o trauma severo, llamá primero al 107.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
