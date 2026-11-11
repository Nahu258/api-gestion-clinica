/**
 * HojaAtencion - Constancia de una atención, pensada para pantalla y papel.
 *
 * La usan el detalle de la consulta del paciente, el seguimiento (cuando la
 * atención terminó) y la impresión del historial completo. En papel cada
 * hoja evita cortarse entre páginas (ver styles/print.css).
 *
 *   <HojaAtencion atencion={solicitud} paciente="Camila Benítez" />
 */

import { FirstAid } from '@phosphor-icons/react'
import { duracion, estadoDe, etiquetaPrioridad, fechaLarga, hora, minutosEntre } from '../utils/solicitudes.js'

export default function HojaAtencion({ atencion: a, paciente, compacta = false }) {
  const estado = estadoDe(a.estado)
  const nombre = paciente || a.paciente_nombre || a.nombre_invitado || 'Paciente'
  const total = minutosEntre(a.creado_en, a.atendido_en)

  const pasos = [
    { label: 'Aviso enviado', fecha: a.creado_en },
    { label: 'Derivación a especialista', fecha: a.fecha_derivacion },
    { label: 'Atención finalizada', fecha: a.atendido_en },
  ].filter((p) => p.fecha)

  return (
    <article className={`hoja${compacta ? ' hoja--compacta' : ''}`}>
      <header className="hoja__cabecera">
        <span className="ui-brand">
          <span className="ui-brand__mark" aria-hidden="true"><FirstAid size={17} weight="bold" /></span>
          EmergenciaYA
        </span>
        <span className="hoja__numero ui-mono">Atención N.º {a.id}</span>
      </header>

      <div className="hoja__titulo">
        <h2>{a.centro_nombre || 'Centro de salud'}</h2>
        <p>
          {fechaLarga(a.atendido_en || a.creado_en)}
          {a.centro_direccion ? `, ${a.centro_direccion}` : ''}
        </p>
      </div>

      <dl className="hoja__datos">
        <div>
          <dt>Paciente</dt>
          <dd>{nombre}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{a.estado_legible || estado.label}</dd>
        </div>
        {a.medico_nombre && (
          <div>
            <dt>Profesional</dt>
            <dd>{a.medico_nombre}</dd>
          </div>
        )}
        {a.especialidad_nombre && (
          <div>
            <dt>Especialidad</dt>
            <dd>{a.especialidad_nombre}</dd>
          </div>
        )}
        {a.prioridad && a.fecha_derivacion && (
          <div>
            <dt>Prioridad de triage</dt>
            <dd>{etiquetaPrioridad(a.prioridad)}</dd>
          </div>
        )}
        {total != null && (
          <div>
            <dt>Tiempo total</dt>
            <dd className="ui-mono">{duracion(total)}</dd>
          </div>
        )}
      </dl>

      <section className="hoja__bloque">
        <h3>Motivo de consulta</h3>
        <p>{a.motivo || 'Ingreso general de guardia, sin motivo informado.'}</p>
      </section>

      {a.observaciones_triage && (
        <section className="hoja__bloque">
          <h3>Notas de triage</h3>
          <p>{a.observaciones_triage}</p>
        </section>
      )}

      {a.diagnostico && (
        <section className="hoja__bloque hoja__bloque--dx">
          <h3>Diagnóstico</h3>
          <p>{a.diagnostico}</p>
        </section>
      )}

      {a.indicaciones && (
        <section className="hoja__bloque">
          <h3>Indicaciones y pautas de alarma</h3>
          <p>{a.indicaciones}</p>
        </section>
      )}

      {!compacta && pasos.length > 1 && (
        <section className="hoja__bloque">
          <h3>Recorrido</h3>
          <ol className="hoja__pasos">
            {pasos.map((p) => (
              <li key={p.label}>
                <span className="ui-mono">{hora(p.fecha)} h</span>
                {p.label}
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="hoja__pie">
        Constancia emitida por EmergenciaYA el {fechaLarga(new Date())}. No reemplaza la historia clínica del centro.
      </footer>
    </article>
  )
}
