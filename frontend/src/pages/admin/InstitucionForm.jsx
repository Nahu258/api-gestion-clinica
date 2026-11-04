/**
 * InstitucionForm.jsx - Alta y edición de institución (AE5-07, #37).
 *
 *   /admin/instituciones/nueva        → POST /admin/centros/
 *   /admin/instituciones/:id/editar   → PATCH sólo con los campos modificados
 *
 * La ubicación se elige con un pin arrastrable (o "Usar mi ubicación") y
 * también se puede tipear. `activo` no viaja en el PATCH: se aplica con
 * /activar/ o /desactivar/. Salir con cambios sin guardar pide confirmación.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Crosshair, WarningCircle } from '@phosphor-icons/react'
import { CheckboxField, SelectField, TextField } from '../../components/ui/Field.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import MapaPin from '../../components/MapaPin.jsx'
import useConfirmarSalida from '../../hooks/useConfirmarSalida.jsx'
import {
  TIPOS_CENTRO,
  activarCentro,
  actualizarCentro,
  crearCentro,
  desactivarCentro,
  obtenerCentroAdmin,
} from '../../api/admin.js'

const VACIO = {
  nombre: '',
  tipo: 'hospital',
  direccion: '',
  ciudad: 'Posadas',
  provincia: 'Misiones',
  pais: 'Argentina',
  latitud: '-27.3671000',
  longitud: '-55.8961000',
  telefono: '',
  atiende_24h: true,
  activo: true,
}

const CAMPOS_API = ['nombre', 'tipo', 'direccion', 'ciudad', 'provincia', 'pais', 'latitud', 'longitud', 'telefono', 'atiende_24h']

function desdeCentro(c) {
  return {
    nombre: c.nombre,
    tipo: c.tipo,
    direccion: c.direccion,
    ciudad: c.ciudad,
    provincia: c.provincia,
    pais: c.pais,
    latitud: String(c.latitud),
    longitud: String(c.longitud),
    telefono: c.telefono || '',
    atiende_24h: c.atiende_24h,
    activo: c.activo,
  }
}

function normalizarCoord(v) {
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n.toFixed(7) : String(v)
}

function validar(f) {
  const e = {}
  if (!f.nombre.trim()) e.nombre = 'Ingresá el nombre de la institución.'
  if (!f.direccion.trim()) e.direccion = 'Ingresá la dirección.'
  if (!f.ciudad.trim()) e.ciudad = 'Ingresá la ciudad.'
  if (!TIPOS_CENTRO.some((t) => t.id === f.tipo)) e.tipo = 'Elegí un tipo válido.'
  const lat = Number(String(f.latitud).replace(',', '.'))
  const lon = Number(String(f.longitud).replace(',', '.'))
  if (String(f.latitud).trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    e.latitud = 'La latitud debe ser un número entre -90 y 90.'
  }
  if (String(f.longitud).trim() === '' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    e.longitud = 'La longitud debe ser un número entre -180 y 180.'
  }
  return e
}

export default function InstitucionForm() {
  const { id } = useParams()
  const esEdicion = Boolean(id)
  const toast = useToast()

  const [inicial, setInicial] = useState(esEdicion ? null : VACIO)
  const [form, setForm] = useState(VACIO)
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [cargando, setCargando] = useState(esEdicion)
  const [guardando, setGuardando] = useState(false)
  const [ubicando, setUbicando] = useState(false)

  useEffect(() => {
    if (!esEdicion) return
    obtenerCentroAdmin(id)
      .then((c) => {
        const datos = desdeCentro(c)
        setInicial(datos)
        setForm(datos)
      })
      .catch((err) => setErrorGeneral(err.message))
      .finally(() => setCargando(false))
  }, [esEdicion, id])

  const cambios = useMemo(() => {
    if (!inicial) return {}
    const diff = {}
    Object.keys(form).forEach((k) => {
      const a = k === 'latitud' || k === 'longitud' ? normalizarCoord(form[k]) : form[k]
      const b = k === 'latitud' || k === 'longitud' ? normalizarCoord(inicial[k]) : inicial[k]
      if (a !== b) diff[k] = a
    })
    return diff
  }, [form, inicial])

  const hayCambios = !guardando && Object.keys(cambios).length > 0
  const { dialogo, salir, salirSinPreguntar } = useConfirmarSalida(hayCambios)

  const volverA = esEdicion ? `/admin/instituciones/${id}` : '/admin/instituciones'

  const set = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [campo]: valor }))
    if (errores[campo]) setErrores((er) => ({ ...er, [campo]: undefined }))
  }

  const moverPin = (lat, lon) => {
    setForm((f) => ({ ...f, latitud: lat.toFixed(7), longitud: lon.toFixed(7) }))
    setErrores((er) => ({ ...er, latitud: undefined, longitud: undefined }))
  }

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) {
      setErrorGeneral('Este navegador no permite obtener la ubicación.')
      return
    }
    setUbicando(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        moverPin(pos.coords.latitude, pos.coords.longitude)
        setUbicando(false)
      },
      () => {
        setErrorGeneral('No se pudo obtener tu ubicación. Revisá los permisos del navegador.')
        setUbicando(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const enviar = async (e) => {
    e.preventDefault()
    setErrorGeneral(null)
    const locales = validar(form)
    setErrores(locales)
    if (Object.keys(locales).length) {
      document.querySelector('[aria-invalid="true"]')?.focus()
      return
    }

    setGuardando(true)
    try {
      if (esEdicion) {
        const payload = {}
        CAMPOS_API.forEach((k) => {
          if (k in cambios) payload[k] = cambios[k]
        })
        if (Object.keys(payload).length) await actualizarCentro(id, payload)
        if ('activo' in cambios) await (form.activo ? activarCentro(id) : desactivarCentro(id))
        toast.ok(Object.keys(cambios).length ? 'Cambios guardados.' : 'No había cambios para guardar.')
        salirSinPreguntar(`/admin/instituciones/${id}`)
      } else {
        const payload = {}
        CAMPOS_API.forEach((k) => {
          payload[k] = k === 'latitud' || k === 'longitud' ? normalizarCoord(form[k]) : form[k]
        })
        const creado = await crearCentro(payload)
        if (!form.activo) await desactivarCentro(creado.id)
        toast.ok(`${creado.nombre} quedó registrada.`)
        salirSinPreguntar(`/admin/instituciones/${creado.id}`)
      }
    } catch (err) {
      setErrores(err.campos || {})
      setErrorGeneral(
        err.campos && Object.keys(err.campos).length ? 'Revisá los campos marcados.' : err.message
      )
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div aria-busy="true">
        <div className="ui-skeleton" style={{ height: 28, width: 280, marginBottom: 24 }} />
        <div className="ui-skeleton" style={{ height: 420 }} />
      </div>
    )
  }

  if (esEdicion && !inicial) {
    return (
      <div className="ui-card">
        <div className="ui-empty" role="alert">
          <div className="ui-empty__icon ui-empty__icon--alert"><WarningCircle size={22} /></div>
          <p className="ui-empty__title">No se pudo cargar la institución</p>
          <p className="ui-empty__text">{errorGeneral}</p>
          <Link to="/admin/instituciones" className="ui-btn ui-btn--sm" style={{ marginTop: 16 }}>Volver al listado</Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <button type="button" className="ui-backlink" onClick={() => salir(volverA)}>
        <ArrowLeft size={16} />
        {esEdicion ? 'Volver al detalle' : 'Volver a instituciones'}
      </button>

      <div className="ui-pagehead">
        <div>
          <h1 className="ui-pagehead__title">{esEdicion ? `Editar ${inicial.nombre}` : 'Registrar institución'}</h1>
          <div className="ui-pagehead__meta">
            <span>Los campos con * son obligatorios.</span>
          </div>
        </div>
      </div>

      <form className="ui-card ui-card__pad ui-form" onSubmit={enviar} noValidate>
        {errorGeneral && (
          <div className="ui-alert" role="alert">
            <WarningCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{errorGeneral}</span>
          </div>
        )}

        <fieldset className="ui-fieldset">
          <legend>Identificación</legend>
          <div className="ui-grid-2">
            <TextField label="Nombre" required value={form.nombre} onChange={set('nombre')} error={errores.nombre} maxLength={200} autoFocus={!esEdicion} />
            <SelectField label="Tipo" required value={form.tipo} onChange={set('tipo')} error={errores.tipo} options={TIPOS_CENTRO} />
          </div>
        </fieldset>

        <fieldset className="ui-fieldset">
          <legend>Ubicación</legend>
          <div className="ui-grid-2">
            <TextField label="Dirección" required className="ui-span-2" value={form.direccion} onChange={set('direccion')} error={errores.direccion} maxLength={300} />
            <TextField label="Ciudad" required value={form.ciudad} onChange={set('ciudad')} error={errores.ciudad} maxLength={100} />
            <TextField label="Provincia" value={form.provincia} onChange={set('provincia')} error={errores.provincia} maxLength={100} />
            <TextField label="País" value={form.pais} onChange={set('pais')} error={errores.pais} maxLength={60} />
          </div>

          <div className="ui-map-field">
            <div className="ui-sectionhead" style={{ marginBottom: 8 }}>
              <span className="ui-label">Punto en el mapa</span>
              <button type="button" className="ui-btn ui-btn--sm" onClick={usarMiUbicacion} disabled={ubicando}>
                <Crosshair size={16} />
                {ubicando ? 'Ubicando…' : 'Usar mi ubicación'}
              </button>
            </div>
            <MapaPin lat={Number(String(form.latitud).replace(',', '.'))} lon={Number(String(form.longitud).replace(',', '.'))} onChange={moverPin} />
            <p className="ui-help" style={{ marginTop: 6 }}>Arrastrá el pin o tocá el mapa. También podés escribir las coordenadas.</p>
          </div>

          <div className="ui-grid-2">
            <TextField label="Latitud" required inputMode="decimal" value={form.latitud} onChange={set('latitud')} error={errores.latitud} className="ui-mono-input" />
            <TextField label="Longitud" required inputMode="decimal" value={form.longitud} onChange={set('longitud')} error={errores.longitud} className="ui-mono-input" />
          </div>
        </fieldset>

        <fieldset className="ui-fieldset">
          <legend>Contacto y disponibilidad</legend>
          <div className="ui-grid-2">
            <TextField label="Teléfono" type="tel" value={form.telefono} onChange={set('telefono')} error={errores.telefono} maxLength={30} />
          </div>
          <CheckboxField label="Atiende las 24 horas" checked={form.atiende_24h} onChange={set('atiende_24h')} />
          <CheckboxField
            label="Activa"
            help="Una institución inactiva no aparece en el mapa público ni recibe solicitudes."
            checked={form.activo}
            onChange={set('activo')}
          />
        </fieldset>

        <div className="ui-form__actions">
          <button type="button" className="ui-btn ui-btn--quiet" onClick={() => salir(volverA)} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="ui-btn ui-btn--primary" disabled={guardando || (esEdicion && !Object.keys(cambios).length)}>
            {guardando ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Registrar institución'}
          </button>
        </div>
      </form>

      {dialogo}
    </>
  )
}
