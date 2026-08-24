"use client"

import {
  Archive,
  ArchiveRestore,
  Check,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  upsertVenue,
  deleteVenue,
  listOrganizerVenues,
  setVenueArchived,
  updateVenueIdentity,
  type OrganizerVenue,
} from "@/app/actions/venues"
import { VenueLocationPicker } from "@/components/admin/venue-location-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { VenueCoordinates } from "@/lib/seating/venue-geo"
import { cn } from "@/lib/utils"
import { emptyVenueMap } from "@/types/venue-map"

type VenueDraft = {
  id?: string
  name: string
  address: string
  city: string
  latitude: number | null
  longitude: number | null
  capacity: number | ""
}

function emptyDraft(): VenueDraft {
  return {
    name: "",
    address: "",
    city: "",
    latitude: null,
    longitude: null,
    capacity: "",
  }
}

function draftFromVenue(venue: OrganizerVenue): VenueDraft {
  return {
    id: venue.id,
    name: venue.name,
    address: venue.address || venue.location,
    city: venue.city ?? "",
    latitude: venue.latitude,
    longitude: venue.longitude,
    capacity: venue.capacity > 0 ? venue.capacity : "",
  }
}

function placeParts(city: string | null | undefined) {
  const parts = (city ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    return { province: parts.slice(1).join(", ") }
  }
  return { province: "" }
}

export function VenueManagerModal({
  open,
  onOpenChange,
  onCatalogChange,
  onSelect,
  catalogOrganizerId = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCatalogChange: (venues: OrganizerVenue[]) => void
  onSelect?: (venue: OrganizerVenue) => void
  catalogOrganizerId?: string | null
}) {
  const [venues, setVenues] = useState<OrganizerVenue[]>([])
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<VenueDraft | null>(null)
  const [pending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const onCatalogChangeRef = useRef(onCatalogChange)
  useEffect(() => {
    onCatalogChangeRef.current = onCatalogChange
  }, [onCatalogChange])

  async function refreshCatalog() {
    const next = await listOrganizerVenues({
      includeArchived: true,
      organizerId: catalogOrganizerId ?? undefined,
    })
    setVenues(next)
    onCatalogChangeRef.current(next)
    return next
  }

  const [openSeen, setOpenSeen] = useState(open)
  if (open !== openSeen) {
    setOpenSeen(open)
    if (!open) setDraft(null)
    else setLoading(true)
  }

  useEffect(() => {
    if (!open) return
    void listOrganizerVenues({
      includeArchived: true,
      organizerId: catalogOrganizerId ?? undefined,
    })
      .then((next) => {
        setVenues(next)
        onCatalogChangeRef.current(next)
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "No pudimos cargar los lugares.",
        )
      })
      .finally(() => setLoading(false))
  }, [open, catalogOrganizerId])

  const sorted = useMemo(
    () =>
      [...venues].sort((left, right) => {
        if (left.isArchived !== right.isArchived) {
          return left.isArchived ? 1 : -1
        }
        return left.name.localeCompare(right.name, "es", { sensitivity: "base" })
      }),
    [venues],
  )

  function updateDraft(patch: Partial<VenueDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  const pickerCoordinates: VenueCoordinates | null =
    draft && draft.latitude != null && draft.longitude != null
      ? { latitude: draft.latitude, longitude: draft.longitude }
      : null

  function saveDraft() {
    if (!draft) return
    const capacity = Math.floor(Number(draft.capacity))
    if (!Number.isFinite(capacity) || capacity < 1) {
      toast.error("Ingresá el aforo máximo del recinto.")
      return
    }
    startTransition(async () => {
      const payload = {
        name: draft.name,
        address: draft.address,
        city: draft.city,
        latitude: draft.latitude,
        longitude: draft.longitude,
        capacity,
      }
      const result = draft.id
        ? await updateVenueIdentity({ id: draft.id, ...payload })
        : await upsertVenue({
            name: payload.name,
            location: payload.address,
            city: payload.city,
            latitude: payload.latitude,
            longitude: payload.longitude,
            capacity,
            zones: [],
            seatingLayout: [],
            venueMap: emptyVenueMap(),
          })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(draft.id ? "Lugar actualizado" : "Lugar creado")
      setDraft(null)
      await refreshCatalog()
    })
  }

  function toggleArchive(venue: OrganizerVenue) {
    setPendingId(venue.id)
    startTransition(async () => {
      const result = await setVenueArchived(venue.id, !venue.isArchived)
      setPendingId(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(venue.isArchived ? "Lugar restaurado" : "Lugar archivado")
      await refreshCatalog()
    })
  }

  function removeVenue(venue: OrganizerVenue) {
    if (venue.linkedEventCount > 0) {
      toast.error(
        "No se puede eliminar un recinto con eventos vinculados. Archiválo para ocultarlo del selector.",
      )
      return
    }
    if (
      !window.confirm(
        `¿Querés eliminar esto? Se va a borrar "${venue.name}". Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    setPendingId(venue.id)
    startTransition(async () => {
      const result = await deleteVenue(venue.id)
      setPendingId(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Lugar eliminado")
      if (draft?.id === venue.id) setDraft(null)
      await refreshCatalog()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden border-border bg-card text-card-foreground sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gestionar lugares</DialogTitle>
          <DialogDescription>
            Seleccioná un recinto para este evento, o editalo. Los archivados no
            aparecen al crear un evento nuevo.
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="venue-manager-name">Nombre del recinto</Label>
              <Input
                id="venue-manager-name"
                value={draft.name}
                onChange={(event) => updateDraft({ name: event.target.value })}
                placeholder="Estadio, teatro o salon"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venue-manager-capacity">
                Aforo máximo <span className="text-red-500">*</span>
              </Label>
              <Input
                id="venue-manager-capacity"
                type="number"
                inputMode="numeric"
                min={1}
                required
                value={draft.capacity}
                onChange={(event) => {
                  const raw = event.target.value
                  updateDraft({
                    capacity: raw === "" ? "" : Math.floor(Number(raw)),
                  })
                }}
                placeholder="Ej. 1200"
                className="h-10"
              />
            </div>
            <VenueLocationPicker
              address={draft.address}
              city={draft.city}
              coordinates={pickerCoordinates}
              onAddressChange={(address) => updateDraft({ address })}
              onCityChange={(city) => updateDraft({ city })}
              onCoordinatesChange={(coordinates) =>
                updateDraft({
                  latitude: coordinates.latitude,
                  longitude: coordinates.longitude,
                })
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="venue-manager-lat">Latitud</Label>
                <Input
                  id="venue-manager-lat"
                  type="number"
                  step="any"
                  value={draft.latitude ?? ""}
                  onChange={(event) => {
                    const value = event.target.value
                    updateDraft({
                      latitude: value === "" ? null : Number(value),
                    })
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="venue-manager-lng">Longitud</Label>
                <Input
                  id="venue-manager-lng"
                  type="number"
                  step="any"
                  value={draft.longitude ?? ""}
                  onChange={(event) => {
                    const value = event.target.value
                    updateDraft({
                      longitude: value === "" ? null : Number(value),
                    })
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft(null)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={saveDraft} disabled={pending}>
                Guardar recinto
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {loading
                  ? "Cargando recintos..."
                  : `${sorted.length} recinto${sorted.length === 1 ? "" : "s"}`}
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => setDraft(emptyDraft())}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Nuevo lugar
              </Button>
            </div>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {sorted.map((venue) => {
                const place = placeParts(venue.city)
                const busy = pending && pendingId === venue.id
                return (
                  <li
                    key={venue.id}
                    className={cn(
                      "rounded-xl border border-border p-3",
                      venue.isArchived && "bg-muted/40 opacity-80",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium text-foreground">
                            {venue.name}
                          </p>
                          {venue.isArchived ? (
                            <Badge variant="secondary">Archivado</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" />
                          <span className="min-w-0">
                            {[venue.address || venue.location, venue.city]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {venue.capacity > 0
                            ? `Aforo ${venue.capacity}`
                            : "Sin aforo cargado"}
                          {place.province ? ` · ${place.province}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        {onSelect && !venue.isArchived ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              onSelect(venue)
                              onOpenChange(false)
                            }}
                          >
                            <Check className="size-3.5" aria-hidden="true" />
                            Seleccionar
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => setDraft(draftFromVenue(venue))}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          Editar
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <Switch
                          checked={venue.isArchived}
                          disabled={busy}
                          onCheckedChange={() => toggleArchive(venue)}
                        />
                        <span className="inline-flex items-center gap-1.5">
                          {venue.isArchived ? (
                            <ArchiveRestore className="size-3.5" />
                          ) : (
                            <Archive className="size-3.5" />
                          )}
                          {venue.isArchived ? "Restaurar" : "Archivar"}
                        </span>
                      </label>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={busy || venue.linkedEventCount > 0}
                        title={
                          venue.linkedEventCount > 0
                            ? "Hay eventos vinculados. Archiválo para ocultarlo del selector."
                            : "Eliminar recinto"
                        }
                        onClick={() => removeVenue(venue)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Eliminar
                      </Button>
                    </div>
                  </li>
                )
              })}
              {!loading && sorted.length === 0 ? (
                <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  Todavía no hay recintos. Creá el primero para reutilizarlo en
                  tus eventos.
                </li>
              ) : null}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
