"use client"

import { LoaderCircle, Plus, Search, Users, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"

import { searchArtists, searchSpotifyArtists } from "@/app/actions/artists"
import { ArtistAvatar } from "@/components/shared/artist-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useDebounce } from "@/hooks/use-debounce"
import { cn } from "@/lib/utils"
import {
  createDraftLineupItem,
  toggleDraftLineupDay,
  type EventDraftLineupSource,
  type EventDraftV2,
  type EventDraftV2LineupItem,
} from "@/lib/validations/event-draft-v2"

import { useDraftArchetype } from "./event-editor-v2-archetype"
import {
  DRAFT_FIELD_CLASS,
  DraftCard,
  DraftHint,
} from "./event-editor-v2-ui"

const EMPTY_LINEUP: EventDraftV2LineupItem[] = []
const EMPTY_SCHEDULE: EventDraftV2["schedule"] = []

type LineupSuggestion = {
  key: string
  id: string
  name: string
  avatarUrl: string
  source: Exclude<EventDraftLineupSource, "custom">
}

export function EventEditorV2LineupFields({
  embedded = false,
}: {
  embedded?: boolean
}) {
  const { labels } = useDraftArchetype()
  const { control, getValues, register, setValue } =
    useFormContext<EventDraftV2>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "lineup",
    keyName: "_rowId",
    shouldUnregister: false,
  })
  const schedule = useWatch({ control, name: "schedule" }) ?? EMPTY_SCHEDULE
  const lineup = useWatch({ control, name: "lineup" }) ?? EMPTY_LINEUP
  const multiDay = schedule.filter((day) => day?.id?.trim()).length > 1

  const rootRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<LineupSuggestion[]>([])
  const debounced = useDebounce(query.trim(), 300)

  const taken = useMemo(() => {
    const ids = new Set<string>()
    const names = new Set<string>()
    for (const person of lineup) {
      if (person.id?.trim()) ids.add(person.id.trim())
      if (person.name?.trim()) names.add(person.name.trim().toLowerCase())
    }
    return { ids, names }
  }, [lineup])

  const visibleSuggestions = (
    debounced.length < 2 ? [] : suggestions
  ).filter(
    (item) =>
      !taken.ids.has(item.id) && !taken.names.has(item.name.toLowerCase()),
  )

  useEffect(() => {
    const needle = debounced
    if (needle.length < 2) {
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setLoading(true)
    })
    void Promise.all([searchSpotifyArtists(needle), searchArtists(needle)])
      .then(([spotify, local]) => {
        if (cancelled) return
        const next: LineupSuggestion[] = []
        for (const hit of spotify.data ?? []) {
          const id = hit.spotifyId?.trim()
          const name = hit.name?.trim()
          if (!id || !name) continue
          next.push({
            key: `spotify:${id}`,
            id,
            name,
            avatarUrl: hit.imageUrl?.trim() || "",
            source: "spotify",
          })
        }
        for (const hit of local.data ?? []) {
          const id = hit.id?.trim()
          const name = hit.name?.trim()
          if (!id || !name) continue
          if (
            next.some((item) => item.name.toLowerCase() === name.toLowerCase())
          ) {
            continue
          }
          next.push({
            key: `local:${id}`,
            id,
            name,
            avatarUrl: hit.imageUrl?.trim() || "",
            source: "local",
          })
        }
        setSuggestions(next.slice(0, 8))
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [debounced])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  function addPerson(person: EventDraftV2LineupItem) {
    const name = person.name.trim()
    if (!name) return
    if (
      taken.ids.has(person.id) ||
      taken.names.has(name.toLowerCase())
    ) {
      setQuery("")
      setOpen(false)
      return
    }
    append(person)
    setQuery("")
    setOpen(false)
    setSuggestions([])
  }

  function addCustom() {
    const name = query.trim()
    if (!name) return
    addPerson(createDraftLineupItem({ name, source: "custom" }))
  }

  function toggleDay(index: number, dayId: string) {
    const current = getValues(`lineup.${index}.dayIds`) ?? []
    setValue(`lineup.${index}.dayIds`, toggleDraftLineupDay(current, dayId), {
      shouldDirty: true,
      shouldTouch: true,
    })
  }

  const showDropdown = open && query.trim().length >= 1
  const searching = query.trim().length >= 2 && loading

  const searchAndList = (
    <>
      {embedded ? null : (
        <>
      <div className="mb-5 flex items-center gap-2">
        <Users className="size-4 text-emerald-400" aria-hidden />
        <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
          {labels.participants}{" "}
          <span className="text-muted-foreground text-sm font-normal">(Opcional)</span>
        </h2>
      </div>
      <DraftHint>
        Buscá o cargá a mano. Se guarda en el borrador.
      </DraftHint>
        </>
      )}

      <div ref={rootRef} className={cn("relative", embedded ? "" : "mt-5")}>
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-gray-400"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={`Buscar ${labels.participants.toLowerCase()}...`}
          autoComplete="off"
          className={cn(DRAFT_FIELD_CLASS, "h-12 pl-11")}
          aria-label={`Buscar ${labels.participants.toLowerCase()}`}
          aria-expanded={showDropdown}
          aria-controls="event-v2-lineup-results"
        />
        {searching ? (
          <LoaderCircle
            className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-gray-400"
            aria-hidden
          />
        ) : null}

        {showDropdown ? (
          <ul
            id="event-v2-lineup-results"
            className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-950"
          >
            {query.trim().length >= 2 && !searching && visibleSuggestions.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-500">
                No encontramos coincidencias.
              </li>
            ) : null}
            {visibleSuggestions.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() =>
                    addPerson(
                      createDraftLineupItem({
                        id: item.id,
                        name: item.name,
                        avatarUrl: item.avatarUrl,
                        source: item.source,
                      }),
                    )
                  }
                  className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-100 dark:hover:bg-gray-800/70"
                >
                  <ArtistAvatar
                    name={item.name}
                    imageUrl={item.avatarUrl}
                    size="sm"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800 dark:text-zinc-100">
                      {item.name}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {item.source === "spotify" ? "Spotify" : "Catálogo TokePass"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            <li className="border-t border-slate-200 dark:border-gray-800">
              <button
                type="button"
                onClick={addCustom}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
              >
                <Plus className="size-4" aria-hidden />
                Crear “{query.trim()}” manualmente
              </button>
            </li>
          </ul>
        ) : null}
      </div>

      {fields.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {fields.map((field, index) => {
            const person = lineup[index]
            const displayName = person?.name?.trim() || "Sin nombre"
            return (
              <li
                key={field._rowId}
                className="flex max-w-full flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-white/90 py-1 pr-1 pl-1 dark:border-gray-700 dark:bg-gray-900/70"
              >
                <input type="hidden" {...register(`lineup.${index}.id`)} />
                <input type="hidden" {...register(`lineup.${index}.source`)} />
                <input type="hidden" {...register(`lineup.${index}.avatarUrl`)} />
                <input type="hidden" {...register(`lineup.${index}.name`)} />
                <ArtistAvatar
                  name={displayName}
                  imageUrl={person?.avatarUrl}
                  size="sm"
                />
                <span className="max-w-[8rem] truncate text-sm font-medium text-slate-800 dark:text-zinc-100">
                  {displayName}
                </span>
                <input
                  className="h-9 min-h-9 w-32 min-w-0 border-0 bg-transparent px-1 text-xs text-gray-500 outline-none placeholder:text-gray-400 focus-visible:ring-0"
                  placeholder="Rol…"
                  aria-label={`Rol de ${displayName}`}
                  {...register(`lineup.${index}.role`)}
                />
                {multiDay ? (
                  <div className="flex flex-wrap gap-1">
                    {schedule.map((day, dayIndex) => {
                      const dayId = day.id?.trim()
                      if (!dayId) return null
                      const selected = (person?.dayIds ?? []).includes(dayId)
                      const label = day.name?.trim() || `Día ${dayIndex + 1}`
                      return (
                        <button
                          key={dayId}
                          type="button"
                          onClick={() => toggleDay(index, dayId)}
                          aria-pressed={selected}
                          className={cn(
                            "min-h-8 rounded-full px-2 py-1 text-[10px] font-semibold transition-colors",
                            selected
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-slate-100 text-gray-500 hover:bg-slate-200 dark:bg-gray-900 dark:text-gray-400",
                          )}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-red-500"
                  aria-label={`Quitar a ${displayName}`}
                  onClick={() => remove(index)}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Todavía no hay protagonistas. Buscá o creá el primero.
        </p>
      )}
    </>
  )

  if (embedded) return <div className="space-y-3">{searchAndList}</div>
  return <DraftCard className="md:col-span-12">{searchAndList}</DraftCard>
}
