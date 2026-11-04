/**
 * GestionInicio.jsx - Portada de la gestión de la institución.
 *
 * Accesos a cada sección de configuración del centro.
 */

import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDots, FirstAidKit, Stethoscope } from '@phosphor-icons/react'
import { useCentroGestion } from './GestionLayout.jsx'

const SECCIONES = [
  {
    seccion: 'especialidades',
    titulo: 'Especialidades',
    texto: 'Qué especialidades ofrece el centro y cuáles aparecen en la derivación.',
    icon: FirstAidKit,
  },
  {
    seccion: 'medicos',
    titulo: 'Médicos',
    texto: 'Registrar médicos, asignarles especialidades y darlos de baja.',
    icon: Stethoscope,
  },
  {
    seccion: 'guardias',
    titulo: 'Guardias',
    texto: 'Cronograma semanal de guardias y cobertura por especialidad.',
    icon: CalendarDots,
  },
]

export default function GestionInicio() {
  const { ruta, centroNombre } = useCentroGestion()

  return (
    <>
      <div className="ui-pagehead">
        <div>
          <h1 className="ui-pagehead__title">Gestión de la institución</h1>
          <div className="ui-pagehead__meta">
            <span>{centroNombre ? `Configuración de ${centroNombre}.` : 'Configuración del centro.'}</span>
          </div>
        </div>
      </div>

      <div className="ui-tiles">
        {SECCIONES.map(({ seccion, titulo, texto, icon: Icon }) => (
          <Link key={seccion} to={ruta(seccion)} className="ui-card ui-tile">
            <span className="ui-icon-tile" aria-hidden="true"><Icon size={18} /></span>
            <span className="ui-tile__title">{titulo}</span>
            <span className="ui-tile__text">{texto}</span>
            <span className="ui-tile__cta">Abrir <ArrowRight size={14} /></span>
          </Link>
        ))}
      </div>
    </>
  )
}
