/**
 * InstitucionCentro.jsx - Datos públicos del centro (AE5-13, #43).
 *
 *   /panel-centro/gestion/institucion            (OPERADOR_CENTRO: su centro)
 *   /panel-centro/gestion/institucion?centro=:id (ADMIN: cualquier centro)
 *
 * - Edición acotada: teléfono, atiende 24 h, dirección y ubicación (pin).
 *   Nombre, tipo y estado sólo los cambia el administrador general; el
 *   backend lo valida en PATCH /centros/{id}/perfil/.
 * - Vista previa de cómo lo ve el público en /mapa y /centros/:id.
 * - Administradores del centro (sólo lectura para el operador).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowSquareOut, Clock, Crosshair, Lock, MapPin, Phone, WarningCircle } from '@phosphor-icons/react'
import MapaPin from '../../components/MapaPin.jsx'
import StatusBadge from '../../components/ui/StatusBadge.jsx'
import { CheckboxField, TextField } from '../../components/ui/Field.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import useConfirmarSalida from '../../hooks/useConfirmarSalida.jsx'
import { iniciales } from '../../utils/roles.js'
import { useCentroGestion } from './GestionLayout.jsx'
import {
  actualizarPerfilCentro,
  etiquetaTipo,
  obtenerPerfilCentro,
} from '../../api/admin.js'

const desdeCentro = (c) => ({
  telefono: c.telefono || '',
  atiende_24h: Boolean(c.atiende_24h),
  direccion: c.direccion || '',
  latitud: Number(c.latitud),
  longitud: Number(c.longitud),
})

const mismaCoord = (a, b) => Math.abs(a - b) < 1e-7

export default function InstitucionCentro() {
  const { centroId, esAdmin } = useCentroGestion()
  const toast = useToast()

  const [centro, setCentro] = useState(null)
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [ubicando, setUbicando] = useState(false)

  const cargar = useCallback(async () => {
    if (!centroId) return
    setError(null)
    try {
      const c = await obtenerPerfilCentro(centroId)
      setCentro(c)
      setForm(desdeCentro(c))
    } catch (err) {
      setError(err.message)
    }
  }, [centroId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const cambios = useMemo(() => {
    if (!centro || !form) return {}
    const base = desdeCentro(centro)
    const c = {}
    if (form.telefono.trim() !== base.telefono) c.telefono = form.telefono.trim()
    if (form.atiende_24h !== base.atiende_24h) c.atiende_24h = form.atiende_24h
    if (form.direccion.trim() !== base.direccion) c.direccion = form.direccion.trim()
    if (!mismaCoord(form.latitud, base.latitud) || !mismaCoord(form.longitud, base.longitud)) {
      c.latitud = form.latitud.toFixed(7)
      c.longitud = form.longitud.toFixed(7)
    }
    return c
  }, [centro, form])

  const hayCambios = Object.keys(cambios).length > 0
  const { dialogo } = useConfirmarSalida(hayCambios)

  const set = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [campo]: valor }))
    setErrores((er) => ({ ...er, [campo]: undefined }))
  }

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) {
      setErrorGeneral('El navegador no permite obtener la ubicación.')
      return
    }
    setUbicando(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitud: pos.coords.latitude, longitud: pos.coords.longitude }))
        setUbicando(false)
      },
      () => {
        setErrorGeneral('No se pudo obtener la ubicación. Mové el pin en el mapa.')
        setUbicando(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const guardar = async (e) => {
    e.preventDefault()
    if (!form.direccion.trim()) {
      setErrores({ direccion: 'Ingresá la dirección.' })
      return
    }
    if (!hayCambios) return
    setGuardando(true)
    setErrorGeneral(null)
    try {
      const c = await actualizarPerfilCentro(centroId, cambios)
      setCentro(c)
      setForm(desdeCentro(c))
      setErrores({})
      toast.ok('Datos del centro actualizados. Ya se ven en el mapa público.')
    } catch (err) {
      setErrores(err.campos || {})
      setErrorGeneral(Object.keys(err.campos || {}).length ? null : err.message)
    } finally {
      setGuardando(false)
    }
  }

  const operadores = centro?.administradores || []

  if (error) {
    return (
      <div className="ui-alert" role="alert">
        <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{error}</span>
        <button type="button" className="ui-btn ui-btn--sm" onClick={cargar} style={{ marginLeft: 'auto' }}>Reintentar</button>
      </div>
    )
  }

  if (!centro || !form) {
    return (
      <div className="ui-stack" aria-busy="true">
        <div className="ui-skeleton" style={{ height: 40, width: '40%' }} />
        <div className="ui-skeleton" style={{ height: 380 }} />
      </div>
    )
  }

  return (
    <>
      <div className="ui-pagehead">
        <div>
          <h1 className="ui-pagehead__title">Datos del centro</h1>
          <div className="ui-pagehead__meta">
            <span>Lo que ve el público en el mapa y en la ficha del centro.</span>
          </div>
        </div>
        <div className="ui-pagehead__actions">
          <a href={`/centros/${centro.id}`} target="_blank" rel="noreferrer" className="ui-btn">
            <ArrowSquareOut size={16} />
            Ver ficha pública
          </a>
        </div>
      </div>

      <div className="ui-split">
        <form className="ui-card" onSubmit={guardar} noValidate>
          <div className="ui-card__head">
            <h2 className="ui-h2">Contacto y ubicación</h2>
          </div>
          <div className="ui-card__pad ui-form">
            {errorGeneral && (
              <div className="ui-alert" role="alert">
                <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{errorGeneral}</span>
              </div>
            )}

            <dl className="ui-readonly">
              <div>
                <dt>Nombre</dt>
                <dd>{centro.nombre}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{etiquetaTipo(centro.tipo)}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd><StatusBadge activo={centro.activo} labels={['Activa', 'Inactiva']} /></dd>
              </div>
            </dl>
            <p className="ui-help ui-readonly__note">
              <Lock size={14} aria-hidden="true" />
              {esAdmin ? (
                <>Nombre, tipo y estado se cambian desde <Link to={`/admin/instituciones/${centro.id}/editar`}>la edición de la institución</Link>.</>
              ) : (
                'Nombre, tipo y estado sólo los cambia el administrador general.'
              )}
            </p>

            <div className="ui-grid-2">
              <TextField label="Teléfono" type="tel" value={form.telefono} onChange={set('telefono')} error={errores.telefono} placeholder="0376 444-0000" maxLength={30} />
              <CheckboxField label="Atiende las 24 horas" help="Se muestra como “Abierto 24 horas” en el mapa." checked={form.atiende_24h} onChange={set('atiende_24h')} error={errores.atiende_24h} />
              <TextField label="Dirección" required className="ui-span-2" value={form.direccion} onChange={set('direccion')} error={errores.direccion} maxLength={255} />
            </div>

            <div className="ui-field">
              <div className="ui-map-field__head">
                <span className="ui-label">Ubicación en el mapa</span>
                <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={usarMiUbicacion} disabled={ubicando}>
                  <Crosshair size={16} />
                  {ubicando ? 'Ubicando…' : 'Usar mi ubicación'}
                </button>
              </div>
              <MapaPin
                lat={form.latitud}
                lon={form.longitud}
                alto={280}
                onChange={(lat, lon) => setForm((f) => ({ ...f, latitud: lat, longitud: lon }))}
              />
              <span className="ui-help ui-mono">
                {form.latitud.toFixed(6)}, {form.longitud.toFixed(6)} · arrastrá el pin o hacé click en el mapa
              </span>
              {(errores.latitud || errores.longitud) && <span className="ui-error-text" role="alert">{errores.latitud || errores.longitud}</span>}
            </div>
          </div>
          <div className="ui-card__foot ui-form__actions">
            <button type="button" className="ui-btn ui-btn--quiet" onClick={() => setForm(desdeCentro(centro))} disabled={!hayCambios || guardando}>
              Descartar cambios
            </button>
            <button type="submit" className="ui-btn ui-btn--primary" disabled={!hayCambios || guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>

        <aside className="ui-stack">
          <section aria-label="Vista previa pública">
            <div className="ui-sectionhead">
              <h2 className="ui-h2">Así lo ve el público</h2>
              {hayCambios && <span className="ui-chip ui-chip--warn">Sin guardar</span>}
            </div>
            <div className="ui-card ui-preview">
              <div className="ui-preview__name">{centro.nombre}</div>
              <div className="ui-preview__type">{etiquetaTipo(centro.tipo)}</div>
              <div className="ui-chips" style={{ marginTop: 8 }}>
                <span className={`ui-chip${form.atiende_24h ? ' ui-chip--ok' : ''}`}>
                  <Clock size={13} weight="bold" />
                  {form.atiende_24h ? 'Abierto 24 horas' : 'Horario limitado'}
                </span>
              </div>
              <ul className="ui-preview__rows">
                <li><MapPin size={15} aria-hidden="true" />{form.direccion || <span className="ui-muted">Sin dirección</span>}</li>
                <li><Phone size={15} aria-hidden="true" />{form.telefono || <span className="ui-muted">Sin teléfono: el público no va a poder llamar</span>}</li>
              </ul>
            </div>
          </section>

          <section aria-label="Administradores del centro">
            <div className="ui-sectionhead">
              <h2 className="ui-h2">Administradores</h2>
            </div>
            <div className="ui-card">
              {operadores.length === 0 ? (
                <p className="ui-help" style={{ padding: 16 }}>No hay administradores asignados.</p>
              ) : (
                <ul className="ui-rows ui-rows--flush">
                  {operadores.map((o) => (
                    <li key={o.id} className="ui-person" style={{ padding: '12px 16px' }}>
                      <span className="ui-initials" aria-hidden="true">{iniciales(o.nombre)}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="ui-person__name">{o.nombre}</div>
                        <div className="ui-person__sub">{o.email}</div>
                      </div>
                      <StatusBadge activo={o.activo} labels={['Activa', 'Desactivada']} />
                    </li>
                  ))}
                </ul>
              )}
              {esAdmin && (
                <div className="ui-card__foot">
                  <Link to={`/admin/instituciones/${centro.id}`} className="ui-link-strong">Gestionar administradores</Link>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
      {dialogo}
    </>
  )
}
