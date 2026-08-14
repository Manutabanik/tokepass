"use client"

import {
  Armchair,
  ImageIcon,
  LoaderCircle,
  Pencil,
  UploadCloud,
} from "lucide-react"
import dynamic from "next/dynamic"
import Image from "next/image"
import { useMemo, useState, useTransition, type ReactNode } from "react"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"

import {
  createVenue,
  updateVenue,
  uploadVenueSeatingBackground,
  type OrganizerVenue,
} from "@/app/actions/venues"
import {
  VenueArgentinaSelector,
  type VenueArgentinaValue,
} from "@/components/admin/venue-argentina-selector"
import { InteractiveVenueMapStudio } from "@/components/admin/interactive-venue-map-studio"
import { VenueMapStudioSummary } from "@/components/admin/venue-map-studio-summary"
import { UnifiedInventoryPanel } from "@/components/admin/unified-inventory-panel"
import {
  createEmptyZone,
  type VenueZoneDraft,
} from "@/components/admin/smart-venue-builder"
import { Button } from "@/components/ui/button"
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { formatDiscoveryDateTime, formatNumber } from "@/lib/format"
import {
  draftZonesToBlueprint,
  draftZonesToSeatingLayout,
  totalDraftCapacity,
  venueMapToZoneDrafts,
  zonesToDraft,
} from "@/lib/seating/venue-zone-draft"
import {
  seatingLayoutToVenueMap,
  venueMapCapacity,
  venueMapHasInventory,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"
import { emptyVenueMap, parseVenueMap } from "@/types/venue-map"

const EventLocationMapInner = dynamic(
  () =>
    import("@/components/public/event-location-map-inner").then(
      (mod) => mod.EventLocationMapInner,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center bg-white dark:bg-zinc-950 text-xs text-muted-foreground">
        Cargando mapa…
      </div>
    ),
  },
)

type EventVenueStepProps = {
  form: UseFormReturn<EventFormValues>
  venues: OrganizerVenue[]
  onVenuesChange?: (venues: OrganizerVenue[]) => void
  onAppliedVenue?: (venue: OrganizerVenue) => void
  pricingSlot?: ReactNode
  /** Parte del wizard: ubicación vs. zonas, o todo junto. */
  focus?: "location" | "zones" | "all"
}

export function EventVenueStep({
  form,
  venues,
  onVenuesChange,
  onAppliedVenue,
  pricingSlot,
  focus = "all",
}: EventVenueStepProps) {
  const showLocation = focus !== "zones"
  const showZones = focus !== "location"
  const venueMode = form.watch("venue.mode")
  const existingVenueId = form.watch("venue.existingVenueId")
  const includesSeatingMap = Boolean(form.watch("venue.includesSeatingMap"))
  const selectedVenue = venues.find((venue) => venue.id === existingVenueId)
  const structured = includesSeatingMap

  const [editingSaved, setEditingSaved] = useState(false)
  const [zoneDrafts, setZoneDrafts] = useState<VenueZoneDraft[]>([
    createEmptyZone(false),
  ])
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(
    form.getValues("venue.seatingBackgroundUrl") || null,
  )
  const [venueMap, setVenueMap] = useState(() =>
    parseVenueMap(form.getValues("venue.venueMap")),
  )
  const [studioOpen, setStudioOpen] = useState(false)
  const [pendingSave, startSaveTransition] = useTransition()
  const [pendingUpload, startUploadTransition] = useTransition()

  const geoValue = useMemo<Partial<VenueArgentinaValue>>(
    () => ({
      venueName: form.watch("venue.venueName"),
      address: form.watch("venue.venueLocation") ?? "",
      capacity: form.watch("venue.capacity") ?? 0,
      coordinates:
        form.watch("venue.latitude") != null &&
        form.watch("venue.longitude") != null
          ? {
              lat: form.watch("venue.latitude")!,
              lng: form.watch("venue.longitude")!,
            }
          : null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional live form sync
    [
      form.watch("venue.venueName"),
      form.watch("venue.venueLocation"),
      form.watch("venue.capacity"),
      form.watch("venue.latitude"),
      form.watch("venue.longitude"),
    ],
  )

  function syncZonesToForm(nextZones: VenueZoneDraft[], nextStructured: boolean) {
    setZoneDrafts(nextZones)
    const blueprint = draftZonesToBlueprint(nextZones, nextStructured)
    const capacity = totalDraftCapacity(nextZones, nextStructured)
    form.setValue("venue.zones", blueprint, { shouldDirty: true })
    if (capacity > 0) {
      form.setValue("venue.capacity", capacity, { shouldDirty: true })
    }
  }

  function switchToNew() {
    form.setValue("venue.mode", "new")
    form.setValue("venue.existingVenueId", null)
    form.setValue("venue.saveVenueForReuse", true)
    setEditingSaved(false)
    setZoneDrafts([createEmptyZone(structured)])
    setBackgroundUrl(null)
    setVenueMap(emptyVenueMap())
    form.setValue("venue.seatingBackgroundUrl", null)
    form.setValue("venue.venueMap", emptyVenueMap())
    form.setValue("venue.seatingLayout", [])
  }

  function applySavedVenue(venue: OrganizerVenue) {
    const firstZone = venue.zoneBlueprint[0]
    const nextStructured =
      venue.seatingLayout.some((s) => s.layout_type !== "general") ||
      firstZone?.type === "reserved_seating"

    form.setValue("venue.mode", "existing")
    form.setValue("venue.existingVenueId", venue.id)
    form.setValue("venue.venueName", venue.name)
    form.setValue("venue.venueLocation", venue.location)
    form.setValue("venue.venueCity", venue.city ?? "")
    form.setValue("venue.capacity", venue.capacity)
    form.setValue("venue.latitude", venue.latitude)
    form.setValue("venue.longitude", venue.longitude)
    form.setValue("venue.seatingBackgroundUrl", venue.seatingBackgroundUrl)
    form.setValue(
      "venue.zoneType",
      nextStructured ? "reserved_seating" : "general_admission",
    )
    form.setValue("venue.includesSeatingMap", nextStructured)
    form.setValue(
      "venue.zones",
      venue.zoneBlueprint.map((zone) => ({
        name: zone.name,
        type: zone.type,
        capacity: zone.capacity,
        rows: zone.rows ?? null,
        seatsPerRow: zone.seatsPerRow ?? null,
      })),
    )
    form.setValue("venue.saveVenueForReuse", false)
    setBackgroundUrl(venue.seatingBackgroundUrl)
    const nextMap = seatingLayoutToVenueMap(
      venue.seatingLayout,
      parseVenueMap(venue.venueMap),
    )
    setVenueMap(nextMap)
    form.setValue("venue.venueMap", nextMap)
    form.setValue("venue.seatingLayout", venue.seatingLayout)
    setZoneDrafts(
      nextMap.sectors.length > 0 || (nextMap.elements?.length ?? 0) > 0
        ? venueMapToZoneDrafts(nextMap)
        : zonesToDraft(venue.id, venue.zoneBlueprint, venue.seatingLayout),
    )
    setEditingSaved(false)
    onAppliedVenue?.(venue)
  }

  function startEditSavedVenue() {
    if (!selectedVenue) return
    applySavedVenue(selectedVenue)
    form.setValue("venue.mode", "new")
    form.setValue("venue.existingVenueId", selectedVenue.id)
    form.setValue("venue.saveVenueForReuse", true)
    setEditingSaved(true)
  }

  function persistVenueNow() {
    const values = form.getValues("venue")
    if (!values.venueName.trim()) {
      toast.error("Ingresá el nombre del lugar.")
      return
    }
    if (!values.venueLocation?.trim()) {
      toast.error("Elegí una dirección en el buscador.")
      return
    }
    if (values.latitude == null || values.longitude == null) {
      toast.error("Falta el pin en el mapa.")
      return
    }

    const nextStructured =
      Boolean(values.includesSeatingMap) ||
      values.zoneType === "reserved_seating"
    const fromMap = nextStructured && venueMapHasInventory(venueMap)
    const mapLayout = fromMap
      ? venueMapToSeatingLayout(venueMap)
      : draftZonesToSeatingLayout(zoneDrafts, nextStructured)
    const mapDrafts = fromMap
      ? venueMapToZoneDrafts(venueMap)
      : zoneDrafts
    const blueprint = draftZonesToBlueprint(mapDrafts, nextStructured)
    const seatingLayout = mapLayout
    const capacity =
      (fromMap
        ? venueMapCapacity(venueMap)
        : totalDraftCapacity(mapDrafts, nextStructured)) ||
      values.capacity ||
      1

    startSaveTransition(async () => {
      const payload = {
        name: values.venueName.trim(),
        location: values.venueLocation!.trim(),
        city: values.venueCity?.trim() || undefined,
        latitude: values.latitude ?? null,
        longitude: values.longitude ?? null,
        capacity,
        zones: blueprint,
        seatingLayout,
        venueMap: nextStructured ? venueMap : parseVenueMap(null),
        seatingBackgroundUrl: backgroundUrl,
      }

      const editingId = editingSaved ? values.existingVenueId : null
      const result = editingId
        ? await updateVenue({ id: editingId, ...payload })
        : await createVenue(payload)

      if (!result.success) {
        toast.error(result.error)
        return
      }

      const savedId =
        editingId ??
        ("data" in result && result.data && "id" in result.data
          ? result.data.id
          : null)
      if (!savedId) {
        toast.error("No pudimos identificar el lugar guardado.")
        return
      }

      const now = new Date().toISOString()
      const previous = venues.find((item) => item.id === savedId)
      const saved: OrganizerVenue = {
        id: savedId,
        name: payload.name,
        location: payload.location,
        address: payload.location,
        city: payload.city ?? null,
        latitude: payload.latitude,
        longitude: payload.longitude,
        capacity: payload.capacity,
        zoneBlueprint: payload.zones,
        seatingLayout: payload.seatingLayout,
        venueMap: payload.venueMap,
        seatingBackgroundUrl: payload.seatingBackgroundUrl,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      }

      const nextList = previous
        ? venues.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...venues]
      onVenuesChange?.(nextList)
      applySavedVenue(saved)
      toast.success(
        editingId ? "Lugar actualizado" : "Lugar guardado para futuros eventos",
      )
    })
  }

  function onGeoChange(next: VenueArgentinaValue) {
    form.setValue("venue.venueName", next.venueName, { shouldDirty: true })
    form.setValue("venue.venueLocation", next.address, { shouldDirty: true })
    form.setValue(
      "venue.venueCity",
      [next.department?.name, next.province?.name].filter(Boolean).join(", "),
      { shouldDirty: true },
    )
    form.setValue("venue.latitude", next.coordinates?.lat ?? null, {
      shouldDirty: true,
    })
    form.setValue("venue.longitude", next.coordinates?.lng ?? null, {
      shouldDirty: true,
    })
    if (next.capacity > 0 && !structured) {
      form.setValue("venue.capacity", next.capacity, { shouldDirty: true })
    }
  }

  function onBackgroundFile(file: File | null) {
    if (!file) return
    const formData = new FormData()
    formData.set("file", file)
    startUploadTransition(async () => {
      const result = await uploadVenueSeatingBackground(formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setBackgroundUrl(result.data.url)
      form.setValue("venue.seatingBackgroundUrl", result.data.url, {
        shouldDirty: true,
      })
      toast.success("Plano cargado")
    })
  }

  const showCreateForm = venueMode === "new" || venues.length === 0 || editingSaved

  return (
    <div className="space-y-7">
      {showLocation ? (
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={venues.length === 0}
          onClick={() => {
            form.setValue("venue.mode", "existing")
            setEditingSaved(false)
            if (!existingVenueId && venues[0]) applySavedVenue(venues[0])
          }}
          className={cn(
            "rounded-2xl border px-4 py-3 text-left text-sm transition disabled:opacity-40",
            venueMode === "existing" && !editingSaved
              ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          Elegir un lugar guardado
          {venues.length === 0
            ? " (todavía no hay)"
            : ` (${venues.length})`}
        </button>
        <button
          type="button"
          onClick={switchToNew}
          className={cn(
            "rounded-2xl border px-4 py-3 text-left text-sm transition",
            showCreateForm && (venueMode === "new" || editingSaved)
              ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          Crear un lugar nuevo
        </button>
      </div>
      ) : null}

      {venueMode === "existing" && !editingSaved && selectedVenue ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground">
                {selectedVenue.name}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {[selectedVenue.location, selectedVenue.city]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatNumber(selectedVenue.capacity)} personas ·{" "}
                {selectedVenue.seatingLayout.length ||
                  selectedVenue.zoneBlueprint.length}{" "}
                zona
                {(selectedVenue.seatingLayout.length ||
                  selectedVenue.zoneBlueprint.length) === 1
                  ? ""
                  : "s"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-zinc-200 dark:border-white/10 text-foreground"
              onClick={startEditSavedVenue}
            >
              <Pencil className="size-3.5" />
              Editar datos de este lugar
            </Button>
          </div>

          <FormField
            control={form.control}
            name="venue.existingVenueId"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Cambiar lugar</FormLabel>
                <Select
                  value={field.value ?? ""}
                  onValueChange={(value) => {
                    const venue = venues.find((item) => item.id === value)
                    if (venue) applySavedVenue(venue)
                  }}
                  items={venues.map((venue) => ({
                    value: venue.id,
                    label: `${venue.name}${venue.city ? ` · ${venue.city}` : ""}`,
                  }))}
                >
                  <SelectTrigger className="h-11 w-full max-w-full overflow-hidden border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-black/20">
                    <SelectValue placeholder="Elegí un lugar">
                      {(() => {
                        const venue = venues.find(
                          (item) => item.id === field.value,
                        )
                        if (!venue) return null
                        return `${venue.name}${venue.city ? ` · ${venue.city}` : ""}`
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((venue) => (
                      <SelectItem key={venue.id} value={venue.id}>
                        <span className="block max-w-[200px] truncate sm:max-w-[300px]">
                          {venue.name}
                        </span>
                        {venue.city ? (
                          <span className="shrink-0 text-sm text-muted-foreground">
                            {venue.city}
                          </span>
                        ) : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )}
          />

          {showLocation &&
          selectedVenue.latitude != null &&
          selectedVenue.longitude != null ? (
            <div className="h-48 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 sm:h-56">
              <EventLocationMapInner
                latitude={selectedVenue.latitude}
                longitude={selectedVenue.longitude}
              />
            </div>
          ) : showLocation ? (
            <p className="rounded-xl border border-dashed border-zinc-200 dark:border-white/10 px-3 py-3 text-xs text-muted-foreground">
              Este lugar todavía no tiene coordenadas en el mapa.
            </p>
          ) : null}

          {showZones ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {(selectedVenue.seatingLayout.length > 0
              ? selectedVenue.seatingLayout.map((sector) => ({
                  id: sector.id,
                  name: sector.sector_name,
                  color: sector.color,
                  detail:
                    sector.layout_type === "general"
                      ? "Entradas generales"
                      : `${(sector.rows ?? []).length} fila${
                          (sector.rows ?? []).length === 1 ? "" : "s"
                        }`,
                }))
              : selectedVenue.zoneBlueprint.map((zone, index) => ({
                  id: `z-${index}`,
                  name: zone.name,
                  color: "#10b981",
                  detail:
                    zone.type === "general_admission"
                      ? "Entradas generales"
                      : "Asientos numerados",
                }))
            ).map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/8 bg-muted dark:bg-black/25 px-3 py-2.5 text-sm"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {item.name}
                </span>
                <span className="text-[11px] text-muted-foreground">{item.detail}</span>
              </li>
            ))}
          </ul>
          ) : null}

          {focus === "all" ? pricingSlot : null}
        </div>
      ) : null}

      {showCreateForm ? (
        <div className="space-y-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          {editingSaved ? (
            <p className="text-sm text-emerald-800 dark:text-emerald-300/90">
              Estás editando un lugar guardado. Los cambios se aplican a futuros
              eventos que lo usen.
            </p>
          ) : null}

          {showZones ? (
          <FormField
            control={form.control}
            name="venue.includesSeatingMap"
            render={({ field }) => (
              <FormItem className="rounded-2xl border border-border bg-muted/60 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                      <Armchair className="size-4" aria-hidden="true" />
                    </span>
                    <div>
                      <FormLabel className="text-sm font-semibold text-foreground">
                        Incluye mapa de asientos / mesas / tablones
                      </FormLabel>
                      <FormDescription className="mt-1 text-xs leading-5">
                        Opcional. Activalo para diseñar ubicaciones numeradas
                        sin reemplazar entradas generales ni adicionales.
                      </FormDescription>
                    </div>
                  </div>
                  <Switch
                    checked={Boolean(field.value)}
                    onCheckedChange={(checked) => {
                      field.onChange(checked)
                      form.setValue(
                        "venue.zoneType",
                        checked ? "reserved_seating" : "general_admission",
                        { shouldDirty: true },
                      )
                    }}
                    className="mt-1 data-checked:bg-emerald-500"
                  />
                </div>
              </FormItem>
            )}
          />
          ) : null}

          {showLocation ? (
          <VenueArgentinaSelector
            value={geoValue}
            onChange={onGeoChange}
            showIdentityFields
          />
          ) : null}

          {showZones ? (
            <>
          {structured ? (
            <div className="space-y-3">
              <VenueMapStudioSummary
                map={venueMap}
                onOpen={() => setStudioOpen(true)}
              />
              <InteractiveVenueMapStudio
                open={studioOpen}
                eventTitle={form.watch("basics.title") || "Evento"}
                eventDate={
                  form.watch("basics.date")
                    ? formatDiscoveryDateTime(form.watch("basics.date"))
                    : undefined
                }
                venueLabel={
                  form.watch("venue.venueName") || selectedVenue?.name || undefined
                }
                value={venueMap}
                onClose={() => setStudioOpen(false)}
                onSave={(next, layout) => {
                  setVenueMap(next)
                  form.setValue("venue.venueMap", next, { shouldDirty: true })
                  form.setValue("venue.seatingLayout", layout, {
                    shouldDirty: true,
                  })
                  const drafts = venueMapToZoneDrafts(next)
                  if (drafts.length > 0) {
                    syncZonesToForm(drafts, true)
                  }
                  setStudioOpen(false)
                }}
              />
              <div className="space-y-3 rounded-2xl border border-border bg-muted/60 p-4">
                <div className="flex items-center gap-2">
                  <ImageIcon className="size-4 text-emerald-700 dark:text-emerald-400" />
                  <Label className="text-sm text-foreground">
                    Imagen o mapa del lugar (Opcional)
                  </Label>
                </div>
                {backgroundUrl ? (
                  <div className="relative aspect-[16/7] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <Image
                      src={backgroundUrl}
                      alt="Plano de referencia"
                      fill
                      className="object-contain"
                      sizes="640px"
                      unoptimized
                    />
                  </div>
                ) : null}
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/60 px-4 py-6 text-sm text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-800 dark:text-emerald-200">
                  {pendingUpload ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <UploadCloud className="size-4" />
                  )}
                  Subir plano de referencia
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) =>
                      onBackgroundFile(event.target.files?.[0] ?? null)
                    }
                  />
                </label>
              </div>
            </div>
          ) : null}

          <UnifiedInventoryPanel form={form} />

          <FormField
            control={form.control}
            name="venue.capacity"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Capacidad de referencia del lugar</FormLabel>
                <Input
                  type="number"
                  min={1}
                  value={field.value ?? ""}
                  onChange={(event) =>
                    field.onChange(
                      event.target.value === ""
                        ? undefined
                        : Number(event.target.value),
                    )
                  }
                  className="h-11 border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-black/20"
                />
                <FormDescription>
                  Orientativa. El stock real sale de asientos del mapa, sectores
                  generales y adicionales.
                </FormDescription>
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )}
          />
            </>
          ) : null}

          {showLocation ? (
            <>
          <FormField
            control={form.control}
            name="venue.saveVenueForReuse"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start justify-between gap-3 rounded-2xl border border-border bg-muted/60 px-4 py-3">
                <div className="space-y-1">
                  <FormLabel className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Guardar este lugar para futuros eventos
                  </FormLabel>
                  <FormDescription className="text-xs text-muted-foreground">
                    Si está activo, al guardar el evento queda disponible en
                    “Elegir un lugar guardado”.
                  </FormDescription>
                </div>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="mt-1 data-checked:bg-emerald-500"
                />
              </FormItem>
            )}
          />

          {(editingSaved || form.watch("venue.saveVenueForReuse")) && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pendingSave}
                onClick={persistVenueNow}
                className="border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
              >
                {pendingSave ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {editingSaved
                  ? "Guardar cambios del lugar"
                  : "Guardar lugar ahora"}
              </Button>
              {editingSaved ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (selectedVenue) applySavedVenue(selectedVenue)
                    else if (existingVenueId) {
                      const venue = venues.find((v) => v.id === existingVenueId)
                      if (venue) applySavedVenue(venue)
                    }
                  }}
                >
                  Cancelar edición
                </Button>
              ) : null}
            </div>
          )}
            </>
          ) : null}

          {focus === "all" && pricingSlot && venueMode === "existing"
            ? pricingSlot
            : null}
        </div>
      ) : null}
    </div>
  )
}

/** Expone datos de draft para que el submit del evento pueda crear el venue. */
export function buildVenuePersistPayload(input: {
  formValues: EventFormValues["venue"]
  zoneDrafts: VenueZoneDraft[]
  backgroundUrl: string | null
  venueMap?: ReturnType<typeof parseVenueMap>
}) {
  const structured =
    Boolean(input.formValues.includesSeatingMap) ||
    input.formValues.zoneType === "reserved_seating"
  const map = input.venueMap
  const fromMap = structured && map && venueMapHasInventory(map)
  return {
    name: input.formValues.venueName.trim(),
    location: (input.formValues.venueLocation ?? "").trim(),
    city: input.formValues.venueCity?.trim() || undefined,
    latitude: input.formValues.latitude ?? null,
    longitude: input.formValues.longitude ?? null,
    capacity:
      (fromMap ? venueMapCapacity(map) : totalDraftCapacity(input.zoneDrafts, structured)) ||
      input.formValues.capacity ||
      1,
    zones: fromMap
      ? draftZonesToBlueprint(venueMapToZoneDrafts(map), structured)
      : draftZonesToBlueprint(input.zoneDrafts, structured),
    seatingLayout: fromMap
      ? venueMapToSeatingLayout(map)
      : draftZonesToSeatingLayout(input.zoneDrafts, structured),
    venueMap: map ?? parseVenueMap(null),
    seatingBackgroundUrl: input.backgroundUrl,
  }
}
