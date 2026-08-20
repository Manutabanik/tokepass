"use client"

import {
  Armchair,
  ImageIcon,
  LoaderCircle,
  Pencil,
  Settings2,
  UploadCloud,
} from "lucide-react"
import dynamic from "next/dynamic"
import Image from "next/image"
import { useState, useTransition, type ReactNode } from "react"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"

import {
  upsertVenue,
  uploadVenueSeatingBackground,
  type OrganizerVenue,
} from "@/app/actions/venues"
import {
  VenueArgentinaSelector,
  type VenueArgentinaValue,
} from "@/components/admin/venue-argentina-selector"
import { InteractiveVenueMapStudio } from "@/components/admin/interactive-venue-map-studio"
import { LogicalSectorsPanel } from "@/components/admin/logical-sectors-panel"
import { VenueManagerModal } from "@/components/admin/venue-manager-modal"
import { VenueMapStudioSummary } from "@/components/admin/venue-map-studio-summary"
import { useEventFormStore } from "@/lib/stores/event-form-store"
import { venueMapToPricingMap } from "@/lib/seating/venue-map-pricing"
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
import { composeVenuePlace } from "@/lib/venues/compose-location"
import type { EventFormValues } from "@/lib/validations/event-form"
import { RELATION_UUID_RE } from "@/lib/validations/relation-id"
import { cn } from "@/lib/utils"
import { emptyVenueMap, parseVenueMap } from "@/types/venue-map"

function uniqueVenues(venues: OrganizerVenue[]) {
  return Array.from(new Map(venues.map((venue) => [venue.id, venue])).values())
}

function parsePlaceParts(city: string | null | undefined) {
  const parts = (city ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    return { department: parts[0]!, province: parts.slice(1).join(", ") }
  }
  return { department: parts[0] ?? "", province: "" }
}

const EventLocationMapInner = dynamic(
  () =>
    import("@/components/public/event-location-map-inner").then(
      (mod) => mod.EventLocationMapInner,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center bg-zinc-950 text-xs text-zinc-400">
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
  onMapInventoryChange?: (map: ReturnType<typeof parseVenueMap>) => void
  catalogOrganizerId?: string | null
  eventId?: string | null
}

export function EventVenueStep({
  form,
  venues,
  onVenuesChange,
  onAppliedVenue,
  pricingSlot,
  focus = "all",
  onMapInventoryChange,
  catalogOrganizerId = null,
  eventId = null,
}: EventVenueStepProps) {
  const showLocation = focus !== "zones"
  const showZones = focus !== "location"
  const venueMode = form.watch("venue.mode")
  const existingVenueId = form.watch("venue.existingVenueId")
  const includesSeatingMap = Boolean(form.watch("venue.includesSeatingMap"))
  const selectedVenue = uniqueVenues(venues).find((venue) => venue.id === existingVenueId)
  const venueCatalog = uniqueVenues(venues)
  const venueOptions = [...venueCatalog]
    .filter((venue) => !venue.isArchived || venue.id === existingVenueId)
    .sort((left, right) =>
      left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
    )
  const structured = includesSeatingMap

  const [managerOpen, setManagerOpen] = useState(false)

  const [editingSaved, setEditingSaved] = useState(false)
  const [zoneDrafts, setZoneDrafts] = useState<VenueZoneDraft[]>([
    createEmptyZone(false),
  ])
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(
    form.getValues("venue.seatingBackgroundUrl") || null,
  )
  const watchedVenueMap = form.watch("venue.venueMap")
  const parsedVenueMap = parseVenueMap(watchedVenueMap)
  const parsedVenueMapKey = JSON.stringify(parsedVenueMap)
  const [venueMap, setVenueMap] = useState(() =>
    parseVenueMap(form.getValues("venue.venueMap")),
  )
  const [venueMapKey, setVenueMapKey] = useState(parsedVenueMapKey)
  if (parsedVenueMapKey !== venueMapKey) {
    setVenueMapKey(parsedVenueMapKey)
    setVenueMap(parsedVenueMap)
  }
  const [studioOpen, setStudioOpen] = useState(false)
  const [pendingSave, startSaveTransition] = useTransition()
  const [pendingUpload, startUploadTransition] = useTransition()

  function emitMapInventory(next: ReturnType<typeof parseVenueMap>) {
    const pricing = venueMapToPricingMap(next)
    useEventFormStore.getState().setVenuePricingMap(pricing)
    onMapInventoryChange?.(next)
  }

  function persistMapToForm(
    next: ReturnType<typeof parseVenueMap>,
    options?: { syncDrafts?: boolean },
  ) {
    setVenueMap(next)
    form.setValue("venue.venueMap", next, { shouldDirty: true })
    form.setValue("venue.seatingLayout", venueMapToSeatingLayout(next), {
      shouldDirty: true,
    })
    if (options?.syncDrafts) {
      const drafts = venueMapToZoneDrafts(next)
      if (drafts.length > 0) {
        syncZonesToForm(drafts, true)
      }
    }
    emitMapInventory(next)
  }

  const geoVenueName = form.watch("venue.venueName")
  const geoVenueLocation = form.watch("venue.venueLocation")
  const geoVenueCity = form.watch("venue.venueCity")
  const geoProvince = form.watch("venue.province")
  const geoDepartment = form.watch("venue.department")
  const geoProvinceId = form.watch("venue.provinceId")
  const geoDepartmentId = form.watch("venue.departmentId")
  const geoCapacity = form.watch("venue.capacity")
  const geoLatitude = form.watch("venue.latitude")
  const geoLongitude = form.watch("venue.longitude")
  const hasSavedPlace = Boolean(existingVenueId || selectedVenue)
  const hasNewPlace = Boolean(geoVenueName?.trim())
  const canDesignMap =
    venueMode === "existing" && !editingSaved ? hasSavedPlace : hasNewPlace
  const mapBlockedReason = canDesignMap
    ? undefined
    : venueMode === "existing" && !editingSaved
      ? "Primero seleccioná un lugar."
      : "Primero ingresá el nombre del lugar."

  function openStudio() {
    if (!canDesignMap) {
      toast.error(mapBlockedReason ?? "Primero seleccioná un lugar.")
      return
    }
    form.setValue("venue.includesSeatingMap", true, { shouldDirty: true })
    form.setValue("venue.zoneType", "reserved_seating", { shouldDirty: true })
    setStudioOpen(true)
  }

  const parsedPlace = parsePlaceParts(geoVenueCity)
  const provinceName = geoProvince || parsedPlace.province
  const departmentName = geoDepartment || parsedPlace.department
  const geoValue: Partial<VenueArgentinaValue> = {
    venueName: geoVenueName,
    address: geoVenueLocation ?? "",
    capacity: geoCapacity ?? 0,
    province:
      provinceName
        ? { id: geoProvinceId || provinceName, name: provinceName }
        : null,
    department:
      departmentName
        ? { id: geoDepartmentId || departmentName, name: departmentName }
        : null,
    coordinates:
      geoLatitude != null &&
      geoLongitude != null &&
      Number.isFinite(geoLatitude) &&
      Number.isFinite(geoLongitude)
        ? {
            lat: geoLatitude,
            lng: geoLongitude,
          }
        : null,
  }

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
    form.setValue("venue.venueLocation", venue.address || venue.location)
    form.setValue("venue.venueCity", venue.city ?? "")
    const parsed = parsePlaceParts(venue.city)
    form.setValue("venue.department", parsed.department)
    form.setValue("venue.province", parsed.province)
    form.setValue("venue.capacity", venue.capacity)
    form.setValue("venue.latitude", venue.latitude)
    form.setValue("venue.longitude", venue.longitude)
    form.setValue("venue.seatingBackgroundUrl", venue.seatingBackgroundUrl)
    form.setValue(
      "venue.zoneType",
      nextStructured ? "reserved_seating" : "general_admission",
    )
    form.setValue("venue.includesSeatingMap", nextStructured)
    const currentZones = form.getValues("venue.zones") ?? []
    const keepEventZones =
      Boolean(eventId) &&
      currentZones.some((zone) => RELATION_UUID_RE.test(zone.id ?? ""))
    if (!keepEventZones) {
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
    }
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
    emitMapInventory(nextMap)
    onAppliedVenue?.(venue)
  }

  function startEditSavedVenue() {
    if (!selectedVenue) return
    applySavedVenue(selectedVenue)
    form.setValue("venue.mode", "existing")
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
      const place = composeVenuePlace({
        street: values.venueLocation,
        department: values.department,
        province: values.province,
        city: values.venueCity,
      })
      const payload = {
        name: values.venueName.trim(),
        location: place.street || values.venueLocation!.trim(),
        city: place.city || values.venueCity?.trim() || undefined,
        latitude: values.latitude ?? null,
        longitude: values.longitude ?? null,
        capacity,
        zones: blueprint,
        seatingLayout,
        venueMap: nextStructured ? venueMap : parseVenueMap(null),
        seatingBackgroundUrl: backgroundUrl,
      }

      const editingId = values.existingVenueId?.trim() || null
      const result = await upsertVenue({
        id: editingId,
        ...payload,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      const savedId = result.data.id
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
        isArchived: previous?.isArchived ?? false,
        linkedEventCount: previous?.linkedEventCount ?? 0,
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
    form.setValue("venue.province", next.province?.name ?? "", { shouldDirty: true })
    form.setValue("venue.department", next.department?.name ?? "", {
      shouldDirty: true,
    })
    form.setValue("venue.provinceId", next.province?.id ?? null, {
      shouldDirty: true,
    })
    form.setValue("venue.departmentId", next.department?.id ?? null, {
      shouldDirty: true,
    })
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

  function handleCatalogChange(next: OrganizerVenue[]) {
    onVenuesChange?.(next)
    if (!existingVenueId) return
    if (next.some((item) => item.id === existingVenueId)) return
    const first = next.find((item) => !item.isArchived)
    if (first) applySavedVenue(first)
    else switchToNew()
  }

  const showCreateForm =
    venueMode === "new" || venueOptions.length === 0 || editingSaved

  return (
    <div
      className="space-y-7"
      id="event-wizard-map"
      data-conflict-sector={
        form.watch("tickets")?.find((tier) => tier.seatingSectorId)?.seatingSectorId ??
        undefined
      }
    >
      {showLocation ? (
      <div className="space-y-2">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setManagerOpen(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Settings2 className="size-3.5" aria-hidden="true" />
          Gestionar Lugares
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={venueOptions.length === 0}
          title={
            venueOptions.length === 0
              ? "Todavía no hay lugares guardados. Creá uno nuevo."
              : undefined
          }
          onClick={() => {
            form.setValue("venue.mode", "existing")
            setEditingSaved(false)
            if (!existingVenueId && venueOptions[0]) applySavedVenue(venueOptions[0])
          }}
          className={cn(
            "rounded-2xl border px-4 py-3 text-left text-sm transition disabled:opacity-40",
            venueMode === "existing" && !editingSaved
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-200"
              : "border-zinc-700 bg-zinc-800/50 text-zinc-400",
          )}
        >
          Elegir un lugar guardado
          {venueOptions.length === 0
            ? " (todavía no hay)"
            : ` (${venueOptions.length})`}
        </button>
        <button
          type="button"
          onClick={switchToNew}
          className={cn(
            "rounded-2xl border px-4 py-3 text-left text-sm transition",
            showCreateForm && (venueMode === "new" || editingSaved)
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-200"
              : "border-zinc-700 bg-zinc-800/50 text-zinc-400",
          )}
        >
          Crear un lugar nuevo
        </button>
      </div>
      </div>
      ) : null}

      {venueMode === "existing" && !editingSaved && !selectedVenue ? (
        <FormField
          control={form.control}
          name="venue.existingVenueId"
          render={({ fieldState }) => (
            <FormMessage>
              {fieldState.error?.message ??
                (venueOptions.length === 0
                  ? "Todavía no hay lugares. Creá uno nuevo."
                  : null)}
            </FormMessage>
          )}
        />
      ) : null}

      {venueMode === "existing" && !editingSaved && selectedVenue ? (
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-100 shadow-sm sm:p-5">
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
                <div className="flex items-center justify-between gap-3">
                  <FormLabel>Cambiar lugar</FormLabel>
                  <button
                    type="button"
                    onClick={() => setManagerOpen(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    <Settings2 className="size-3.5" aria-hidden="true" />
                    Gestionar Lugares
                  </button>
                </div>
                <Select
                  value={field.value ?? ""}
                  onValueChange={(value) => {
                    const venue = venueOptions.find((item) => item.id === value)
                    if (venue) applySavedVenue(venue)
                  }}
                  items={venueOptions.map((venue) => ({
                    value: venue.id,
                    label: venue.name,
                  }))}
                >
                  <SelectTrigger className="h-11 w-full max-w-full overflow-hidden border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-black/20">
                    <SelectValue placeholder="Elegí un lugar" />
                  </SelectTrigger>
                  <SelectContent
                    alignItemWithTrigger={false}
                    className="max-h-60 overflow-y-auto w-full z-50 bg-popover border rounded-xl shadow-2xl"
                  >
                    {venueOptions.map((venue) => (
                      <SelectItem key={venue.id} value={venue.id}>
                        <span className="block min-w-0 flex-1 truncate">
                          {venue.name}
                        </span>
                        {venue.city ? (
                          <span className="shrink-0 text-xs text-muted-foreground">
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
          selectedVenue.longitude != null &&
          Number.isFinite(selectedVenue.latitude) &&
          Number.isFinite(selectedVenue.longitude) ? (
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
            <MapStudioFields
              form={form}
              venueMap={venueMap}
              selectedVenueName={selectedVenue?.name}
              studioOpen={studioOpen}
              onOpenStudio={openStudio}
              onCloseStudio={() => setStudioOpen(false)}
              onPersistMap={persistMapToForm}
              canOpenStudio={canDesignMap}
              blockedReason={mapBlockedReason}
            />
          ) : null}

          {focus === "all" ? pricingSlot : null}
        </div>
      ) : null}

      {showCreateForm ? (
        <div className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-100 shadow-sm sm:p-5">
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
              <FormItem className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-4">
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
                        Activalo para trazar zonas en el estudio. Precio y
                        cupo se definen ahí, no en Entradas y combos.
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
            <>
          <VenueArgentinaSelector
            value={geoValue}
            onChange={onGeoChange}
            showIdentityFields
          />
          <FormField
            control={form.control}
            name="venue.venueName"
            render={({ fieldState }) => (
              <div data-field="venue.venueName">
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </div>
            )}
          />
          <FormField
            control={form.control}
            name="venue.venueLocation"
            render={({ fieldState }) => (
              <FormMessage>{fieldState.error?.message}</FormMessage>
            )}
          />
            </>
          ) : null}

          {showZones ? (
            <>
          <LogicalSectorsPanel form={form} />
          <MapStudioFields
            form={form}
            venueMap={venueMap}
            selectedVenueName={selectedVenue?.name}
            studioOpen={studioOpen}
            onOpenStudio={openStudio}
            onCloseStudio={() => setStudioOpen(false)}
            onPersistMap={persistMapToForm}
            canOpenStudio={canDesignMap}
            blockedReason={mapBlockedReason}
          />
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
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
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/60 px-4 py-6 text-sm text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-200">
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

            </>
          ) : null}

          {showLocation ? (
            <>
          <FormField
            control={form.control}
            name="venue.saveVenueForReuse"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                <div className="space-y-1">
                  <FormLabel className="text-sm font-medium text-zinc-100">
                    Guardar este lugar para futuros eventos
                  </FormLabel>
                  <FormDescription className="text-xs text-muted-foreground">
                    El recinto nuevo solo se crea con “Guardar recinto”. El
                    autoguardado del evento no genera lugares duplicados.
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

          {(editingSaved || venueMode === "new" || !existingVenueId) && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pendingSave}
                onClick={persistVenueNow}
                className="border-emerald-800 bg-emerald-950/40 text-emerald-200"
              >
                {pendingSave ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                Guardar recinto
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

      <VenueManagerModal
        open={managerOpen}
        onOpenChange={setManagerOpen}
        onCatalogChange={handleCatalogChange}
        catalogOrganizerId={catalogOrganizerId}
      />
    </div>
  )
}

function MapStudioFields({
  form,
  venueMap,
  selectedVenueName,
  studioOpen,
  onOpenStudio,
  onCloseStudio,
  onPersistMap,
  canOpenStudio = true,
  blockedReason,
}: {
  form: UseFormReturn<EventFormValues>
  venueMap: ReturnType<typeof parseVenueMap>
  selectedVenueName?: string
  studioOpen: boolean
  onOpenStudio: () => void
  onCloseStudio: () => void
  onPersistMap: (
    next: ReturnType<typeof parseVenueMap>,
    options?: { syncDrafts?: boolean },
  ) => void
  canOpenStudio?: boolean
  blockedReason?: string
}) {
  return (
    <div className="space-y-3">
      <VenueMapStudioSummary
        map={venueMap}
        onOpen={onOpenStudio}
        disabled={!canOpenStudio}
        disabledReason={blockedReason}
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
          form.watch("venue.venueName") || selectedVenueName || undefined
        }
        value={venueMap}
        tickets={form.watch("tickets")}
        onClose={onCloseStudio}
        onSave={(next) => {
          onPersistMap(next, { syncDrafts: true })
          onCloseStudio()
        }}
        onChange={(next) => onPersistMap(next)}
        onAutoSave={(next) => onPersistMap(next)}
      />
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
