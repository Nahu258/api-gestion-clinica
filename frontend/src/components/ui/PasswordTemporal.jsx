/**
 * PasswordTemporal - Muestra una contraseña generada UNA sola vez, con botón para copiarla.
 *
 * El componente no guarda la contraseña en ningún lado: cuando el modal que
 * lo contiene se cierra, se pierde (criterio de AE5-09).
 */

import { useState } from 'react'
import { Check, Copy, Key } from '@phosphor-icons/react'

export default function PasswordTemporal({ email, password }) {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div className="ui-secret">
      <div className="ui-secret__head">
        <Key size={18} />
        <span>Contraseña temporal{email ? ` de ${email}` : ''}</span>
      </div>
      <div className="ui-secret__row">
        <code className="ui-secret__value ui-mono">{password}</code>
        <button type="button" className="ui-btn ui-btn--sm" onClick={copiar}>
          {copiado ? <Check size={16} /> : <Copy size={16} />}
          {copiado ? 'Copiada' : 'Copiar'}
        </button>
      </div>
      <p className="ui-help">
        Entregásela a la persona por un canal seguro. No se vuelve a mostrar después de cerrar esta ventana.
      </p>
    </div>
  )
}
