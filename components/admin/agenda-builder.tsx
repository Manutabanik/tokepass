"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  CalendarDays,
  GripVertical,
  Link2,
  LoaderCircle,
  Plus,
  Trash2,
  UserPlus,
  UserRound,
  X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { toast } from "sonner"

import {
  createAgendaBlock,
  deleteAgendaBlock,
  deleteAgendaParticipant,
  listEventAgenda,
  reorderAgendaBlocks,
  updateAgendaBlock,
} from "@/app/actions/agenda"
import { ArtistAvatar } from "@/components/shared/artist-avatar"
import { SpotifyArtistTypeahead } from "@/components/admin/spotify-artist-typeahead"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  agendaIsoToTimeInput,
  canPersistAgendaBlock,
  formatAgendaClockRange,
  moveAgendaItem,
  nextAgendaSlot,
  normalizeAgendaName,
  type AgendaBlockDto,
} from "@/lib/agenda"
import {
  formatInventoryDayOption,
  remapBoundDayId,
  remapDayIdsByOrder,
} from "@/lib/event-schedule"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

type AgendaCardParticipant = {
  id: string | null
  name: string
  roleTag: string
  imageUrl: string
  externalLink: string
}

type AgendaCard = {
  clientId: string
  id: string | null
  dayId: string | null
  startTime: string
  endTime: string
  title: string
  participant: AgendaCardParticipant | null
  participantOpen: boolean
}

const SINGLE_DAY = "single"
const SAVE_DEBOUNCE_MS = 650

function newClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function dtoToCard(block: AgendaBlockDto): AgendaCard {
  const first = block.participants[0]
  return {
    clientId: block.id,
    id: block.id,
    dayId: block.dayId,
    startTime: agendaIsoToTimeInput(block.startTime),
    endTime: agendaIsoToTimeInput(block.endTime),
    title: block.title,
    participant: first
      ? {
          id: first.id,
          name: first.name,
          roleTag: first.roleTag,
          imageUrl: first.imageUrl ?? "",
          externalLink: first.externalLink ?? "",
        }
      : null,
    participantOpen: false,
  }
}

function persistableParticipant(participant: AgendaCardParticipant | null) {
  if (!participant) return null
  const name = normalizeAgendaName(participant.name)
  if (!name) return null
  return {
    id: participant.id,
    name,
    roleTag: participant.roleTag,
    imageUrl: participant.imageUrl.trim() || null,
    externalLink: participant.externalLink.trim() || null,
  }
}

function cardsForDay(cards: AgendaCard[], dayId: string | null, multiDay: boolean) {
  if (!multiDay) return cards
  return cards.filter((card) => card.dayId === dayId)
}

export function AgendaBuilder({ eventId }: { eventId?: string | null }) {
  const { control } = useFormContext<EventFormValues>()
  const isMultiDay = Boolean(
    useWatch({ control, name: "basics.isMultiDay" }),
  )
  const watchedScheduleDays = useWatch({
    control,
    name: "basics.scheduleDays",
  })
  const reduceMotion = useReducedMotion()

  const dayTabs = useMemo(
    () =>
      isMultiDay
        ? (watchedScheduleDays ?? []).map((day, index) => ({
            id: day.id,
            label: formatInventoryDayOption(day, index),
          }))
        : [],
    [isMultiDay, watchedScheduleDays],
  )

  const [activeDay, setActiveDay] = useState(SINGLE_DAY)
  const [cards, setCards] = useState<AgendaCard[]>([])
  const [loading, setLoading] = useState(Boolean(eventId))
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const saveTimers = useRef(new Map<string, number>())
  const saving = useRef(new Set<string>())
  const hydratedFor = useRef<string | null>(null)
  const cardsRef = useRef(cards)
  const previousDayIds = useRef<string[] | null>(null)
  const scheduleRef = useRef(isMultiDay ? (watchedScheduleDays ?? []) : [])
  const dayIdsRef = useRef(dayTabs.map((day) => day.id))

  useEffect(() => {
    cardsRef.current = cards
  }, [cards])

  useEffect(() => {
    scheduleRef.current = isMultiDay ? (watchedScheduleDays ?? []) : []
    dayIdsRef.current = dayTabs.map((day) => day.id)
  }, [isMultiDay, watchedScheduleDays, dayTabs])

  const resolvedActiveDay = !isMultiDay
    ? SINGLE_DAY
    : dayTabs.some((day) => day.id === activeDay)
      ? activeDay
      : (dayTabs[0]?.id ?? SINGLE_DAY)
  const activeDayId = isMultiDay ? resolvedActiveDay : null
  const visibleCards = cardsForDay(cards, activeDayId, isMultiDay)
  const officialDayIds = dayTabs.map((day) => day.id)

  async function persistCard(card: AgendaCard) {
    if (!eventId || saving.current.has(card.clientId)) return
    if (!canPersistAgendaBlock(card)) return

    saving.current.add(card.clientId)
    const latest =
      cardsRef.current.find((item) => item.clientId === card.clientId) ?? card
    const named = persistableParticipant(latest.participant)
    const payload: {
      dayId: string | null
      startTime: string
      endTime: string
      title: string
      participant?: ReturnType<typeof persistableParticipant>
    } = {
      dayId: isMultiDay
        ? remapBoundDayId(latest.dayId, dayIdsRef.current, "first")
        : null,
      startTime: latest.startTime,
      endTime: latest.endTime,
      title: latest.title,
    }
    if (named) {
      payload.participant = named
    } else if (latest.id && latest.participant == null) {
      payload.participant = null
    }

    const result = latest.id
      ? await updateAgendaBlock(
          eventId,
          latest.id,
          payload,
          scheduleRef.current,
        )
      : await createAgendaBlock(eventId, payload, scheduleRef.current)

    saving.current.delete(card.clientId)
    if (!result.success) {
      toast.error(result.error)
      return
    }

    const saved = dtoToCard(result.data)
    setCards((current) =>
      current.map((item) =>
        item.clientId === card.clientId
          ? { ...saved, clientId: item.clientId, participantOpen: item.participantOpen }
          : item,
      ),
    )
  }

  function scheduleSave(clientId: string) {
    const previous = saveTimers.current.get(clientId)
    if (previous) window.clearTimeout(previous)
    const timer = window.setTimeout(() => {
      const latest = cardsRef.current.find((card) => card.clientId === clientId)
      if (latest) void persistCard(latest)
    }, SAVE_DEBOUNCE_MS)
    saveTimers.current.set(clientId, timer)
  }

  useEffect(() => {
    const nextIds = officialDayIds
    if (previousDayIds.current == null) {
      previousDayIds.current = nextIds
      return
    }
    const previous = previousDayIds.current
    previousDayIds.current = nextIds
    if (previous.join("|") === nextIds.join("|") && isMultiDay) return

    setCards((current) => {
      const remap = remapDayIdsByOrder(previous, nextIds)
      const valid = new Set(nextIds)
      let changed = false
      const next = current.map((card) => {
        if (!isMultiDay) {
          if (card.dayId == null) return card
          changed = true
          return { ...card, dayId: null }
        }
        if (card.dayId && valid.has(card.dayId)) return card
        const remapped =
          (card.dayId ? remap.get(card.dayId) : null) ?? nextIds[0] ?? null
        if (remapped === card.dayId) return card
        changed = true
        return { ...card, dayId: remapped }
      })
      if (changed) {
        queueMicrotask(() => {
          for (const card of next) {
            if (card.id && canPersistAgendaBlock(card)) {
              scheduleSave(card.clientId)
            }
          }
        })
      }
      return changed ? next : current
    })
    // scheduleSave is stable via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officialDayIds.join("|"), isMultiDay])

  useEffect(() => {
    if (!eventId) return
    if (hydratedFor.current === eventId) return
    hydratedFor.current = eventId
    let cancelled = false
    setLoading(true)
    void listEventAgenda(eventId).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const unsaved = cardsRef.current.filter((card) => !card.id)
      setCards([...result.data.blocks.map(dtoToCard), ...unsaved])
    })
    return () => {
      cancelled = true
    }
  }, [eventId])

  function patchCard(clientId: string, patch: Partial<AgendaCard>) {
    setCards((current) =>
      current.map((card) =>
        card.clientId === clientId ? { ...card, ...patch } : card,
      ),
    )
  }

  function addActivity() {
    const slot = nextAgendaSlot(visibleCards)
    const card: AgendaCard = {
      clientId: newClientId(),
      id: null,
      dayId: activeDayId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      title: "",
      participant: null,
      participantOpen: false,
    }
    setCards((current) => [...current, card])
  }

  async function removeCard(card: AgendaCard) {
    const timer = saveTimers.current.get(card.clientId)
    if (timer) window.clearTimeout(timer)
    setCards((current) => current.filter((item) => item.clientId !== card.clientId))
    if (eventId && card.id) {
      const result = await deleteAgendaBlock(eventId, card.id)
      if (!result.success) toast.error(result.error)
    }
  }

  async function persistOrder(next: AgendaCard[], dayId: string | null) {
    if (!eventId) return
    const ids = cardsForDay(next, dayId, isMultiDay)
      .map((card) => card.id)
      .filter((id): id is string => Boolean(id))
    if (ids.length < 2) return
    const result = await reorderAgendaBlocks(eventId, ids)
    if (!result.success) toast.error(result.error)
  }

  function moveCard(fromId: string, toId: string) {
    setCards((current) => {
      const dayCards = cardsForDay(current, activeDayId, isMultiDay)
      const rest = current.filter((card) => !dayCards.includes(card))
      const reordered = moveAgendaItem(dayCards, fromId, toId)
      const next = isMultiDay ? [...rest, ...reordered] : reordered
      void persistOrder(next, activeDayId)
      return next
    })
    setDraggingId(null)
  }

  useEffect(() => {
    if (!eventId || loading) return
    for (const card of cardsRef.current) {
      if (!card.id && canPersistAgendaBlock(card)) {
        scheduleSave(card.clientId)
      }
    }
    // scheduleSave lee cardsRef; no hace falta re-suscribirse en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, loading])

  const missingDays = isMultiDay && dayTabs.length === 0

  const listHandlers = {
    onAdd: addActivity,
    onPatch: (clientId: string, patch: Partial<AgendaCard>, persist: boolean) => {
      patchCard(clientId, patch)
      if (persist) scheduleSave(clientId)
    },
    onRemove: removeCard,
    onDragStart: setDraggingId,
    onMove: moveCard,
    onClearDrag: () => setDraggingId(null),
    onUnlinkParticipant: async (card: AgendaCard) => {
      patchCard(card.clientId, {
        participant: null,
        participantOpen: false,
      })
      if (eventId && card.id && card.participant?.id) {
        const result = await deleteAgendaParticipant(
          eventId,
          card.participant.id,
        )
        if (!result.success) toast.error(result.error)
      } else if (eventId && card.id) {
        scheduleSave(card.clientId)
      }
    },
  }

  return (
    <section className="space-y-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarDays className="size-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />
          Bloques de actividad
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Horario y título alcanzan. La persona o el talento son opcionales.
        </p>
      </div>

      {missingDays ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-muted-foreground dark:border-zinc-800 dark:bg-zinc-950/40">
          Definí las jornadas en Datos principales para armar la agenda de cada
          día.
        </div>
      ) : isMultiDay ? (
        <Tabs
          value={resolvedActiveDay}
          onValueChange={setActiveDay}
          className="gap-4"
        >
          <TabsList
            variant="line"
            className="h-auto w-full flex-wrap justify-start gap-1 overflow-x-auto"
          >
            {dayTabs.map((day) => (
              <TabsTrigger
                key={day.id}
                value={day.id}
                className="h-9 rounded-lg px-3 data-active:bg-violet-500/10 data-active:text-violet-800 dark:data-active:text-violet-200"
              >
                {day.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {dayTabs.map((day) => (
            <TabsContent key={day.id} value={day.id} className="space-y-3">
              {resolvedActiveDay === day.id ? (
                <AgendaDayList
                  cards={visibleCards}
                  loading={loading}
                  draggingId={draggingId}
                  reduceMotion={Boolean(reduceMotion)}
                  {...listHandlers}
                />
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <AgendaDayList
          cards={visibleCards}
          loading={loading}
          draggingId={draggingId}
          reduceMotion={Boolean(reduceMotion)}
          {...listHandlers}
        />
      )}

      {!eventId ? (
        <p className="text-xs text-muted-foreground">
          El cronograma se guarda en el servidor cuando el evento ya tiene
          borrador (título de al menos 3 caracteres).
        </p>
      ) : null}
    </section>
  )
}

function AgendaDayList({
  cards,
  loading,
  draggingId,
  reduceMotion,
  onAdd,
  onPatch,
  onRemove,
  onDragStart,
  onMove,
  onClearDrag,
  onUnlinkParticipant,
}: {
  cards: AgendaCard[]
  loading: boolean
  draggingId: string | null
  reduceMotion: boolean
  onAdd: () => void
  onPatch: (
    clientId: string,
    patch: Partial<AgendaCard>,
    persist: boolean,
  ) => void
  onRemove: (card: AgendaCard) => void
  onDragStart: (clientId: string) => void
  onMove: (fromId: string, toId: string) => void
  onClearDrag: () => void
  onUnlinkParticipant: (card: AgendaCard) => void
}) {
  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-5 text-sm text-muted-foreground dark:border-zinc-800">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Cargando agenda…
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center dark:border-zinc-800 dark:bg-zinc-950/40">
          <p className="text-sm font-medium text-foreground">
            Todavía no hay actividades
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sumá un horario con título. El participante es opcional.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {cards.map((card) => (
              <AgendaBlockCard
                key={card.clientId}
                card={card}
                dragging={draggingId === card.clientId}
                reduceMotion={reduceMotion}
                onPatch={onPatch}
                onRemove={() => onRemove(card)}
                onDragStart={() => onDragStart(card.clientId)}
                onDrop={() => {
                  if (draggingId) onMove(draggingId, card.clientId)
                }}
                onClearDrag={onClearDrag}
                onUnlinkParticipant={() => onUnlinkParticipant(card)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={onAdd}
        className="h-11 w-full rounded-xl border-dashed border-violet-400/50 bg-violet-500/5 text-violet-800 hover:bg-violet-500/10 dark:text-violet-200"
      >
        <Plus className="size-4" aria-hidden="true" />
        Agregar actividad
      </Button>
    </div>
  )
}

function AgendaBlockCard({
  card,
  dragging,
  reduceMotion,
  onPatch,
  onRemove,
  onDragStart,
  onDrop,
  onClearDrag,
  onUnlinkParticipant,
}: {
  card: AgendaCard
  dragging: boolean
  reduceMotion: boolean
  onPatch: (
    clientId: string,
    patch: Partial<AgendaCard>,
    persist: boolean,
  ) => void
  onRemove: () => void
  onDragStart: () => void
  onDrop: () => void
  onClearDrag: () => void
  onUnlinkParticipant: () => void
}) {
  const clock = formatAgendaClockRange(card.startTime, card.endTime)
  const participant = card.participant
  const hasNamedParticipant = Boolean(normalizeAgendaName(participant?.name ?? ""))

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
        onClearDrag()
      }}
      className={cn(
        "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60",
        dragging && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move"
            onDragStart()
          }}
          onDragEnd={onClearDrag}
          className="mt-1 grid size-8 shrink-0 cursor-grab place-items-center rounded-lg text-muted-foreground hover:bg-zinc-100 active:cursor-grabbing dark:hover:bg-zinc-800"
          aria-label="Reordenar actividad"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
              {clock || "Definí el horario"}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRemove}
              className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
              aria-label="Eliminar actividad"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[7.5rem_7.5rem_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <Label
                htmlFor={`agenda-start-${card.clientId}`}
                className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Inicio
              </Label>
              <Input
                id={`agenda-start-${card.clientId}`}
                type="time"
                value={card.startTime}
                onChange={(event) =>
                  onPatch(card.clientId, { startTime: event.target.value }, true)
                }
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={`agenda-end-${card.clientId}`}
                className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Cierre
              </Label>
              <Input
                id={`agenda-end-${card.clientId}`}
                type="time"
                value={card.endTime}
                onChange={(event) =>
                  onPatch(card.clientId, { endTime: event.target.value }, true)
                }
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={`agenda-title-${card.clientId}`}
                className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Título
              </Label>
              <Input
                id={`agenda-title-${card.clientId}`}
                value={card.title}
                onChange={(event) =>
                  onPatch(card.clientId, { title: event.target.value }, true)
                }
                placeholder="Ej: Acreditaciones"
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          {hasNamedParticipant && !card.participantOpen ? (
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <ArtistAvatar
                name={participant?.name ?? ""}
                imageUrl={participant?.imageUrl || null}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {participant?.name}
                </p>
                {participant?.roleTag ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {participant.roleTag}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onPatch(card.clientId, { participantOpen: true }, false)
                }
                className="text-xs"
              >
                Editar
              </Button>
            </div>
          ) : !card.participantOpen ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                onPatch(
                  card.clientId,
                  {
                    participantOpen: true,
                    participant: participant ?? {
                      id: null,
                      name: "",
                      roleTag: "",
                      imageUrl: "",
                      externalLink: "",
                    },
                  },
                  false,
                )
              }
              className="h-9 justify-start px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <UserPlus className="size-3.5" aria-hidden="true" />
              Vincular persona / talento (opcional)
            </Button>
          ) : (
            <div className="space-y-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <UserRound className="size-3.5" aria-hidden="true" />
                  Participante opcional
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    onPatch(card.clientId, { participantOpen: false }, false)
                  }
                  aria-label="Cerrar participante"
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label
                    htmlFor={`agenda-person-${card.clientId}`}
                    className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                  >
                    Nombre
                  </Label>
                  <SpotifyArtistTypeahead
                    inputId={`agenda-person-${card.clientId}`}
                    value={participant?.name ?? ""}
                    onNameChange={(name) =>
                      onPatch(
                        card.clientId,
                        {
                          participant: {
                            id: participant?.id ?? null,
                            name,
                            roleTag: participant?.roleTag ?? "",
                            imageUrl: participant?.imageUrl ?? "",
                            externalLink: participant?.externalLink ?? "",
                          },
                        },
                        true,
                      )
                    }
                    onSelect={(artist) =>
                      onPatch(
                        card.clientId,
                        {
                          participant: {
                            id: participant?.id ?? null,
                            name: artist.name,
                            roleTag: participant?.roleTag ?? "",
                            imageUrl:
                              artist.imageUrl ?? participant?.imageUrl ?? "",
                            externalLink:
                              artist.spotifyUrl ||
                              participant?.externalLink ||
                              "",
                          },
                        },
                        true,
                      )
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Elegí un resultado para completar foto y enlace, o escribí
                    el nombre a mano.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor={`agenda-role-${card.clientId}`}
                    className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                  >
                    Rol / cargo / género
                  </Label>
                  <Input
                    id={`agenda-role-${card.clientId}`}
                    value={participant?.roleTag ?? ""}
                    onChange={(event) =>
                      onPatch(
                        card.clientId,
                        {
                          participant: {
                            id: participant?.id ?? null,
                            name: participant?.name ?? "",
                            roleTag: event.target.value,
                            imageUrl: participant?.imageUrl ?? "",
                            externalLink: participant?.externalLink ?? "",
                          },
                        },
                        true,
                      )
                    }
                    placeholder="Disertante, Banda, CEO…"
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor={`agenda-photo-${card.clientId}`}
                    className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                  >
                    Foto (URL)
                  </Label>
                  <Input
                    id={`agenda-photo-${card.clientId}`}
                    value={participant?.imageUrl ?? ""}
                    onChange={(event) =>
                      onPatch(
                        card.clientId,
                        {
                          participant: {
                            id: participant?.id ?? null,
                            name: participant?.name ?? "",
                            roleTag: participant?.roleTag ?? "",
                            imageUrl: event.target.value,
                            externalLink: participant?.externalLink ?? "",
                          },
                        },
                        true,
                      )
                    }
                    placeholder="https://"
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor={`agenda-link-${card.clientId}`}
                    className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                  >
                    Enlace (opcional)
                  </Label>
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id={`agenda-link-${card.clientId}`}
                      value={participant?.externalLink ?? ""}
                      onChange={(event) =>
                        onPatch(
                          card.clientId,
                          {
                            participant: {
                              id: participant?.id ?? null,
                              name: participant?.name ?? "",
                              roleTag: participant?.roleTag ?? "",
                              imageUrl: participant?.imageUrl ?? "",
                              externalLink: event.target.value,
                            },
                          },
                          true,
                        )
                      }
                      placeholder="https://instagram.com/…"
                      className="h-10 rounded-xl pl-9"
                    />
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onUnlinkParticipant}
                className="text-xs text-muted-foreground hover:text-red-500"
              >
                Quitar participante
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.li>
  )
}
