/**
 * Íconos de especialidad (Phosphor).
 *
 * El backend guarda en `Especialidad.icono` el nombre del ícono en kebab-case
 * de Phosphor (ej. "heart", "gender-female"), igual que los seeds. Este mapa
 * es la lista curada que ofrece el selector y la que se usa para dibujarlos.
 */

import {
  Ambulance,
  Baby,
  Bandaids,
  Bone,
  Brain,
  Dna,
  Drop,
  Ear,
  Eye,
  FirstAid,
  FirstAidKit,
  Flask,
  GenderFemale,
  Hand,
  Heart,
  Heartbeat,
  Microscope,
  Person,
  Pill,
  Pulse,
  Scissors,
  Skull,
  Stethoscope,
  Syringe,
  Thermometer,
  Tooth,
  Virus,
  Wheelchair,
} from '@phosphor-icons/react'

export const ICONOS_ESPECIALIDAD = [
  { id: 'stethoscope', label: 'Estetoscopio', Icono: Stethoscope },
  { id: 'heart', label: 'Corazón', Icono: Heart },
  { id: 'heartbeat', label: 'Latido', Icono: Heartbeat },
  { id: 'pulse', label: 'Pulso', Icono: Pulse },
  { id: 'bone', label: 'Hueso', Icono: Bone },
  { id: 'baby', label: 'Bebé', Icono: Baby },
  { id: 'gender-female', label: 'Femenino', Icono: GenderFemale },
  { id: 'scissors', label: 'Tijeras', Icono: Scissors },
  { id: 'brain', label: 'Cerebro', Icono: Brain },
  { id: 'eye', label: 'Ojo', Icono: Eye },
  { id: 'ear', label: 'Oído', Icono: Ear },
  { id: 'tooth', label: 'Diente', Icono: Tooth },
  { id: 'skull', label: 'Cráneo', Icono: Skull },
  { id: 'hand', label: 'Mano', Icono: Hand },
  { id: 'person', label: 'Persona', Icono: Person },
  { id: 'wheelchair', label: 'Silla de ruedas', Icono: Wheelchair },
  { id: 'syringe', label: 'Jeringa', Icono: Syringe },
  { id: 'pill', label: 'Medicamento', Icono: Pill },
  { id: 'drop', label: 'Gota', Icono: Drop },
  { id: 'thermometer', label: 'Termómetro', Icono: Thermometer },
  { id: 'virus', label: 'Virus', Icono: Virus },
  { id: 'dna', label: 'ADN', Icono: Dna },
  { id: 'flask', label: 'Laboratorio', Icono: Flask },
  { id: 'microscope', label: 'Microscopio', Icono: Microscope },
  { id: 'bandaids', label: 'Curitas', Icono: Bandaids },
  { id: 'first-aid', label: 'Primeros auxilios', Icono: FirstAid },
  { id: 'first-aid-kit', label: 'Botiquín', Icono: FirstAidKit },
  { id: 'ambulance', label: 'Ambulancia', Icono: Ambulance },
]

const POR_ID = Object.fromEntries(ICONOS_ESPECIALIDAD.map((i) => [i.id, i.Icono]))

/** Ícono de una especialidad; si el nombre no está en la lista, un estetoscopio. */
export function IconoEspecialidad({ nombre, size = 18, ...props }) {
  const Icono = POR_ID[nombre] || Stethoscope
  return <Icono size={size} {...props} />
}
