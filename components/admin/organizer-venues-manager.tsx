"use client"

import {
  Building2,
  MapPin,
  ImageIcon,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  upsertVenue,
  deleteVenue,
  uploadVenueSeatingBackground,
  type OrganizerVenue,
  type VenueZoneBlueprint,
} from "@/app/actions/venues"
import {
  VenueArgentinaSelector,
  type VenueArgentinaValue,
} from "@/components/admin/venue-argentina-selector"
import { InteractiveVenueMapStudio } from "@/components/admin/interactive-venue-map-studio"
import { VenueMapStudioSummary } from "@/components/admin/venue-map-studio-summary"
import {
  createEmptyZone,
  SmartVenueBuilder,
  type VenueZoneDraft,
} from "@/components/admin/smart-venue-builder"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { formatNumber } from "@/lib/format"
import {
  seatingLayoutToVenueMap,
  venueMapCapacity,
  venueMapHasInventory,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import { venueMapToZoneDrafts } from "@/lib/seating/venue-zone-draft"
import { composeVenuePlace } from "@/lib/venues/compose-location"
import { emptyVenueMap, parseVenueMap, type InteractiveVenueMap } from "@/types/venue-map"
import {
  getVenueSeatingItems,
  type VenueSeatingLayout,
} from "@/types/venues"

type Draft = {
  id?: string
  name: string
  address: string
  city: string
  capacity: string
  latitude: number | null
  longitude: number | null
  provinceId: string | null
  provinceName: string | null
  departmentId: string | null
  departmentName: string | null
  zones: VenueZoneDraft[]
  structured: boolean
  seatingBackgroundUrl: string | null
  venueMap: InteractiveVenueMap
}

function emptyDraft(): Draft {
  return {
    name: "",
    address: "",
    city: "",
    capacity: "",
    latitude: null,
    longitude: null,
    provinceId: null,
    provinceName: null,
    departmentId: null,
    departmentName: null,
    zones: [createEmptyZone()],
    structured: false,
    seatingBackgroundUrl: null,
    venueMap: emptyVenueMap(),
  }
}

function locationLabel(draft: Draft): string {
  return (
    composeVenuePlace({
      street: draft.address,
      department: draft.departmentName,
      province: draft.provinceName,
      city: draft.city,
    }).city ?? draft.city.trim()
  )
}

function draftToLocationValue(draft: Draft): VenueArgentinaValue {
  return {
    venueName: draft.name,
    province:
      draft.provinceId && draft.provinceName
        ? { id: draft.provinceId, name: draft.provinceName }
        : null,
    department:
      draft.departmentId && draft.departmentName
        ? { id: draft.departmentId, name: draft.departmentName }
        : null,
    address: draft.address,
    coordinates:
      draft.latitude != null && draft.longitude != null
        ? { lat: draft.latitude, lng: draft.longitude }
        : null,
    capacity: Number(draft.capacity) || 0,
  }
}

function zonesToDraft(
  venueId: string,
  zones: VenueZoneBlueprint[],
  seatingLayout: VenueSeatingLayout,
): VenueZoneDraft[] {
  return zones.map((zone, index) => {
    const seating = seatingLayout.find(
      (sector) => sector.sector_name === zone.name,
    )
    const legacyItems = seating ? getVenueSeatingItems(seating) : []
    const seatingRows =
      seating?.rows.length
        ? seating.rows
        : legacyItems.length > 0
          ? [
              {
                row_id: `${seating?.id ?? venueId}-legacy-row`,
                row_number: 1,
                row_label: "Fila 1",
                items: legacyItems,
              },
            ]
          : []
    return {
      key: seating?.id ?? `${venueId}-${index}`,
      name: zone.name,
      type: zone.type,
      layoutType: seating?.layout_type ?? "general",
      capacity: String(zone.capacity),
      rows: seatingRows.map((row) => ({
        key: row.row_id,
        label: row.row_label,
        itemCount: String(row.items.length),
        labelPrefix:
          seating?.layout_type === "numbered_seat" ? "Butaca " : "Mesa ",
        capacityPerUnit: String(
          row.items[0]?.capacity ?? seating?.capacity_per_unit ?? 1,
        ),
        items: row.items,
      })),
      color: seating?.color ?? "#10B981",
    }
  })
}

function draftZoneCapacity(zone: VenueZoneDraft, structured = true): number {
  if (!structured || zone.layoutType === "general") {
    return Number(zone.capacity) || 0
  }
  return zone.rows.reduce(
    (total, row) =>
      total +
      row.items.reduce(
        (subtotal, item) => subtotal + Math.max(1, item.capacity),
        0,
      ),
    0,
  )
}

function draftZonesToBlueprint(
  zones: VenueZoneDraft[],
  structured: boolean,
): VenueZoneBlueprint[] {
  return zones.map((zone) => ({
    name: zone.name.trim(),
    type:
      zone.layoutType === "numbered_seat" || zone.layoutType === "table_combo"
        ? "reserved_seating"
        : zone.type === "reserved_seating"
          ? "reserved_seating"
          : "general_admission",
    capacity: draftZoneCapacity(zone, structured),
    rows: null,
    seatsPerRow: null,
  }))
}

function draftZonesToSeatingLayout(
  zones: VenueZoneDraft[],
  structured: boolean,
): VenueSeatingLayout {
  return zones.map((zone) => {
    const defaultCapacity =
      zone.rows[0]?.items[0]?.capacity ??
      (Number(zone.rows[0]?.capacityPerUnit) || 1)
    return {
      id: zone.key,
      sector_name: zone.name.trim(),
      color: zone.color,
      pricing_tier_id: null,
      layout_type: structured ? zone.layoutType : "general",
      capacity_per_unit: Math.max(1, defaultCapacity || 1),
      rows:
        !structured || zone.layoutType === "general"
          ? []
          : zone.rows.map((row, index) => ({
              row_id: row.key,
              row_number: index + 1,
              row_label: row.label.trim(),
              items: row.items,
            })),
    }
  })
}

export function OrganizerVenuesManager({
  initialVenues,
}: {
  initialVenues: OrganizerVenue[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [uploadPending, startUploadTransition] = useTransition()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [studioOpen, setStudioOpen] = useState(false)

  const sectorCapacity =
    draft?.zones.reduce(
      (sum, zone) => sum + draftZoneCapacity(zone, draft.structured),
      0,
    ) ?? 0

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 inline-block rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs text-emerald-700 dark:text-emerald-400">
            LUGARES
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Lugares del evento
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Administrá los locales de tus eventos, ubicá el pin en el mapa y
            armá las zonas con su capacidad de gente.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="h-11 rounded-xl bg-emerald-500 px-5 font-bold text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:bg-emerald-400"
        >
          <Plus className="size-4" aria-hidden="true" />
          Nuevo lugar
        </Button>
      </header>

      {draft ? (
        <form
          className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 p-6 shadow-2xl sm:p-10"
          onSubmit={(event) => {
            event.preventDefault()
            startTransition(async () => {
              if (!draft.provinceId || !draft.departmentId) {
                toast.error(
                  "Seleccioná provincia y departamento de los listados oficiales.",
                )
                return
              }
              if (!draft.address.trim()) {
                toast.error("Elegí una dirección exacta en el buscador.")
                return
              }
              if (draft.latitude == null || draft.longitude == null) {
                toast.error(
                  "Falta el pin en el mapa. Seleccioná una dirección o tocá el mapa.",
                )
                return
              }

              const fromMap =
                draft.structured && venueMapHasInventory(draft.venueMap)
              const mapDrafts = fromMap
                ? venueMapToZoneDrafts(draft.venueMap)
                : draft.zones
              const place = composeVenuePlace({
                street: draft.address,
                department: draft.departmentName,
                province: draft.provinceName,
                city: draft.city,
              })
              const payload = {
                name: draft.name,
                location: place.street || draft.address.trim(),
                city: place.city || locationLabel(draft),
                latitude: draft.latitude,
                longitude: draft.longitude,
                capacity: fromMap
                  ? Math.max(1, venueMapCapacity(draft.venueMap))
                  : Number(draft.capacity),
                zones: draftZonesToBlueprint(mapDrafts, draft.structured),
                seatingLayout: fromMap
                  ? venueMapToSeatingLayout(draft.venueMap)
                  : draftZonesToSeatingLayout(draft.zones, draft.structured),
                seatingBackgroundUrl: draft.seatingBackgroundUrl,
                venueMap: draft.venueMap,
              }
              const result = await upsertVenue({
                id: draft.id,
                ...payload,
              })

              if (!result.success) {
                toast.error(result.error)
                return
              }

              toast.success(
                draft.id ? "Lugar actualizado" : "Lugar creado",
                {
                  description:
                    "La ubicación y las zonas quedaron guardadas.",
                },
              )
              setDraft(null)
              router.refresh()
            })
          }}
        >
          <div className="mb-8 border-b border-zinc-200 dark:border-zinc-800 pb-6">
            <h2 className="text-2xl font-bold text-foreground">
              {draft.id ? "Editar lugar" : "Nuevo lugar"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Nombre, capacidad, zonas y ubicación en el mapa.
            </p>
          </div>

          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Building2
                    className="size-4 text-emerald-700 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  <h3 className="font-bold text-foreground">Datos generales</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label
                      htmlFor="venue-name"
                      className="font-mono text-xs uppercase tracking-wider text-foreground"
                    >
                      Nombre del lugar
                    </Label>
                    <Input
                      id="venue-name"
                      required
                      value={draft.name}
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.target.value })
                      }
                      placeholder="Ej: Estadio Aldo Cantoni, Boliche Complejo X, Teatro Central"
                      className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label
                      htmlFor="venue-capacity"
                      className="font-mono text-xs uppercase tracking-wider text-foreground"
                    >
                      Capacidad de gente
                    </Label>
                    <Input
                      id="venue-capacity"
                      type="number"
                      min={1}
                      required
                      value={draft.capacity}
                      onChange={(event) =>
                        setDraft({ ...draft, capacity: event.target.value })
                      }
                      placeholder="2500"
                      className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
                    />
                  </div>
                </div>
              </section>

              <div className="h-px bg-muted dark:bg-zinc-800" />

              <section className="flex items-center justify-between gap-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    ¿Este lugar tiene asientos numerados, filas o mesas
                    asignadas?
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Apagado mantiene una configuración simple. Activado habilita
                    zonas y filas con distinta cantidad de asientos.
                  </p>
                </div>
                <Switch
                  checked={draft.structured}
                  onCheckedChange={(structured) =>
                    setDraft({ ...draft, structured })
                  }
                  aria-label="Activar constructor de ubicaciones estructuradas"
                />
              </section>

              {draft.structured ? (
                <div className="space-y-3">
                  <VenueMapStudioSummary
                    map={draft.venueMap}
                    onOpen={() => setStudioOpen(true)}
                  />
                  <InteractiveVenueMapStudio
                    open={studioOpen}
                    eventTitle={draft.name || "Lugar"}
                    venueLabel={
                      [draft.address.trim(), locationLabel(draft)]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                    value={draft.venueMap}
                    onClose={() => setStudioOpen(false)}
                    onChange={(next) => {
                      setDraft((current) => ({
                        ...current,
                        venueMap: next,
                        capacity: String(
                          Math.max(1, venueMapCapacity(next)),
                        ),
                      }))
                    }}
                    onSave={(next) => {
                      const numbered = venueMapToZoneDrafts(next)
                      setDraft({
                        ...draft,
                        venueMap: next,
                        zones:
                          numbered.length > 0 ? numbered : draft.zones,
                        capacity:
                          numbered.length > 0
                            ? String(Math.max(1, venueMapCapacity(next)))
                            : draft.capacity,
                      })
                      setStudioOpen(false)
                    }}
                  />
                </div>
              ) : (
                <SmartVenueBuilder
                  structured={draft.structured}
                  zones={draft.zones}
                  onChange={(zones) => setDraft({ ...draft, zones })}
                />
              )}

              {draft.structured ? (
                <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950/50 p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-muted-foreground">
                    <ImageIcon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      Imagen o mapa del lugar (Opcional)
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Subí un PNG o WEBP de hasta 3 MB para usarlo como fondo
                      visual del selector.
                    </p>
                    {draft.seatingBackgroundUrl ? (
                      <div
                        className="mt-4 aspect-[16/7] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 bg-cover bg-center"
                        style={{
                          backgroundImage: `url("${draft.seatingBackgroundUrl}")`,
                        }}
                        role="img"
                        aria-label="Vista previa del mapa del lugar"
                      />
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-muted dark:bg-zinc-800 px-4 text-xs font-semibold text-foreground transition hover:bg-slate-300 dark:hover:bg-zinc-700">
                        <UploadCloud className="size-4" aria-hidden="true" />
                        {uploadPending ? "Subiendo…" : "Subir imagen"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png"
                          className="sr-only"
                          disabled={uploadPending}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            startUploadTransition(async () => {
                              const formData = new FormData()
                              formData.set("file", file)
                              const result =
                                await uploadVenueSeatingBackground(formData)
                              if (!result.success) {
                                toast.error(result.error)
                                return
                              }
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      seatingBackgroundUrl: result.data.url,
                                    }
                                  : current,
                              )
                            })
                          }}
                        />
                      </label>
                      {draft.seatingBackgroundUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              seatingBackgroundUrl: null,
                            })
                          }
                          className="h-10 rounded-xl text-xs text-muted-foreground hover:text-red-400"
                        >
                          Quitar imagen
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
                </section>
              ) : null}

              <div className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 px-4 py-3 text-xs">
                <span className="text-muted-foreground">Personas por zona</span>
                <span
                  className={
                    sectorCapacity > Number(draft.capacity || 0)
                      ? "font-mono font-bold text-red-400"
                      : "font-mono font-bold text-emerald-700 dark:text-emerald-400"
                  }
                >
                  {formatNumber(sectorCapacity)} /{" "}
                  {formatNumber(Number(draft.capacity) || 0)}
                </span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <VenueArgentinaSelector
                key={draft.id ?? "new-venue"}
                showIdentityFields={false}
                value={draftToLocationValue(draft)}
                onChange={(location) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          address: location.address,
                          city:
                            location.department && location.province
                              ? `${location.department.name}, ${location.province.name}`
                              : current.city,
                          latitude: location.coordinates?.lat ?? null,
                          longitude: location.coordinates?.lng ?? null,
                          provinceId: location.province?.id ?? null,
                          provinceName: location.province?.name ?? null,
                          departmentId: location.department?.id ?? null,
                          departmentName: location.department?.name ?? null,
                        }
                      : current,
                  )
                }
              />
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-6">
            <Button
              type="submit"
              disabled={pending}
              className="h-12 rounded-xl bg-emerald-500 px-6 font-bold text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:bg-emerald-400"
            >
              {pending ? "Guardando…" : "Guardar recinto"}
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => setDraft(null)}
              className="h-12 rounded-xl bg-zinc-100 dark:bg-zinc-900 px-6 font-medium text-foreground hover:bg-muted dark:hover:bg-zinc-800"
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {initialVenues.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 px-6 py-16 text-center">
          <Building2 className="mx-auto size-9 text-zinc-700" />
          <h2 className="mt-4 font-bold text-foreground">Todavía no hay lugares</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Creá el primero para reutilizarlo en todos tus eventos.
          </p>
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {initialVenues.map((venue) => (
            <article
              key={venue.id}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-5 transition hover:border-zinc-300 dark:hover:border-zinc-300 dark:hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  <Building2 className="size-5" aria-hidden="true" />
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      setDraft({
                        id: venue.id,
                        name: venue.name,
                        address: venue.address || venue.location,
                        city: venue.city ?? "",
                        capacity: String(venue.capacity),
                        latitude: venue.latitude,
                        longitude: venue.longitude,
                        provinceId: null,
                        provinceName: null,
                        departmentId: null,
                        departmentName: null,
                        zones: zonesToDraft(
                          venue.id,
                          venue.zoneBlueprint,
                          venue.seatingLayout,
                        ),
                        structured: venue.seatingLayout.some(
                          (sector) => sector.layout_type !== "general",
                        ),
                        seatingBackgroundUrl: venue.seatingBackgroundUrl,
                        venueMap: seatingLayoutToVenueMap(
                          venue.seatingLayout,
                          parseVenueMap(venue.venueMap),
                        ),
                      })
                    }
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-foreground hover:bg-muted dark:hover:bg-zinc-800 hover:text-foreground"
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `¿Eliminar el lugar "${venue.name}"?`,
                        )
                      ) {
                        return
                      }
                      startTransition(async () => {
                        const result = await deleteVenue(venue.id)
                        if (!result.success) {
                          toast.error(result.error)
                          return
                        }
                        toast.success("Lugar eliminado")
                        router.refresh()
                      })
                    }}
                    className="rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Eliminar
                  </Button>
                </div>
              </div>

              <h2 className="mt-4 text-lg font-bold text-foreground">{venue.name}</h2>
              <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {[venue.city, venue.address].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 px-2.5 py-1">
                  <Users className="size-3.5" aria-hidden="true" />
                  {formatNumber(venue.capacity)} personas
                </span>
                <span className="rounded-full bg-zinc-100 dark:bg-zinc-900 px-2.5 py-1">
                  {venue.zoneBlueprint.length}{" "}
                  {venue.zoneBlueprint.length === 1 ? "zona" : "zonas"}
                </span>
                {venue.latitude != null ? (
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-400">
                    Ubicación verificada
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
