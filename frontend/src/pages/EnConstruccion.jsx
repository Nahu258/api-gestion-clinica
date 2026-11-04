/**
 * EnConstruccion - Placeholder de las secciones de consola que todavía no
 * tienen pantalla propia (se reemplaza en cada issue de la Épica 5).
 */

import { Wrench } from '@phosphor-icons/react'

export default function EnConstruccion({ titulo, texto = 'Esta sección todavía no está disponible.' }) {
  return (
    <>
      <div className="ui-pagehead">
        <h1 className="ui-pagehead__title">{titulo}</h1>
      </div>
      <div className="ui-card">
        <div className="ui-empty">
          <div className="ui-empty__icon"><Wrench size={22} /></div>
          <p className="ui-empty__title">Próximamente</p>
          <p className="ui-empty__text">{texto}</p>
        </div>
      </div>
    </>
  )
}
