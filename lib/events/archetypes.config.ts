export const EVENT_DRAFT_ARCHETYPES = [
  "show",
  "experience",
  "course",
  "sport",
] as const

export type EventDraftArchetype = (typeof EVENT_DRAFT_ARCHETYPES)[number]

export const DEFAULT_EVENT_DRAFT_ARCHETYPE: EventDraftArchetype = "show"

export type ArchetypeIconName =
  | "PartyPopper"
  | "Map"
  | "GraduationCap"
  | "Trophy"

export type ArchetypeLabels = {
  venue: string
  capacity: string
  participants: string
  tickets: string
}

export type ArchetypeConfig = {
  id: EventDraftArchetype
  icon: ArchetypeIconName
  title: string
  labels: ArchetypeLabels
}

export const ARCHETYPES: Record<EventDraftArchetype, ArchetypeConfig> = {
  show: {
    id: "show",
    icon: "PartyPopper",
    title: "Espectáculo / Fiesta",
    labels: {
      venue: "Lugar del evento",
      capacity: "Aforo del recinto",
      participants: "Artistas y Lineup",
      tickets: "Entradas",
    },
  },
  experience: {
    id: "experience",
    icon: "Map",
    title: "Experiencia / Turismo",
    labels: {
      venue: "Punto de encuentro",
      capacity: "Cupo máximo",
      participants: "Guías / Anfitriones",
      tickets: "Pases / Lugares",
    },
  },
  course: {
    id: "course",
    icon: "GraduationCap",
    title: "Curso / Taller",
    labels: {
      venue: "Ubicación / Plataforma",
      capacity: "Cupo de alumnos",
      participants: "Profesores / Disertantes",
      tickets: "Inscripciones",
    },
  },
  sport: {
    id: "sport",
    icon: "Trophy",
    title: "Deportes / Torneos",
    labels: {
      venue: "Sede / Cancha",
      capacity: "Cupo de participantes",
      participants: "Equipos / Atletas",
      tickets: "Inscripciones",
    },
  },
}

export function isEventDraftArchetype(
  value: unknown,
): value is EventDraftArchetype {
  return (
    typeof value === "string" &&
    (EVENT_DRAFT_ARCHETYPES as readonly string[]).includes(value)
  )
}

export function resolveDraftArchetype(value: unknown): EventDraftArchetype {
  return isEventDraftArchetype(value) ? value : DEFAULT_EVENT_DRAFT_ARCHETYPE
}

export function getArchetypeConfig(value: unknown): ArchetypeConfig {
  return ARCHETYPES[resolveDraftArchetype(value)]
}

export function archetypeSupportsVirtual(value: unknown): boolean {
  const id = resolveDraftArchetype(value)
  return id === "show" || id === "course"
}

export function archetypeUsesTimeSlots(value: unknown): boolean {
  const id = resolveDraftArchetype(value)
  return id === "experience" || id === "course" || id === "sport"
}
