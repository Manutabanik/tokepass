"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"
import { composeVenuePlace } from "@/lib/venues/compose-location"
import { parseVenueMap, serializeVenueMap, type InteractiveVenueMap } from "@/types/venue-map"
import type {
  VenueSeatingLayout,
  VenueSeatingRow,
  VenueSeatingSector,
} from "@/types/venues"

export type VenueZoneBlueprint = {
  name: string
  type: "general_admission" | "reserved_seating"
  capacity: number
  rows?: number | null
  seatsPerRow?: number | null
}

export type OrganizerVenue = {
  id: string
  name: string
  location: string
  address: string
  city: string | null
  latitude: number | null
  longitude: number | null
  capacity: number
  zoneBlueprint: VenueZoneBlueprint[]
  seatingLayout: VenueSeatingLayout
  venueMap: InteractiveVenueMap
  seatingBackgroundUrl: string | null
  isArchived: boolean
  linkedEventCount: number
  createdAt: string
  updatedAt: string
}

export type ListOrganizerVenuesOptions = {
  includeArchived?: boolean
  includeIds?: string[]
}

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

type VenueMutationInput = {
  name: string
  location: string
  city?: string
  latitude?: number | null
  longitude?: number | null
  capacity: number
  zones?: VenueZoneBlueprint[]
  seatingLayout?: VenueSeatingLayout
  venueMap?: InteractiveVenueMap | null
  seatingBackgroundUrl?: string | null
}

async function requireOrganizer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("auth_required")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "super_admin")
  ) {
    throw new Error("forbidden")
  }

  return { supabase, userId: user.id }
}

function normalizeSeatingLayout(
  raw: VenueSeatingLayout | undefined,
): { success: true; data: VenueSeatingLayout } | { success: false; error: string } {
  const layout = raw ?? []
  if (layout.length > 50) {
    return { success: false, error: "El mapa admite hasta 50 zonas." }
  }

  const sectorIds = new Set<string>()
  let totalItems = 0
  const normalized: VenueSeatingLayout = []

  for (const sector of layout) {
    const id = sector.id.trim()
    const sectorName = sector.sector_name.trim()
    const color = /^#[0-9a-f]{6}$/i.test(sector.color)
      ? sector.color.toUpperCase()
      : "#10B981"
    const capacityPerUnit = Number(sector.capacity_per_unit)

    if (!id || sectorIds.has(id) || !sectorName) {
      return {
        success: false,
        error: "Cada zona de ubicaciones necesita un identificador y nombre únicos.",
      }
    }
    sectorIds.add(id)

    if (
      !["general", "table_combo", "numbered_seat"].includes(
        sector.layout_type,
      )
    ) {
      return { success: false, error: `Tipo inválido en "${sectorName}".` }
    }

    if (
      !Number.isInteger(capacityPerUnit) ||
      capacityPerUnit < 1 ||
      capacityPerUnit > 100
    ) {
      return {
        success: false,
        error: `La cantidad de personas por unidad de "${sectorName}" es inválida.`,
      }
    }

    const itemIds = new Set<string>()
    const rowIds = new Set<string>()
    const rowNumbers = new Set<number>()
    const sourceRows = sector.layout_type === "general" ? [] : sector.rows
    const rows: VenueSeatingRow[] = []

    if (sourceRows.length > 200) {
      return {
        success: false,
        error: `La zona "${sectorName}" admite hasta 200 filas.`,
      }
    }

    for (const sourceRow of sourceRows) {
      const rowId = sourceRow.row_id.trim()
      const rowLabel = sourceRow.row_label.trim()
      const rowNumber = Number(sourceRow.row_number)
      if (
        !rowId ||
        !rowLabel ||
        !Number.isInteger(rowNumber) ||
        rowNumber < 1 ||
        rowIds.has(rowId) ||
        rowNumbers.has(rowNumber)
      ) {
        return {
          success: false,
          error: `Las filas de "${sectorName}" necesitan ID, número y nombre únicos.`,
        }
      }
      rowIds.add(rowId)
      rowNumbers.add(rowNumber)

      const items = []
      for (const sourceItem of sourceRow.items) {
        const item = {
          id: sourceItem.id.trim(),
          label: sourceItem.label.trim(),
          capacity: Number(sourceItem.capacity || capacityPerUnit),
          status:
            sourceItem.status === "blocked"
              ? ("blocked" as const)
              : ("available" as const),
        }
        if (
          !item.id ||
          !item.label ||
          itemIds.has(item.id) ||
          !Number.isInteger(item.capacity) ||
          item.capacity < 1 ||
          item.capacity > 100
        ) {
          return {
            success: false,
            error: `Hay ubicaciones duplicadas o incompletas en "${rowLabel}".`,
          }
        }
        itemIds.add(item.id)
        items.push(item)
      }
      rows.push({
        row_id: rowId,
        row_number: rowNumber,
        row_label: rowLabel,
        items,
      })
    }

    const legacyItems =
      sector.layout_type === "general"
        ? []
        : (sector.items ?? []).map((sourceItem) => ({
            id: sourceItem.id.trim(),
            label: sourceItem.label.trim(),
            capacity: Number(sourceItem.capacity || capacityPerUnit),
            status:
              sourceItem.status === "blocked"
                ? ("blocked" as const)
                : ("available" as const),
          }))

    for (const item of legacyItems) {
      if (
        !item.id ||
        !item.label ||
        itemIds.has(item.id) ||
        !Number.isInteger(item.capacity) ||
        item.capacity < 1 ||
        item.capacity > 100
      ) {
        return {
          success: false,
          error: `Hay ubicaciones duplicadas o incompletas en "${sectorName}".`,
        }
      }
      itemIds.add(item.id)
    }

    if (sector.layout_type !== "general" && itemIds.size === 0) {
      return {
        success: false,
        error: `Generá al menos una ubicación para "${sectorName}".`,
      }
    }

    totalItems += itemIds.size
    if (totalItems > 5000) {
      return {
        success: false,
        error: "El lugar admite hasta 5.000 ubicaciones numeradas.",
      }
    }

    normalized.push({
      id,
      sector_name: sectorName,
      color,
      pricing_tier_id: sector.pricing_tier_id ?? null,
      layout_type: sector.layout_type,
      capacity_per_unit: capacityPerUnit,
      ...(legacyItems.length > 0 ? { items: legacyItems } : {}),
      rows,
    })
  }

  return { success: true, data: normalized }
}

function parseSeatingLayout(raw: unknown): VenueSeatingLayout {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw) ? [raw] : raw
  if (!Array.isArray(input)) return []

  const sectors: VenueSeatingSector[] = []
  for (const item of input) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const layoutType =
      row.layout_type === "table_combo" || row.layout_type === "numbered_seat"
        ? row.layout_type
        : "general"
    const parseItems = (rawItems: unknown[], fallbackCapacity: number) =>
      rawItems.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return []
      const value = entry as Record<string, unknown>
      const id = String(value.id ?? "").trim()
      const label = String(value.label ?? "").trim()
      if (!id || !label) return []
      return [
        {
          id,
          label,
          capacity: Math.max(
            1,
            Math.min(100, Number(value.capacity) || fallbackCapacity),
          ),
          status:
            value.status === "blocked"
              ? ("blocked" as const)
              : ("available" as const),
        },
      ]
      })
    const capacityPerUnit = Math.max(
      1,
      Math.min(
        100,
        Number(row.default_capacity_per_unit ?? row.capacity_per_unit) || 1,
      ),
    )
    const items = parseItems(
      Array.isArray(row.items) ? row.items : [],
      capacityPerUnit,
    )
    const rawRows = Array.isArray(row.rows) ? row.rows : []
    const rows = rawRows.flatMap((entry, index) => {
      if (!entry || typeof entry !== "object") return []
      const value = entry as Record<string, unknown>
      const rowId = String(value.row_id ?? "").trim()
      const rowNumber = Number(value.row_number) || index + 1
      const rowLabel =
        String(value.row_label ?? "").trim() || `Fila ${rowNumber}`
      if (!rowId) return []
      return [
        {
          row_id: rowId,
          row_number: rowNumber,
          row_label: rowLabel,
          items: parseItems(
            Array.isArray(value.items) ? value.items : [],
            capacityPerUnit,
          ),
        },
      ]
    })
    const id = String(row.id ?? row.sector_id ?? "").trim()
    const sectorName = String(row.sector_name ?? row.name ?? "").trim()
    if (!id || !sectorName) continue
    sectors.push({
      id,
      sector_name: sectorName,
      color: /^#[0-9a-f]{6}$/i.test(String(row.color ?? ""))
        ? String(row.color).toUpperCase()
        : "#10B981",
      pricing_tier_id:
        typeof row.pricing_tier_id === "string" ? row.pricing_tier_id : null,
      layout_type: layoutType,
      capacity_per_unit: capacityPerUnit,
      ...(items.length > 0 ? { items } : {}),
      rows,
    })
  }
  return sectors
}

function normalizeVenueInput(input: VenueMutationInput):
  | {
      success: true
      data: {
        name: string
        location: string
        city: string | null
        latitude: number | null
        longitude: number | null
        capacity: number
        zones: VenueZoneBlueprint[]
        seatingLayout: VenueSeatingLayout
        venueMap: InteractiveVenueMap
        seatingBackgroundUrl: string | null
      }
    }
  | { success: false; error: string } {
  const name = input.name.trim()
  const location = input.location.trim()
  const city = input.city?.trim() || null
  const capacity = Number(input.capacity)
  const latitude = input.latitude == null ? null : Number(input.latitude)
  const longitude = input.longitude == null ? null : Number(input.longitude)
  const seating = normalizeSeatingLayout(input.seatingLayout)
  if (!seating.success) return seating
  const seatingBackgroundUrl = input.seatingBackgroundUrl?.trim() || null

  if (!name || !location) {
    return { success: false, error: "Nombre y dirección son obligatorios." }
  }
  if (!Number.isInteger(capacity) || capacity < 1) {
    return {
      success: false,
      error: "La cantidad máxima de personas debe ser un entero mayor a cero.",
    }
  }
  if (
    (latitude == null) !== (longitude == null) ||
    (latitude != null &&
      (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
    (longitude != null &&
      (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))
  ) {
    return { success: false, error: "Las coordenadas del lugar son inválidas." }
  }

  const zones = input.zones ?? []
  for (const zone of zones) {
    zone.name = zone.name.trim()
    zone.capacity = Number(zone.capacity)
    if (!zone.name || !Number.isInteger(zone.capacity) || zone.capacity < 1) {
      return {
        success: false,
        error: "Cada zona necesita nombre y cantidad de personas válida.",
      }
    }
    if (zone.type === "reserved_seating") {
      zone.rows = Number(zone.rows)
      zone.seatsPerRow = Number(zone.seatsPerRow)
      if (
        !Number.isInteger(zone.rows) ||
        !Number.isInteger(zone.seatsPerRow) ||
        Number(zone.rows) < 1 ||
        Number(zone.seatsPerRow) < 1 ||
        Number(zone.rows) * Number(zone.seatsPerRow) !== zone.capacity
      ) {
        return {
          success: false,
          error:
            `El sector "${zone.name}" debe cumplir filas × asientos = capacidad.`,
        }
      }
    } else {
      zone.rows = null
      zone.seatsPerRow = null
    }
  }

  const sectorCapacity = zones.reduce((sum, zone) => sum + zone.capacity, 0)
  if (sectorCapacity > capacity) {
    return {
      success: false,
      error: "La suma de las zonas no puede superar la cantidad máxima de personas.",
    }
  }

  return {
    success: true,
    data: {
      name,
      location,
      city,
      latitude,
      longitude,
      capacity,
      zones,
      seatingLayout: seating.data,
      venueMap: serializeVenueMap(parseVenueMap(input.venueMap)),
      seatingBackgroundUrl,
    },
  }
}

function parseBlueprint(raw: unknown): VenueZoneBlueprint[] {
  if (!Array.isArray(raw)) return []
  const zones: VenueZoneBlueprint[] = []
  for (const item of raw) {
    const z = item as Record<string, unknown>
    const name = String(z.name ?? "").trim()
    const capacity = Number(z.capacity ?? 0)
    const type =
      z.type === "reserved_seating"
        ? ("reserved_seating" as const)
        : ("general_admission" as const)
    if (!name || !Number.isFinite(capacity) || capacity <= 0) continue
    const rowsRaw = z.rows ?? z.seats_rows
    const seatsRaw = z.seatsPerRow ?? z.seats_per_row
    const rows =
      rowsRaw != null && Number.isFinite(Number(rowsRaw))
        ? Number(rowsRaw)
        : null
    const seatsPerRow =
      seatsRaw != null && Number.isFinite(Number(seatsRaw))
        ? Number(seatsRaw)
        : null
    zones.push({ name, type, capacity, rows, seatsPerRow })
  }
  return zones
}

function missingArchivedColumn(message: string) {
  return /is_archived|schema cache|PGRST204|42703/i.test(message)
}

function revalidateVenuePaths() {
  revalidatePath("/admin/venues")
  revalidatePath("/admin/events")
  revalidatePath("/admin/events/create")
}

function mapVenueRow(
  row: Record<string, unknown>,
  linkedEventCount: number,
): OrganizerVenue {
  const cleaned = composeVenuePlace({
    street: String(row.address ?? row.location ?? ""),
    city: (row.city as string | null) ?? null,
  })
  return {
    id: String(row.id),
    name: String(row.name),
    location: cleaned.display || String(row.location ?? ""),
    address: cleaned.street || String(row.address ?? row.location ?? ""),
    city: cleaned.city ?? ((row.city as string | null) ?? null),
    latitude:
      row.latitude == null || !Number.isFinite(Number(row.latitude))
        ? null
        : Number(row.latitude),
    longitude:
      row.longitude == null || !Number.isFinite(Number(row.longitude))
        ? null
        : Number(row.longitude),
    capacity: Number(row.capacity),
    zoneBlueprint: parseBlueprint(row.zone_blueprint),
    seatingLayout: parseSeatingLayout(row.seating_layout),
    venueMap: parseVenueMap(row.venue_map),
    seatingBackgroundUrl:
      typeof row.seating_background_url === "string"
        ? row.seating_background_url
        : null,
    isArchived: Boolean(row.is_archived),
    linkedEventCount,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function sortVenuesByName(venues: OrganizerVenue[]) {
  return [...venues].sort((left, right) =>
    left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
  )
}

function parseCoordinate(
  value: number | null | undefined,
  min: number,
  max: number,
): number | null {
  if (value == null) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null
  return parsed
}

export async function listOrganizerVenues(
  options: ListOrganizerVenuesOptions = {},
): Promise<OrganizerVenue[]> {
  const { supabase, userId } = await requireOrganizer()
  const includeArchived = Boolean(options.includeArchived)
  const includeIds = new Set(
    (options.includeIds ?? []).map((id) => id.trim()).filter(Boolean),
  )

  const [{ data, error }, { data: eventRows }] = await Promise.all([
    supabase
      .from("venues")
      .select("*")
      .eq("organizer_id", userId)
      .order("name", { ascending: true }),
    supabase
      .from("events")
      .select("venue_id")
      .eq("organizer_id", userId)
      .not("venue_id", "is", null),
  ])

  if (error) throw new Error(error.message)

  const eventCount = new Map<string, number>()
  for (const row of eventRows ?? []) {
    const id = row.venue_id
    if (!id) continue
    eventCount.set(id, (eventCount.get(id) ?? 0) + 1)
  }

  const mapped = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return mapVenueRow(r, eventCount.get(String(r.id)) ?? 0)
  })

  return sortVenuesByName(
    mapped.filter(
      (venue) =>
        includeArchived || !venue.isArchived || includeIds.has(venue.id),
    ),
  )
}

export async function createVenue(
  input: VenueMutationInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, userId } = await requireOrganizer()
    const normalized = normalizeVenueInput(input)
    if (!normalized.success) return normalized
    const {
      name,
      location,
      city,
      latitude,
      longitude,
      capacity,
      zones,
      seatingLayout,
      venueMap,
      seatingBackgroundUrl,
    } = normalized.data
    const { data, error } = await supabase
      .from("venues")
      .insert({
        organizer_id: userId,
        name,
        location,
        address: location,
        city,
        latitude,
        longitude,
        capacity,
        zone_blueprint: zones as unknown as Json,
        seating_layout: seatingLayout as unknown as Json,
        venue_map: serializeVenueMap(venueMap) as unknown as Json,
        seating_background_url: seatingBackgroundUrl,
        is_archived: false,
      } as never)
      .select("id")
      .single()

    if (error && missingArchivedColumn(error.message)) {
      const retry = await supabase
        .from("venues")
        .insert({
          organizer_id: userId,
          name,
          location,
          address: location,
          city,
          latitude,
          longitude,
          capacity,
          zone_blueprint: zones as unknown as Json,
          seating_layout: seatingLayout as unknown as Json,
          venue_map: serializeVenueMap(venueMap) as unknown as Json,
          seating_background_url: seatingBackgroundUrl,
        } as never)
        .select("id")
        .single()
      if (retry.error || !retry.data) {
        return {
          success: false,
          error: retry.error?.message ?? "No se pudo crear.",
        }
      }
      revalidateVenuePaths()
      return { success: true, data: { id: retry.data.id } }
    }

    if (error || !data) {
      return { success: false, error: error?.message ?? "No se pudo crear." }
    }

    revalidateVenuePaths()
    return { success: true, data: { id: data.id } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No pudimos crear el lugar.",
    }
  }
}

export async function updateVenue(input: {
  id: string
} & VenueMutationInput): Promise<ActionResult> {
  try {
    const { supabase, userId } = await requireOrganizer()
    const normalized = normalizeVenueInput(input)
    if (!normalized.success) return normalized
    const {
      name,
      location,
      city,
      latitude,
      longitude,
      capacity,
      zones,
      seatingLayout,
      venueMap,
      seatingBackgroundUrl,
    } = normalized.data
    const { data, error } = await supabase
      .from("venues")
      .update({
        name,
        location,
        address: location,
        city,
        latitude,
        longitude,
        capacity,
        zone_blueprint: zones as unknown as Json,
        seating_layout: seatingLayout as unknown as Json,
        venue_map: serializeVenueMap(venueMap) as unknown as Json,
        seating_background_url: seatingBackgroundUrl,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", input.id)
      .eq("organizer_id", userId)
      .select("id")
      .maybeSingle()

    if (error) return { success: false, error: error.message }
    if (!data) return { success: false, error: "No encontramos ese lugar." }

    revalidateVenuePaths()
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No pudimos actualizar el lugar.",
    }
  }
}

export async function updateVenueIdentity(input: {
  id: string
  name: string
  address: string
  city?: string | null
  latitude?: number | null
  longitude?: number | null
}): Promise<ActionResult> {
  try {
    const { supabase, userId } = await requireOrganizer()
    const name = input.name.trim()
    const address = input.address.trim()
    const city = input.city?.trim() || null
    const latitude = parseCoordinate(input.latitude, -90, 90)
    const longitude = parseCoordinate(input.longitude, -180, 180)

    if (!name || !address) {
      return { success: false, error: "Nombre y dirección son obligatorios." }
    }
    if ((latitude == null) !== (longitude == null)) {
      return { success: false, error: "Las coordenadas del lugar son inválidas." }
    }
    if (
      (input.latitude != null && latitude == null) ||
      (input.longitude != null && longitude == null)
    ) {
      return { success: false, error: "Las coordenadas del lugar son inválidas." }
    }

    const { data, error } = await supabase
      .from("venues")
      .update({
        name,
        location: address,
        address,
        city,
        latitude,
        longitude,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", input.id)
      .eq("organizer_id", userId)
      .select("id")
      .maybeSingle()

    if (error) return { success: false, error: error.message }
    if (!data) return { success: false, error: "No encontramos ese lugar." }

    revalidateVenuePaths()
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No pudimos actualizar el lugar.",
    }
  }
}

export async function setVenueArchived(
  venueId: string,
  archived: boolean,
): Promise<ActionResult> {
  try {
    const { supabase, userId } = await requireOrganizer()
    const { data, error } = await supabase
      .from("venues")
      .update({
        is_archived: archived,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", venueId)
      .eq("organizer_id", userId)
      .select("id")
      .maybeSingle()

    if (error) {
      if (missingArchivedColumn(error.message)) {
        return {
          success: false,
          error:
            "Todavía no se puede archivar recintos. Actualizá la base de datos e intentá de nuevo.",
        }
      }
      return { success: false, error: error.message }
    }
    if (!data) return { success: false, error: "No encontramos ese lugar." }

    revalidateVenuePaths()
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "No pudimos archivar el lugar.",
    }
  }
}

export async function deleteVenue(venueId: string): Promise<ActionResult> {
  try {
    const { supabase, userId } = await requireOrganizer()
    const { count, error: countError } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)

    if (countError) return { success: false, error: countError.message }
    if ((count ?? 0) > 0) {
      return {
        success: false,
        error:
          "No se puede eliminar un recinto con eventos vinculados. Archiválo para ocultarlo del selector.",
      }
    }

    const { error } = await supabase
      .from("venues")
      .delete()
      .eq("id", venueId)
      .eq("organizer_id", userId)

    if (error) return { success: false, error: error.message }

    revalidateVenuePaths()
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No pudimos eliminar el lugar.",
    }
  }
}

export async function uploadVenueSeatingBackground(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  try {
    const { supabase, userId } = await requireOrganizer()
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "Seleccioná una imagen o mapa del lugar." }
    }
    const type =
      file.type === "image/jpg"
        ? "image/jpeg"
        : file.type ||
          (file.name.toLowerCase().endsWith(".png")
            ? "image/png"
            : file.name.toLowerCase().endsWith(".webp")
              ? "image/webp"
              : /\.jpe?g$/i.test(file.name)
                ? "image/jpeg"
                : "")
    if (!["image/png", "image/webp", "image/jpeg"].includes(type)) {
      return { success: false, error: "La imagen debe ser JPG o PNG." }
    }
    if (file.size > 3 * 1024 * 1024) {
      return { success: false, error: "La imagen no puede superar los 3 MB." }
    }

    const safeName = (file.name || "mapa.png")
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase()
      .slice(0, 80)
    const path = `${userId}/venues/${Date.now()}-${safeName}`
    const { error } = await supabase.storage
      .from("event-flyers")
      .upload(path, file, {
        cacheControl: "3600",
        contentType: type,
        upsert: false,
      })

    if (error) {
      return {
        success: false,
        error: `No pudimos subir la imagen: ${error.message}`,
      }
    }

    const { data } = supabase.storage.from("event-flyers").getPublicUrl(path)
    if (!data.publicUrl) {
      await supabase.storage.from("event-flyers").remove([path])
      return { success: false, error: "No pudimos publicar la imagen." }
    }

    return { success: true, data: { url: data.publicUrl } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No pudimos subir la imagen.",
    }
  }
}
