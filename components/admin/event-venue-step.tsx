"use client"

import {
  Armchair,
  Building2,
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
import {
  createEmptyZone,
  SmartVenueBuilder,
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
import { formatNumber } from "@/lib/format"
import {
  draftZonesToBlueprint,
  draftZonesToSeatingLayout,
  totalDraftCapacity,
  zonesToDraft,
} from "@/lib/seating/venue-zone-draft"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

const EventLocationMapInner = dynamic(
  () =>
    import("@/components/public/event-location-map-inner").then(
      (mod) => mod.EventLocationMapInner,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center bg-zinc-950 text-xs text-zinc-500">
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
}

export function EventVenueStep({
  form,
  venues,
  onVenuesChange,
  onAppliedVenue,
  pricingSlot,
}: EventVenueStepProps) {
  const venueMode = form.watch("venue.mode")
  const existingVenueId = form.watch("venue.existingVenueId")
  const zoneType = form.watch("venue.zoneType")
  const selectedVenue = venues.find((venue) => venue.id === existingVenueId)
  const structured = zoneType === "reserved_seating"

  const [editingSaved, setEditingSaved] = useState(false)
  const [zoneDrafts, setZoneDrafts] = useState<VenueZoneDraft[]>([
    createEmptyZone(false),
  ])
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(
    form.getValues("venue.seatingBackgroundUrl") || null,
  )
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
    form.setValue("venue.seatingBackgroundUrl", null)
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
    setZoneDrafts(
      zonesToDraft(venue.id, venue.zoneBlueprint, venue.seatingLayout),
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

    const nextStructured = values.zoneType === "reserved_seating"
    const blueprint = draftZonesToBlueprint(zoneDrafts, nextStructured)
    const seatingLayout = draftZonesToSeatingLayout(zoneDrafts, nextStructured)
    const capacity =
      totalDraftCapacity(zoneDrafts, nextStructured) ||
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
    if (next.capacity > 0 && zoneType === "general_admission") {
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
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
              : "border-white/8 bg-black/15 text-zinc-400",
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
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
              : "border-white/8 bg-black/15 text-zinc-400",
          )}
        >
          Crear un lugar nuevo
        </button>
      </div>

      {venueMode === "existing" && !editingSaved && selectedVenue ? (
        <div className="space-y-4 rounded-2xl border border-white/8 bg-black/20 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-white">
                {selectedVenue.name}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                {[selectedVenue.location, selectedVenue.city]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
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
              className="border-white/10 text-zinc-300"
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
                >
                  <SelectTrigger className="h-11 border-white/10 bg-black/20">
                    <SelectValue placeholder="Elegí un lugar" />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((venue) => (
                      <SelectItem key={venue.id} value={venue.id}>
                        {venue.name}
                        {venue.city ? ` · ${venue.city}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )}
          />

          {selectedVenue.latitude != null &&
          selectedVenue.longitude != null ? (
            <div className="h-48 overflow-hidden rounded-2xl border border-zinc-800 sm:h-56">
              <EventLocationMapInner
                latitude={selectedVenue.latitude}
                longitude={selectedVenue.longitude}
              />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-zinc-500">
              Este lugar todavía no tiene coordenadas en el mapa.
            </p>
          )}

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
                className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2.5 text-sm"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-zinc-200">
                  {item.name}
                </span>
                <span className="text-[11px] text-zinc-500">{item.detail}</span>
              </li>
            ))}
          </ul>

          {pricingSlot}
        </div>
      ) : null}

      {showCreateForm ? (
        <div className="space-y-6 rounded-2xl border border-white/8 bg-black/15 p-4 sm:p-5">
          {editingSaved ? (
            <p className="text-sm text-emerald-300/90">
              Estás editando un lugar guardado. Los cambios se aplican a futuros
              eventos que lo usen.
            </p>
          ) : null}

          <FormField
            control={form.control}
            name="venue.zoneType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>¿Qué tipo de espacio es?</FormLabel>
                <div className="grid gap-3 md:grid-cols-2">
                  {(
                    [
                      {
                        value: "general_admission" as const,
                        title: "Entradas generales",
                        description:
                          "Entradas generales (sin asiento numerado).",
                        icon: Building2,
                      },
                      {
                        value: "reserved_seating" as const,
                        title: "Asientos o mesas numeradas",
                        description:
                          "Asientos o mesas numeradas (a elección).",
                        icon: Armchair,
                      },
                    ] as const
                  ).map((option) => {
                    const selected = field.value === option.value
                    const Icon = option.icon
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          field.onChange(option.value)
                          const nextStructured =
                            option.value === "reserved_seating"
                          setZoneDrafts([createEmptyZone(nextStructured)])
                          form.setValue("venue.zones", undefined)
                        }}
                        className={cn(
                          "flex gap-4 rounded-2xl border p-5 text-left transition duration-200",
                          selected
                            ? "border-emerald-500/40 bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/15"
                            : "border-white/8 bg-black/15 hover:border-white/15",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-11 shrink-0 place-items-center rounded-xl bg-white/5 text-zinc-500",
                            selected && "bg-emerald-500/15 text-emerald-300",
                          )}
                        >
                          <Icon className="size-5" />
                        </span>
                        <span>
                          <span className="block font-semibold text-zinc-200">
                            {option.title}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-zinc-500">
                            {option.description}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </FormItem>
            )}
          />

          <VenueArgentinaSelector
            value={geoValue}
            onChange={onGeoChange}
            showIdentityFields
          />

          <SmartVenueBuilder
            structured={structured}
            zones={zoneDrafts}
            onChange={(next) => syncZonesToForm(next, structured)}
          />

          {structured ? (
            <div className="space-y-3 rounded-2xl border border-white/8 bg-black/20 p-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="size-4 text-emerald-400" />
                <Label className="text-sm text-zinc-200">
                  Imagen o mapa del lugar (Opcional)
                </Label>
              </div>
              {backgroundUrl ? (
                <div className="relative aspect-[16/7] overflow-hidden rounded-xl border border-zinc-800">
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
          ) : (
            <FormField
              control={form.control}
              name="venue.capacity"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Cantidad de personas</FormLabel>
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
                      className="h-11 border-white/10 bg-black/20"
                    />
                  <FormMessage>{fieldState.error?.message}</FormMessage>
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="venue.saveVenueForReuse"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <div className="space-y-1">
                  <FormLabel className="text-sm font-medium text-zinc-100">
                    Guardar este lugar para futuros eventos
                  </FormLabel>
                  <FormDescription className="text-xs text-zinc-500">
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
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
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

          {pricingSlot && venueMode === "existing" ? pricingSlot : null}
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
}) {
  const structured = input.formValues.zoneType === "reserved_seating"
  return {
    name: input.formValues.venueName.trim(),
    location: (input.formValues.venueLocation ?? "").trim(),
    city: input.formValues.venueCity?.trim() || undefined,
    latitude: input.formValues.latitude ?? null,
    longitude: input.formValues.longitude ?? null,
    capacity:
      totalDraftCapacity(input.zoneDrafts, structured) ||
      input.formValues.capacity ||
      1,
    zones: draftZonesToBlueprint(input.zoneDrafts, structured),
    seatingLayout: draftZonesToSeatingLayout(input.zoneDrafts, structured),
    seatingBackgroundUrl: input.backgroundUrl,
  }
}
