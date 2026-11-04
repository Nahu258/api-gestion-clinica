/**
 * Campos de formulario con error por campo.
 *
 *   <TextField label="Nombre" name="nombre" value={v} onChange={...} error={errores.nombre} required />
 *   <SelectField label="Tipo" options={[{ id, label }]} ... />
 *   <CheckboxField label="Atiende 24 h" checked={...} onChange={...} />
 *
 * El error del backend llega como `{campo: 'mensaje'}` (api/cliente.js),
 * así que basta con pasar `errores[campo]`.
 */

import { useId } from 'react'

export function Field({ label, htmlFor, error, help, required, children, className = '' }) {
  return (
    <div className={`ui-field${error ? ' has-error' : ''} ${className}`.trim()}>
      {label && (
        <label className="ui-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ui-required" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className="ui-error-text" id={`${htmlFor}-error`} role="alert">{error}</span>
      ) : (
        help && <span className="ui-help">{help}</span>
      )}
    </div>
  )
}

function propsAccesibles(id, error) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  }
}

export function TextField({ label, error, help, required, className, id: idProp, ...input }) {
  const auto = useId()
  const id = idProp || auto
  return (
    <Field label={label} htmlFor={id} error={error} help={help} required={required} className={className}>
      <input className="ui-input" required={required} {...propsAccesibles(id, error)} {...input} />
    </Field>
  )
}

export function TextareaField({ label, error, help, required, className, id: idProp, ...input }) {
  const auto = useId()
  const id = idProp || auto
  return (
    <Field label={label} htmlFor={id} error={error} help={help} required={required} className={className}>
      <textarea className="ui-textarea" required={required} {...propsAccesibles(id, error)} {...input} />
    </Field>
  )
}

export function SelectField({
  label,
  error,
  help,
  required,
  className,
  options = [],
  placeholder,
  id: idProp,
  ...select
}) {
  const auto = useId()
  const id = idProp || auto
  return (
    <Field label={label} htmlFor={id} error={error} help={help} required={required} className={className}>
      <select className="ui-select" required={required} {...propsAccesibles(id, error)} {...select}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
    </Field>
  )
}

export function CheckboxField({ label, help, error, className = '', id: idProp, ...input }) {
  const auto = useId()
  const id = idProp || auto
  return (
    <div className={`ui-field ${className}`.trim()}>
      <label className="ui-check" htmlFor={id}>
        <input type="checkbox" {...propsAccesibles(id, error)} {...input} />
        <span>
          <span className="ui-check__label">{label}</span>
          {help && <span className="ui-help ui-check__help">{help}</span>}
        </span>
      </label>
      {error && <span className="ui-error-text" id={`${id}-error`} role="alert">{error}</span>}
    </div>
  )
}
