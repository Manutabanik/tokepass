"use server"

import { revalidatePath } from "next/cache"
import { revalidatePublicEventCache } from "@/lib/events/revalidate-public-event"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  bytesToBlob,
  detectRasterImageMagic,
  rasterContentType,
  readFileBytes,
} from "@/lib/media/image-magic"
import { publicEventPreviewPath } from "@/lib/preview/sandbox"
import { getSeoOrigin } from "@/lib/seo/site"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { isPlatformOwnerRole } from "@/lib/auth/platform-owner"
import { persistEventLineupSnapshot } from "@/app/actions/artists"
import {
  EVENT_ARTISTS_LINEUP_SELECT,
  EVENT_ARTISTS_LINEUP_SELECT_LEGACY,
  EVENT_ARTISTS_LINEUP_SELECT_LEGACY_NO_PREVIEW,
  EVENT_ARTISTS_LINEUP_SELECT_NO_PREVIEW,
  lineupDraftsFromItems,
  mapLineupItem,
  performanceTimeToInput,
} from "@/lib/artists"
import { parseEventLineup } from "@/lib/event-lineup"
import { persistTicketDayId } from "@/lib/inventory/day-ticket-coverage"
import {
  validateEventCompleteness as runEventPublishCheck,
} from "@/lib/events/validate-event-publish"
import {
  isMissingSaleWindowSchema,
  saleWindowToFormValue,
  saleWindowToIso,
} from "@/lib/inventory/ticket-sale-window"
import {
  isMultiDaySchedule,
  normalizeScheduleDaysFromForm,
  parseDateTimeLocal,
  parseScheduleDays,
  scheduleDaysToFormValues,
  toDatetimeLocalInput,
} from "@/lib/event-schedule"
import {
  parseDefaultTicketTab,
  parseTicketHighlightBadge,
  TICKET_DESCRIPTION_MAX,
} from "@/lib/checkout/ticket-picker"
import {
  inferBundleType,
  normalizePromoRule,
  parseBundleType,
  parsePromoDiscountType,
  promotionalBundlePrice,
  regularBundlePrice,
} from "@/lib/inventory/flexible-bundles"
import {
  inferInventoryTierType,
  layoutTypeForInventory,
  parseBundleItems,
  serializeBundleItems,
  ticketCategoryForInventory,
} from "@/lib/inventory/unified-inventory"
import { allInBreakdown } from "@/lib/pricing/all-in"
import {
  clampServiceFeePercentage,
  priceFromNetProfit,
  resolveTicketNetProfit,
} from "@/lib/pricing/net-profit"
import {
  DEFAULT_PLATFORM_FEE_PERCENTAGE,
  defaultEventFeeConfig,
  eventFeeRate,
  eventFixedFee,
  sumFreeTicketCapacity,
  type EventFeeConfig,
} from "@/lib/pricing/event-fees"
import {
  AGE_RESTRICTION_VALUES,
  MAX_EVENT_FLYER_BYTES,
  coerceDraftEventForm,
  draftEventSchema,
  parseEventRefundPolicy,
  publishEventSchema,
  type AgeRestriction,
  type DraftEventFormValues,
  type EventFormValues,
} from "@/lib/validations/event-form"
import {
  eventAcceptsMercadoPago,
  eventAcceptsPosPayments,
} from "@/lib/events/checkout-policy"
import { formHasInventoryOrVenue } from "@/lib/events/event-inventory-fingerprint"
import { resolvePurchaseLimit } from "@/lib/checkout-limits"
import { asUuidOrNull } from "@/lib/validations/relation-id"
import type { Database, Event, EventStatus, Json, Venue } from "@/types/database"
import { computeEventCapacityFromForm } from "@/lib/inventory/capacity-budget"
import {
  parseVenueMap,
  serializeVenueMap,
  type InteractiveVenueMap,
} from "@/types/venue-map"
import {
  venueMapHasInventory,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import { composeVenuePlace } from "@/lib/venues/compose-location"
import {
  canPersistCatalogVenueName,
  normalizeExactVenueName,
} from "@/lib/venues/venue-identity"
import { isStreamingVenue } from "@/lib/venues/streaming-venue"
import {
  isOnlineDelivery,
  normalizeAccessLink,
  parseDeliveryMode,
} from "@/lib/events/delivery-mode"
import {
  applyMapCapacityToTickets,
  layoutTypeForMapSectorId,
  priceGroupSectorId,
} from "@/lib/seating/venue-map-pricing"
import { listVenuePriceGroups } from "@/lib/seating/venue-price-groups"
import {
  listAssignableGeneralSectors,
  logicalSectorId,
  normalizeLogicalSectors,
  zoneIndexForSectorId,
} from "@/lib/inventory/logical-sectors"
import { notifyOrganizerEventAudit } from "@/lib/events/notify-event-audit"
import { isSandboxEventStatus } from "@/lib/events/review-status"
import { logger } from "@/lib/logger"
import { writeSecurityAuditLog } from "@/lib/security/audit-log"
import { mapUnknownError } from "@/lib/errors/error-handler"
import type { AppErrorCode } from "@/lib/errors/app-error"
import {
  logPersistError,
  persistErrorLogLabel,
  persistErrorUserMessage,
  type PersistErrorSource,
} from "@/lib/errors/persist-error"
import { fieldFromAppError } from "@/lib/errors/form-field"
import { actionHintFromError } from "@/lib/errors/guided-action"
import {
  type WizardConflict,
} from "@/lib/seating/venue-map-sku-consistency"
import {
  collectLiveSeatingSectorIds,
  detachTicketsFromSeatingPlan,
  reconcileTicketTierIds,
  reconcileTicketsWithExistingRows,
  resolvePersistableTicketSectorId,
  sanitizeDeepSeatingRefs,
  sanitizeSeatingSectorIds,
  sanitizeTicketTiersForPersist,
} from "@/lib/events/sanitize-ticket-tiers"
import {
  eventHasActiveSeatingMap,
} from "@/lib/inventory/map-enablement"
import { prepareEventForPersist } from "@/lib/inventory/prepare-event-persist"
import { resolveVenueSeatingArtifactsForPersist } from "@/lib/inventory/venue-seating-persist"

export type OrganizerEvent = Pick<
  Event,
  | "id"
  | "title"
  | "description"
  | "date"
  | "location"
  | "image_url"
  | "status"
  | "venue_id"
  | "created_at"
  | "is_featured"
  | "featured_tier"
  | "featured_until"
  | "review_note"
> & {
  venues: Pick<Venue, "id" | "name" | "location"> | null
  ticketsSold: number
  paidOrderCount: number
}

async function requireAuthenticatedUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error("Debes iniciar sesión para administrar eventos.")
  }

  return { supabase, user }
}

async function countPaidOrdersByEventIds(
  eventIds: string[],
): Promise<Map<string, number>> {
  const paidByEvent = new Map<string, number>()
  if (eventIds.length === 0) return paidByEvent

  const admin = createAdminClient()
  const { data: ticketRows, error } = await admin
    .from("tickets")
    .select("event_id, order_id")
    .in("event_id", eventIds)
    .not("order_id", "is", null)

  if (error) {
    throw new Error(`No se pudieron leer las ventas pagadas: ${error.message}`)
  }

  const orderIds = [
    ...new Set(
      (ticketRows ?? [])
        .map((row) => row.order_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  if (orderIds.length === 0) return paidByEvent

  const { data: paidOrders, error: paidError } = await admin
    .from("orders")
    .select("id")
    .eq("status", "paid")
    .in("id", orderIds)

  if (paidError) {
    throw new Error(`No se pudieron leer las órdenes pagadas: ${paidError.message}`)
  }

  const paidIds = new Set((paidOrders ?? []).map((row) => row.id))
  const uniquePaid = new Map<string, Set<string>>()
  for (const row of ticketRows ?? []) {
    if (!row.order_id || !paidIds.has(row.order_id)) continue
    const bucket = uniquePaid.get(row.event_id) ?? new Set<string>()
    bucket.add(row.order_id)
    uniquePaid.set(row.event_id, bucket)
  }
  for (const [eventId, orders] of uniquePaid) {
    paidByEvent.set(eventId, orders.size)
  }
  return paidByEvent
}

async function countPaidOrdersForEvent(eventId: string): Promise<number> {
  const counts = await countPaidOrdersByEventIds([eventId])
  return counts.get(eventId) ?? 0
}

export async function getOrganizerEvents(): Promise<OrganizerEvent[]> {
  const { supabase, user } = await requireAuthenticatedUser()
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, description, date, location, image_url, status, venue_id, created_at, is_featured, featured_tier, featured_until, review_note, venues(id, name, location)",
    )
    .eq("organizer_id", user.id)
    .order("date", { ascending: true })

  if (error) {
    throw new Error(`No se pudieron cargar los eventos: ${error.message}`)
  }

  const events = data ?? []
  if (events.length === 0) return []

  const eventIds = events.map((event) => event.id)
  const { data: ticketRows, error: ticketsError } = await supabase
    .from("tickets")
    .select("event_id, status")
    .in("event_id", eventIds)
    .in("status", ["valid", "used", "scanned", "pending_payment"])

  if (ticketsError) {
    throw new Error(
      `No se pudo calcular ventas por evento: ${ticketsError.message}`,
    )
  }

  const soldByEvent = new Map<string, number>()
  for (const row of ticketRows ?? []) {
    soldByEvent.set(row.event_id, (soldByEvent.get(row.event_id) ?? 0) + 1)
  }

  const paidByEvent = await countPaidOrdersByEventIds(eventIds)

  return events.map((event) => ({
    ...event,
    ticketsSold: soldByEvent.get(event.id) ?? 0,
    paidOrderCount: paidByEvent.get(event.id) ?? 0,
  }))
}

/** JSON contract expected by the atomic event + seating RPC wrappers. */
export type CreateCompleteEventRpcPayload = {
  title: string
  description: string
  date: string
  ends_at: string | null
  location: string
  image_url: string | null
  flyer_url: string | null
  visibility: "public" | "private" | "guest_list_only"
  category_id: string
  age_restriction: AgeRestriction
  schedule_days?: Array<{
    id: string
    title: string
    start_time: string
    end_time: string
  }>
  venue_id?: string | null
  venue: {
    name: string
    location: string
    city?: string | null
    capacity: number
  }
  zones: Array<{
    name: string
    type: "general_admission" | "reserved_seating"
    capacity: number
    rows: number | null
    seats_per_row: number | null
  }>
  tiers: Array<{
    id?: string
    name: string
    price: number
    base_price: number
    platform_fee: number
    capacity: number
    time_limit: string | null
    bonus_reward: string | null
    zone_index: number
    day_id: string | null
    visibility: "public" | "private"
    layout_type: "general" | "table_combo" | "numbered_seat"
    seating_sector_id: string | null
    /** Alias de seating_sector_id. NULL = SKU flotante. */
    sector_id?: string | null
    capacity_per_unit: number
    min_purchase_limit?: number
    max_purchase_limit?: number | null
    admit_count?: number
    total_capacity?: number
    tier_type?: string
    bundle_type?: string | null
    bundle_items?: Array<{ tier_id: string; quantity: number }>
    list_price?: number | null
    is_free?: boolean
    is_active?: boolean
    event_day_id?: string | null
  }>
  rrpp_commission: number | null
  addons_enabled: boolean
}

function assertFreeTicketCapacityAllowed(
  tickets: EventFormValues["tickets"],
  maxFreeTickets: number,
  isSuperAdmin: boolean,
): string | null {
  if (isSuperAdmin) return null
  const freeCapacity = sumFreeTicketCapacity(tickets)
  if (freeCapacity <= maxFreeTickets) return null
  return `El cupo total de entradas gratuitas (${freeCapacity}) supera el máximo permitido (${maxFreeTickets}). Pedile a TokePass que amplíe el límite o bajá la capacidad de los tiers a $0.`
}

async function loadEventFeeConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
): Promise<EventFeeConfig> {
  const { data } = await supabase
    .from("events")
    .select(
      "platform_fee_percentage, platform_fixed_fee, max_free_tickets, is_sponsored_by_tokepass",
    )
    .eq("id", eventId)
    .maybeSingle()

  if (!data) return defaultEventFeeConfig()

  return {
    platformFeePercentage: Number(data.platform_fee_percentage ?? 8),
    platformFixedFee: Number(data.platform_fixed_fee ?? 0),
    maxFreeTickets: Number(data.max_free_tickets ?? 100),
    isSponsoredByTokePass: Boolean(data.is_sponsored_by_tokepass),
  }
}

function formDateToIso(value: string | null | undefined, fallback: string): string {
  return parseDateTimeLocal(value ?? "")?.toISOString() ?? fallback
}

function positiveInventoryCapacity(value: unknown): number {
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function persistablePublicPrice(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function resolveFormFeeConfig(
  _data: EventFormValues,
  fallback: EventFeeConfig,
): EventFeeConfig {
  return fallback
}

async function persistEventServiceFeePercentage(
  eventId: string,
  percentage: number,
): Promise<string | null> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("events")
    .update({
      platform_fee_percentage: clampServiceFeePercentage(percentage),
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
  return error?.message ?? null
}

function mapEventFormToRpcPayload(
  data: EventFormValues,
  feeConfig: EventFeeConfig,
  flyerUrl: string | null = null,
  existing?: {
    date?: string | null
    ends_at?: string | null
    schedule_days?: unknown
  },
): CreateCompleteEventRpcPayload {
  const logicalZones = normalizeLogicalSectors(data.venue.zones)
  const assignableSectorIds = new Set(
    listAssignableGeneralSectors(data.venue.zones, data.venue.venueMap).map(
      (sector) => sector.id,
    ),
  )
  const liveSectorIds = collectLiveSeatingSectorIds({
    venueMap: data.venue.venueMap,
    seatingLayout: data.venue.seatingLayout,
    extraIds: assignableSectorIds,
  })
  const includesMap = Boolean(data.venue.includesSeatingMap)
  const capacitySnap = computeEventCapacityFromForm(data)

  const keepReservedBlueprint =
    !includesMap &&
    data.venue.zoneType === "reserved_seating" &&
    (data.venue.rows ?? 0) > 0 &&
    (data.venue.seatsPerRow ?? 0) > 0
  const zones =
    logicalZones.length > 0
      ? logicalZones.map((zone) => ({
          name: zone.name,
          type: zone.type,
          capacity: positiveInventoryCapacity(zone.capacity),
          rows: zone.type === "reserved_seating" ? zone.rows ?? null : null,
          seats_per_row:
            zone.type === "reserved_seating" ? zone.seatsPerRow ?? null : null,
        }))
      : keepReservedBlueprint
        ? [
            {
              name: "Platea",
              type: "reserved_seating" as const,
              capacity: Math.max(capacitySnap.totalCapacity, 1),
              rows: data.venue.rows ?? null,
              seats_per_row: data.venue.seatsPerRow ?? null,
            },
          ]
        : []

  const venueCapacity = Math.max(capacitySnap.totalCapacity, 1)

  const place = composeVenuePlace({
    street: data.venue.venueLocation,
    department: data.venue.department,
    province: data.venue.province,
    city: data.venue.venueCity,
  })
  const location = isOnlineDelivery(data.basics.deliveryMode)
    ? ""
    : place.display || data.venue.venueName

  const incomingDays = data.basics.isMultiDay
    ? normalizeScheduleDaysFromForm(data.basics.scheduleDays ?? [])
    : []
  const existingDays = parseScheduleDays(existing?.schedule_days)
  const preserveExistingSchedule =
    Boolean(data.basics.isMultiDay) && incomingDays.length === 0 && existingDays.length > 0
  const scheduleDays = data.basics.isMultiDay
    ? preserveExistingSchedule
      ? existingDays
      : incomingDays
    : []

  const nowIso = new Date().toISOString()
  const anchorDate = data.basics.isMultiDay
    ? scheduleDays[0]?.start_time ??
      existing?.date ??
      formDateToIso(data.basics.date, nowIso)
    : formDateToIso(data.basics.date, existing?.date ?? nowIso)

  const endsAt = data.basics.isMultiDay
    ? scheduleDays[scheduleDays.length - 1]?.end_time ?? existing?.ends_at ?? null
    : data.basics.endDate?.trim()
      ? formDateToIso(data.basics.endDate, existing?.ends_at ?? nowIso)
      : existing?.ends_at ?? null

  return {
    title: data.basics.title,
    description: data.basics.description,
    date: anchorDate,
    ends_at: endsAt,
    location,
    image_url: flyerUrl,
    flyer_url: flyerUrl,
    visibility: data.basics.visibility,
    category_id: identityCategoryId(data.basics.categoryId) ?? "",
    age_restriction: identityAgeRestriction(data.basics.ageRestriction) ?? "atp",
    schedule_days: scheduleDays,
    venue_id: data.venue.existingVenueId?.trim() || null,
    venue: {
      name: data.venue.venueName,
      location: place.street || location,
      city: place.city,
      capacity: venueCapacity,
    },
    zones,
    tiers: data.tickets.map((tier) => {
      // Form `price` is the public All-In price. Split uses event fee config.
      const dayId = persistTicketDayId(
        {
          dayId: asUuidOrNull(tier.dayId, ["all"]),
          name: tier.name,
          visibility: tier.visibility,
          tierType: tier.tierType,
          layoutType: tier.layoutType,
          bundleType: tier.bundleType,
          bundleItems: tier.bundleItems,
        },
        {
          isMultiDay: Boolean(data.basics.isMultiDay),
          validDayIds: scheduleDays.map((day) => day.id),
        },
      )
      const tierType = inferInventoryTierType({
        tierType: tier.tierType,
        layoutType: tier.layoutType,
        bundleItems: tier.bundleItems,
      })
      const bundleRule =
        tierType === "bundle"
          ? normalizePromoRule({
              tipoDescuento: tier.promoDiscountType,
              valorDescuento: tier.promoDiscountValue,
              cantidadRequerida: tier.promoRequiredQty,
              cantidadPaga: tier.promoPayQty,
            })
          : null
      const unitPriceByTierId: Record<string, number> = {}
      data.tickets.forEach((ticket, ticketIndex) => {
        const unit = Number(ticket.price) || 0
        unitPriceByTierId[`index:${ticketIndex}`] = unit
        if (ticket.id) unitPriceByTierId[ticket.id] = unit
        const named = ticket.name.trim()
        if (named) unitPriceByTierId[named] = unit
      })
      const computedSale =
        bundleRule != null
          ? promotionalBundlePrice({
              items: tier.bundleItems ?? [],
              unitPriceByTierId,
              rule: bundleRule,
            })
          : tier.price
      const rate = eventFeeRate(feeConfig)
      const fixed = eventFixedFee(feeConfig)
      const breakdown =
        bundleRule != null
          ? allInBreakdown(computedSale, rate, fixed)
          : (() => {
              const extras = {
                fixedFee: fixed,
                sponsored: feeConfig.isSponsoredByTokePass,
              }
              const formPublic = persistablePublicPrice(computedSale)
              const net = resolveTicketNetProfit(
                {
                  price: formPublic,
                  basePrice: tier.basePrice,
                },
                feeConfig.platformFeePercentage,
                extras,
              )
              const calc = priceFromNetProfit({
                netPrice: net,
                feePercentage: feeConfig.platformFeePercentage,
                fixedFee: fixed,
                sponsored: feeConfig.isSponsoredByTokePass,
              })
              const publicPrice =
                formPublic > 0 || net <= 0 ? formPublic : calc.publicPrice
              return {
                basePrice: net,
                platformFee: Math.max(0, publicPrice - net),
                publicPrice,
              }
            })()
      const layoutType = layoutTypeForInventory(tierType, tier.layoutType)
      const requestedSectorId = eventHasActiveSeatingMap({
        hasSeatingPlan: data.basics.hasSeatingPlan,
        includesSeatingMap: data.venue.includesSeatingMap,
        venueMap: data.venue.venueMap,
      })
        ? tier.seatingSectorId?.trim() || null
        : null
      const seatingSectorId = resolvePersistableTicketSectorId({
        sectorId: requestedSectorId,
        layoutType,
        tierType: tier.tierType,
        liveSectorIds,
        assignableSectorIds,
        venueMap: data.venue.venueMap,
      })
      const persistedLayoutType = seatingSectorId
        ? layoutType
        : ("general" as const)
      const capacity = positiveInventoryCapacity(tier.capacity)
      const publicPrice = persistablePublicPrice(breakdown.publicPrice)
      const isActive = (tier.visibility ?? "public") !== "private"
      return {
        ...(tier.id ? { id: tier.id } : {}),
        name: tier.name,
        price: publicPrice,
        base_price: breakdown.basePrice,
        platform_fee: breakdown.platformFee,
        capacity,
        time_limit: tier.timeLimit?.trim() ? tier.timeLimit : null,
        sale_starts_at: saleWindowToIso(tier.saleStartsAt),
        sale_ends_at: saleWindowToIso(tier.saleEndsAt),
        bonus_reward: tier.bonusReward?.trim() ? tier.bonusReward : null,
        zone_index: zoneIndexForSectorId(logicalZones, seatingSectorId),
        day_id: dayId,
        event_day_id: dayId,
        visibility: tier.visibility ?? "public",
        is_free: publicPrice === 0,
        is_active: isActive,
        layout_type: persistedLayoutType,
        seating_sector_id: seatingSectorId,
        sector_id: seatingSectorId,
        capacity_per_unit:
          persistedLayoutType === "general" ? 1 : tier.capacityPerUnit,
        min_purchase_limit: Math.max(
          1,
          Math.floor(Number(tier.minPurchaseLimit) || 1),
        ),
        max_purchase_limit:
          tier.maxPurchaseLimit == null || Number(tier.maxPurchaseLimit) <= 0
            ? null
            : Math.floor(Number(tier.maxPurchaseLimit)),
        admit_count:
          persistedLayoutType === "general"
            ? Math.max(1, Math.min(50, tier.admitCount ?? 1))
            : 1,
        total_capacity: capacity,
        tier_type: tierType,
        bundle_type:
          tierType === "bundle"
            ? inferBundleType({
                bundleType: tier.bundleType,
                dayId: dayId,
                items: tier.bundleItems ?? [],
              })
            : null,
        bundle_items: serializeBundleItems(
          (tier.bundleItems ?? []).map((item) => ({
            tierId: item.tierId,
            quantity: item.quantity,
          })),
        ),
        list_price: tier.listPrice ?? null,
      }
    }),
    rrpp_commission: null,
    addons_enabled: false,
  }
}

async function findOwnedVenueId(
  client: SupabaseClient<Database>,
  organizerId: string,
  venueId: string | null | undefined,
): Promise<string | null> {
  const id = venueId?.trim() || ""
  if (!id) return null
  const { data } = await client
    .from("venues")
    .select("id")
    .eq("id", id)
    .eq("organizer_id", organizerId)
    .limit(1)
  return data?.[0]?.id ?? null
}

async function findVenueIdByExactName(
  client: SupabaseClient<Database>,
  organizerId: string,
  name: string,
): Promise<string | null> {
  const normalized = normalizeExactVenueName(name)
  if (!canPersistCatalogVenueName(normalized)) return null
  const { data } = await client
    .from("venues")
    .select("id")
    .eq("organizer_id", organizerId)
    .eq("name", normalized)
    .order("created_at", { ascending: true })
    .limit(1)
  return data?.[0]?.id ?? null
}

async function persistEventVenueFields(
  client: SupabaseClient<Database>,
  eventId: string,
  data: EventFormValues,
  options?: { allowCreate?: boolean },
): Promise<{ venueId: string | null; error?: string }> {
  if (isOnlineDelivery(data.basics.deliveryMode)) {
    const deliveryError = await persistEventDeliveryProfile(client, eventId, data)
    if (deliveryError) return { venueId: null, error: deliveryError }
    const { error } = await client
      .from("events")
      .update({
        venue_id: null,
        location: null,
        has_seating_plan: false,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", eventId)
    if (error && !OPTIONAL_EVENT_FLAG_COLUMNS_RE.test(error.message)) {
      return { venueId: null, error: error.message }
    }
    return { venueId: null }
  }

  const { data: eventRow } = await client
    .from("events")
    .select("id, venue_id, organizer_id")
    .eq("id", eventId)
    .maybeSingle()

  const place = composeVenuePlace({
    street: data.venue.venueLocation,
    department: data.venue.department,
    province: data.venue.province,
    city: data.venue.venueCity,
  })
  const province = data.venue.province?.trim() || null
  const department = data.venue.department?.trim() || null
  const venueName = normalizeExactVenueName(data.venue.venueName)
  const location = place.display || venueName
  const seatingArtifacts = resolveVenueSeatingArtifactsForPersist({
    hasSeatingPlan: data.basics.hasSeatingPlan,
    includesSeatingMap: data.venue.includesSeatingMap,
    venueMap: data.venue.venueMap,
    seatingLayout: data.venue.seatingLayout,
  })
  const venueMap = serializeVenueMap(seatingArtifacts.venueMap) as unknown as Json
  const seatingLayout = seatingArtifacts.seatingLayout as unknown as Json
  const now = new Date().toISOString()
  const organizerId = eventRow?.organizer_id ?? ""
  const creatingNewCatalogVenue =
    data.venue.mode === "new" && !data.venue.existingVenueId?.trim()
  const allowCreate = options?.allowCreate !== false

  let venueId: string | null = null
  if (organizerId) {
    venueId = creatingNewCatalogVenue
      ? await findOwnedVenueId(client, organizerId, eventRow?.venue_id)
      : (await findOwnedVenueId(
          client,
          organizerId,
          data.venue.existingVenueId,
        )) ||
        (await findOwnedVenueId(client, organizerId, eventRow?.venue_id)) ||
        (await findVenueIdByExactName(client, organizerId, venueName))
  }

  const venuePatch = {
    name: venueName || undefined,
    location: place.street || location,
    address: place.street || location,
    city: place.city,
    latitude: data.venue.latitude ?? null,
    longitude: data.venue.longitude ?? null,
    venue_map: venueMap,
    seating_layout: seatingLayout,
    seating_background_url: data.venue.seatingBackgroundUrl ?? null,
    updated_at: now,
  }

  const capacitySnap = computeEventCapacityFromForm(data)
  const officialCapacity = Math.max(1, capacitySnap.baseVenueCapacity || 1)
  const effectiveCapacity = Math.max(1, capacitySnap.effectiveMaxCapacity || officialCapacity)

  if (venueId) {
    const withMax = {
      ...venuePatch,
      capacity: officialCapacity,
      max_capacity: effectiveCapacity,
    }
    const updated = await client
      .from("venues")
      .update(withMax as never)
      .eq("id", venueId)
    if (
      updated.error &&
      /max_capacity|schema cache|PGRST204|42703/i.test(updated.error.message)
    ) {
      const retry = await client
        .from("venues")
        .update({ ...venuePatch, capacity: officialCapacity } as never)
        .eq("id", venueId)
      if (retry.error) {
        return { venueId, error: retry.error.message }
      }
    } else if (updated.error) {
      return { venueId, error: updated.error.message }
    }
  } else if (
    allowCreate &&
    canPersistCatalogVenueName(venueName) &&
    organizerId
  ) {
    const insertPayload = {
      organizer_id: organizerId,
      name: venueName,
      location: place.street || location,
      address: place.street || location,
      city: place.city,
      latitude: data.venue.latitude ?? null,
      longitude: data.venue.longitude ?? null,
      capacity: officialCapacity,
      max_capacity: effectiveCapacity,
      venue_map: venueMap,
      seating_layout: seatingLayout,
      seating_background_url: data.venue.seatingBackgroundUrl ?? null,
    }
    let created = await client
      .from("venues")
      .insert(insertPayload as never)
      .select("id")
      .maybeSingle()
    if (
      created.error &&
      /max_capacity|schema cache|PGRST204|42703/i.test(created.error.message)
    ) {
      const withoutMax = { ...insertPayload }
      delete (withoutMax as { max_capacity?: number }).max_capacity
      created = await client
        .from("venues")
        .insert(withoutMax as never)
        .select("id")
        .maybeSingle()
    }
    if (
      created.error &&
      /venues_organizer_exact_name|duplicate key|unique constraint/i.test(
        created.error.message,
      )
    ) {
      venueId = await findVenueIdByExactName(client, organizerId, venueName)
    } else if (created.error) {
      return { venueId: null, error: created.error.message }
    } else {
      venueId = created.data?.id ?? null
    }
  }

  const eventCore = {
    venue_id: venueId ?? eventRow?.venue_id ?? null,
    location,
    venue_map: venueMap,
    has_seating_plan: seatingArtifacts.mapActive,
    updated_at: now,
  }
  const defaultTicketTab = parseDefaultTicketTab(data.ticketsDefaultTab)
  const withPicker = await client
    .from("events")
    .update({
      ...eventCore,
      province,
      department,
      default_ticket_tab: defaultTicketTab,
    } as never)
    .eq("id", eventId)

  if (
    withPicker.error &&
    /default_ticket_tab|schema cache|PGRST204|42703/i.test(
      withPicker.error.message,
    )
  ) {
    const withPlace = await client
      .from("events")
      .update({
        ...eventCore,
        province,
        department,
      } as never)
      .eq("id", eventId)
    if (
      withPlace.error &&
      /province|department|schema cache|PGRST204|42703/i.test(
        withPlace.error.message,
      )
    ) {
      const coreWrite = await client
        .from("events")
        .update(stripOptionalEventFlags(eventCore) as never)
        .eq("id", eventId)
      if (coreWrite.error) {
        return { venueId, error: coreWrite.error.message }
      }
    } else if (withPlace.error) {
      return { venueId, error: withPlace.error.message }
    }
  } else if (
    withPicker.error &&
    /province|department|has_seating_plan|schema cache|PGRST204|42703/i.test(
      withPicker.error.message,
    )
  ) {
    const coreWrite = await client
      .from("events")
      .update(stripOptionalEventFlags(eventCore) as never)
      .eq("id", eventId)
    if (coreWrite.error) {
      return { venueId, error: coreWrite.error.message }
    }
  } else if (withPicker.error) {
    return { venueId, error: withPicker.error.message }
  }

  return { venueId }
}

/** Paso 1 / autosave de identidad: lugar y dirección, sin tocar mapa ni aforo. */
async function persistEventIdentityVenueLabel(
  client: SupabaseClient<Database>,
  eventId: string,
  data: EventFormValues,
  currentVenueId: string | null,
): Promise<string | null> {
  if (isOnlineDelivery(data.basics.deliveryMode)) {
    return persistEventDeliveryProfile(client, eventId, data)
  }
  const place = composeVenuePlace({
    street: data.venue.venueLocation,
    department: data.venue.department,
    province: data.venue.province,
    city: data.venue.venueCity,
  })
  const venueName = normalizeExactVenueName(data.venue.venueName)
  const location = place.display || venueName
  const venueId =
    data.venue.existingVenueId?.trim() || currentVenueId || null
  if (!location && !venueId) return null

  const patch = {
    ...(location ? { location } : {}),
    ...(venueId ? { venue_id: venueId } : {}),
    province: data.venue.province?.trim() || null,
    department: data.venue.department?.trim() || null,
    updated_at: new Date().toISOString(),
  }
  const written = await client.from("events").update(patch as never).eq("id", eventId)
  if (
    written.error &&
    /province|department|schema cache|PGRST204|42703/i.test(written.error.message)
  ) {
    const retry = await client
      .from("events")
      .update({
        ...(location ? { location } : {}),
        ...(venueId ? { venue_id: venueId } : {}),
        updated_at: patch.updated_at,
      } as never)
      .eq("id", eventId)
    if (retry.error) return retry.error.message
    return null
  }
  if (written.error) return written.error.message
  return null
}

async function persistEventSchedule(
  client: SupabaseClient<Database>,
  eventId: string,
  data: EventFormValues,
  existing?: { date?: string | null; ends_at?: string | null; schedule_days?: unknown },
): Promise<string | null> {
  const incomingDays = data.basics.isMultiDay
    ? normalizeScheduleDaysFromForm(data.basics.scheduleDays ?? [])
    : []

  if (data.basics.isMultiDay && incomingDays.length === 0) {
    return null
  }

  const scheduleDays = data.basics.isMultiDay ? incomingDays : []
  const nowIso = new Date().toISOString()
  const date = data.basics.isMultiDay
    ? scheduleDays[0]?.start_time ?? existing?.date ?? nowIso
    : formDateToIso(data.basics.date, existing?.date ?? nowIso)
  const endsAt = data.basics.isMultiDay
    ? scheduleDays[scheduleDays.length - 1]?.end_time ?? null
    : data.basics.endDate?.trim()
      ? parseDateTimeLocal(data.basics.endDate)?.toISOString() ?? null
      : null

  const { error } = await client
    .from("events")
    .update({
      schedule_days: scheduleDays,
      date,
      ends_at: endsAt,
    } as never)
    .eq("id", eventId)
  if (error) {
    logPersistError("event-persist", error)
    return error.message
  }
  return null
}

async function loadPersistedSeatingSectorIds(
  client: SupabaseClient<Database>,
  eventId: string,
): Promise<string[]> {
  const ids = new Set<string>()
  const { data: eventRow } = await client
    .from("events")
    .select("venue_id, venue_map")
    .eq("id", eventId)
    .maybeSingle()

  const fromForm = collectLiveSeatingSectorIds({
    venueMap: eventRow?.venue_map,
  })
  for (const id of fromForm) ids.add(id)

  const { data: eventZones } = await client
    .from("event_zones")
    .select("id, name")
    .eq("event_id", eventId)
  for (const row of eventZones ?? []) {
    const zoneId = String(row.id ?? "").trim()
    const name = String(row.name ?? "").trim()
    if (zoneId) ids.add(zoneId)
    if (name) ids.add(logicalSectorId(name, zoneId || null))
  }

  const { data: units } = await client
    .from("event_seating_units")
    .select("sector_id")
    .eq("event_id", eventId)
  for (const row of units ?? []) {
    const sectorId = row.sector_id?.trim()
    if (sectorId) ids.add(sectorId)
  }

  return [...ids]
}

function applyFormSeatingSectorSanitizer(
  data: EventFormValues,
  extraIds: Iterable<string> = [],
): EventFormValues {
  if (
    !eventHasActiveSeatingMap({
      hasSeatingPlan: data.basics.hasSeatingPlan,
      includesSeatingMap: data.venue.includesSeatingMap,
      venueMap: data.venue.venueMap,
    })
  ) {
    return {
      ...data,
      tickets: detachTicketsFromSeatingPlan(data.tickets),
    }
  }
  const live = collectLiveSeatingSectorIds({
    venueMap: data.venue.venueMap,
    seatingLayout: data.venue.seatingLayout,
    extraIds,
  })
  return sanitizeDeepSeatingRefs(
    {
      ...data,
      tickets: sanitizeSeatingSectorIds(data.tickets, live),
    },
    live,
  )
}

function explicitPurchaseLimit(
  raw: number | null | undefined,
): number | undefined {
  if (raw == null) return undefined
  const parsed = Math.floor(Number(raw))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function explicitLineup(
  lineup: EventFormValues["lineup"] | null | undefined,
): EventFormValues["lineup"] | null {
  if (!Array.isArray(lineup) || lineup.length === 0) return null
  return lineup
}

async function persistEventMaxTicketsPerUser(
  client: SupabaseClient<Database>,
  eventId: string,
  raw: number | null | undefined,
): Promise<string | null> {
  if (raw === undefined) return null
  const nextLimit = resolvePurchaseLimit(raw)
  if (nextLimit != null && nextLimit > 200) {
    return "El tope de compra por usuario no puede superar 200."
  }
  const { error } = await client
    .from("events")
    .update({
      max_tickets_per_user: nextLimit,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
  return error?.message ?? null
}

async function persistEventLineupIfProvided(
  eventId: string,
  lineup: EventFormValues["lineup"] | null | undefined,
): Promise<string | null> {
  const next = explicitLineup(lineup)
  if (!next) return null
  const result = await persistEventLineupSnapshot(eventId, next)
  return result.success ? null : result.error
}

async function revalidatePersistedEvent(
  client: SupabaseClient<Database>,
  eventId: string,
  previousSlug?: string | null,
) {
  const { data } = await client
    .from("events")
    .select("slug")
    .eq("id", eventId)
    .maybeSingle()
  revalidatePublicEventCache({
    eventId,
    slug: data?.slug,
    previousSlug,
  })
}

function persistFailure(error: unknown): {
  success: false
  error: string
  code: AppErrorCode
  source: PersistErrorSource
  title?: string
  field?: string
  actionHint?: string
  wizardConflict?: WizardConflict
} {
  const source = logPersistError("event-persist", error)
  logger.error({
    context: "event-persist",
    message: persistErrorLogLabel(source),
    error,
  })
  const mapped = mapUnknownError(error)
  const code = mapped.code === "UNKNOWN" ? "SAVE_FAILED" : mapped.code
  const field = fieldFromAppError(mapped)
  const message =
    mapped.code !== "SAVE_FAILED" &&
    mapped.code !== "UNKNOWN" &&
    mapped.code !== "INVENTORY_SYNC"
      ? mapped.message
      : persistErrorUserMessage(error, mapped.message)
  return {
    success: false,
    error: message,
    code,
    source,
    title: mapped.title,
    ...(field ? { field } : {}),
    actionHint: actionHintFromError(mapped),
    ...(mapped.action
      ? {
          wizardConflict: {
            summary: message,
            actions: [mapped.action],
          },
        }
      : {}),
  }
}

function venueMapSkuGuard(
  _data: EventFormValues,
): { success: false; error: string; wizardConflict: WizardConflict } | null {
  return null
}

function withHealedMapTickets(
  data: EventFormValues,
  persistedIds?: Iterable<string>,
): EventFormValues {
  return prepareEventForPersist(data, { mode: "update", persistedIds })
}

const EVENT_IDENTITY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function identityCategoryId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ""
  return EVENT_IDENTITY_UUID_RE.test(trimmed) ? trimmed : null
}

function identityAgeRestriction(
  value: string | null | undefined,
): AgeRestriction | null {
  return AGE_RESTRICTION_VALUES.includes(value as AgeRestriction)
    ? (value as AgeRestriction)
    : null
}

const OPTIONAL_EVENT_FLAG_COLUMNS_RE =
  /has_seating_plan|has_schedule|delivery_mode|access_link|accepts_mercado_pago|accepts_pos_payments|refund_policy|schema cache|PGRST204|42703/i

async function persistEventDeliveryProfile(
  client: SupabaseClient<Database>,
  eventId: string,
  formValues: EventFormValues | DraftEventFormValues,
): Promise<string | null> {
  const deliveryMode = parseDeliveryMode(formValues.basics.deliveryMode)
  const online = deliveryMode === "ONLINE"
  const patch: Record<string, unknown> = {
    delivery_mode: deliveryMode,
    access_link: online
      ? normalizeAccessLink(formValues.basics.accessLink)
      : null,
    updated_at: new Date().toISOString(),
  }
  if (online) {
    patch.location = null
    patch.has_seating_plan = false
  }
  const { error } = await client
    .from("events")
    .update(patch as never)
    .eq("id", eventId)
  if (error && OPTIONAL_EVENT_FLAG_COLUMNS_RE.test(error.message)) {
    const retry = await client
      .from("events")
      .update({
        location: online ? null : undefined,
        updated_at: patch.updated_at,
      } as never)
      .eq("id", eventId)
    if (retry.error) {
      logPersistError("event-persist", retry.error)
      return retry.error.message
    }
    return null
  }
  if (error) {
    logPersistError("event-persist", error)
    return error.message
  }
  return null
}

function stripOptionalEventFlags<T extends Record<string, unknown>>(payload: T): T {
  const next = { ...payload }
  delete (next as { has_seating_plan?: boolean }).has_seating_plan
  delete (next as { has_schedule?: boolean }).has_schedule
  delete (next as { delivery_mode?: unknown }).delivery_mode
  delete (next as { access_link?: unknown }).access_link
  delete (next as { accepts_mercado_pago?: boolean }).accepts_mercado_pago
  delete (next as { accepts_pos_payments?: boolean }).accepts_pos_payments
  delete (next as { refund_policy?: string }).refund_policy
  return next
}

function checkoutPolicyFromForm(
  data: EventFormValues | DraftEventFormValues,
): {
  accepts_mercado_pago: boolean
  accepts_pos_payments: boolean
  refund_policy: ReturnType<typeof parseEventRefundPolicy>
} {
  return {
    accepts_mercado_pago: data.acceptsMercadoPago !== false,
    accepts_pos_payments: data.acceptsPosPayments !== false,
    refund_policy: parseEventRefundPolicy(data.refundPolicy),
  }
}

async function persistEventCheckoutPolicy(
  client: SupabaseClient<Database>,
  eventId: string,
  formValues: EventFormValues | DraftEventFormValues,
): Promise<string | null> {
  const { error } = await client
    .from("events")
    .update({
      ...checkoutPolicyFromForm(formValues),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", eventId)
  if (error && OPTIONAL_EVENT_FLAG_COLUMNS_RE.test(error.message)) {
    return null
  }
  if (error) {
    logPersistError("event-persist", error)
    return error.message
  }
  return null
}

async function persistEventIdentityOnly(input: {
  formData: FormData
  formValues: EventFormValues | DraftEventFormValues
  eventId: string
  organizerId: string
  existingFlyerUrl: string | null
  existing: { date?: string | null; ends_at?: string | null; schedule_days?: unknown }
  mutationClient: SupabaseClient<Database>
  venueId: string | null
}): Promise<CreateCompleteEventResult> {
  const flyerEntry = input.formData.get("flyer")
  let flyerUrl = input.existingFlyerUrl

  if (flyerEntry instanceof File && flyerEntry.size > 0) {
    const uploaded = await uploadEventFlyer(
      input.mutationClient,
      input.organizerId,
      flyerEntry,
    )
    if ("error" in uploaded) return { success: false, error: uploaded.error }
    flyerUrl = uploaded.url
  }

  const title = input.formValues.basics.title.trim()
  if (title.length < 3) {
    return {
      success: false,
      error: "Ponéle un nombre a tu evento para poder avanzar",
    }
  }

  const categoryId = identityCategoryId(input.formValues.basics.categoryId)
  const ageRestriction = identityAgeRestriction(
    input.formValues.basics.ageRestriction,
  )

  const identityPatch = {
    title,
    description: input.formValues.basics.description,
    visibility: input.formValues.basics.visibility,
    category_id: categoryId,
    ...(ageRestriction ? { age_restriction: ageRestriction } : {}),
    image_url: flyerUrl,
    flyer_url: flyerUrl,
    has_seating_plan: Boolean(input.formValues.basics.hasSeatingPlan),
    has_schedule: Boolean(input.formValues.basics.hasSchedule),
    delivery_mode: parseDeliveryMode(input.formValues.basics.deliveryMode),
    access_link: isOnlineDelivery(input.formValues.basics.deliveryMode)
      ? normalizeAccessLink(input.formValues.basics.accessLink)
      : null,
    ...(isOnlineDelivery(input.formValues.basics.deliveryMode)
      ? { location: null, has_seating_plan: false }
      : {}),
    updated_at: new Date().toISOString(),
  }
  const { error: updateError } = await input.mutationClient
    .from("events")
    .update(identityPatch as never)
    .eq("id", input.eventId)

  if (updateError && OPTIONAL_EVENT_FLAG_COLUMNS_RE.test(updateError.message)) {
    const retry = await input.mutationClient
      .from("events")
      .update(stripOptionalEventFlags(identityPatch) as never)
      .eq("id", input.eventId)
    if (retry.error) {
      return persistFailure(retry.error.message)
    }
  } else if (updateError) {
    return persistFailure(updateError.message)
  }

  const scheduleError = await persistEventSchedule(
    input.mutationClient,
    input.eventId,
    input.formValues as EventFormValues,
    input.existing,
  )
  if (scheduleError) return persistFailure(scheduleError)
  const lineupError = await persistEventLineupIfProvided(
    input.eventId,
    input.formValues.lineup,
  )
  if (lineupError) return persistFailure(lineupError)

  const formValues = input.formValues as EventFormValues
  const venueLabelError = await persistEventIdentityVenueLabel(
    input.mutationClient,
    input.eventId,
    formValues,
    input.venueId,
  )
  if (venueLabelError) return persistFailure(venueLabelError)
  const checkoutError = await persistEventCheckoutPolicy(
    input.mutationClient,
    input.eventId,
    formValues,
  )
  if (checkoutError) return persistFailure(checkoutError)
  const venueId =
    formValues.venue.existingVenueId?.trim() || input.venueId

  await revalidatePersistedEvent(input.mutationClient, input.eventId)

  return {
    success: true,
    eventId: input.eventId,
    venueId,
  }
}

/**
 * Alta solo de identidad: titulo, copy, visibilidad, categoria, edad
 * (si el usuario la eligio) y flyer. No inventa fechas, no fuerza ATP
 * y no crea tickets ni mapa.
 */
async function persistNewEventIdentityOnly(
  formData: FormData,
  raw: DraftEventFormValues | EventFormValues,
): Promise<CreateCompleteEventResult> {
  const title = raw.basics.title.trim()
  if (title.length < 3) {
    return {
      success: false,
      error: "Ponéle un nombre a tu evento para poder avanzar",
    }
  }

  let supabase: Awaited<ReturnType<typeof createClient>>
  let userId: string
  try {
    const session = await requireAuthenticatedUser()
    supabase = session.supabase
    userId = session.user.id
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Debes iniciar sesión para crear un evento.",
    }
  }

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", userId)
    .maybeSingle()

  const actorRole = actorProfile?.role ?? null
  const actorCanCreate =
    actorRole === "super_admin" ||
    (actorRole === "admin" &&
      actorProfile?.organizer_approval_status === "approved")
  if (!actorCanCreate) {
    return {
      success: false,
      error: "Tu cuenta de organizador no está habilitada para crear eventos.",
    }
  }

  let organizerId = userId
  const targetRaw = formData.get("targetOrganizerId")
  const targetOrganizerId =
    typeof targetRaw === "string" && targetRaw.trim() ? targetRaw.trim() : null

  if (targetOrganizerId && actorRole === "super_admin") {
    const admin = createAdminClient()
    const { data: targetProfile, error: targetError } = await admin
      .from("profiles")
      .select("id, role, organizer_approval_status")
      .eq("id", targetOrganizerId)
      .maybeSingle()

    if (
      targetError ||
      !targetProfile ||
      targetProfile.role !== "admin" ||
      targetProfile.organizer_approval_status !== "approved"
    ) {
      return {
        success: false,
        error: "La productora destino no existe o no es un organizador válido.",
      }
    }

    organizerId = targetProfile.id
  }

  const mutationClient =
    organizerId !== userId ? createAdminClient() : supabase

  const flyerEntry = formData.get("flyer")
  let flyerUrl: string | null = null
  if (flyerEntry instanceof File && flyerEntry.size > 0) {
    const uploaded = await uploadEventFlyer(mutationClient, organizerId, flyerEntry)
    if ("error" in uploaded) {
      return { success: false, error: uploaded.error }
    }
    flyerUrl = uploaded.url
  }

  const userStart = parseDateTimeLocal(raw.basics.date ?? "")
  const userEnd = parseDateTimeLocal(raw.basics.endDate ?? "")
  const incomingDays = raw.basics.isMultiDay
    ? normalizeScheduleDaysFromForm(raw.basics.scheduleDays ?? [])
    : []
  const hasUserSchedule = userStart != null || incomingDays.length > 0
  const categoryId = identityCategoryId(raw.basics.categoryId)
  const ageRestriction = identityAgeRestriction(raw.basics.ageRestriction)

  const insertPayload = {
    organizer_id: organizerId,
    title,
    description: raw.basics.description ?? "",
    visibility: raw.basics.visibility ?? "public",
    status: "draft" as const,
    location: isOnlineDelivery(raw.basics.deliveryMode) ? null : "",
    delivery_mode: parseDeliveryMode(raw.basics.deliveryMode),
    access_link: isOnlineDelivery(raw.basics.deliveryMode)
      ? normalizeAccessLink(raw.basics.accessLink)
      : null,
    // `events.date` es NOT NULL. Solo se escribe una fecha real si el
    // usuario la cargo; si no, se usa now() como ancla de columna y no
    // se persiste schedule ni ends_at inventados.
    date: hasUserSchedule
      ? (incomingDays[0]?.start_time ??
        userStart?.toISOString() ??
        new Date().toISOString())
      : new Date().toISOString(),
    ...(userEnd ? { ends_at: userEnd.toISOString() } : {}),
    ...(categoryId ? { category_id: categoryId } : {}),
    ...(ageRestriction ? { age_restriction: ageRestriction } : {}),
    ...(flyerUrl ? { image_url: flyerUrl, flyer_url: flyerUrl } : {}),
    has_seating_plan: Boolean(raw.basics.hasSeatingPlan),
    has_schedule: Boolean(raw.basics.hasSchedule),
    ...checkoutPolicyFromForm(raw),
  }

  let created = await mutationClient
    .from("events")
    .insert(insertPayload as never)
    .select("id")
    .maybeSingle()
  let insertError = created.error

  if (insertError && OPTIONAL_EVENT_FLAG_COLUMNS_RE.test(insertError.message)) {
    created = await mutationClient
      .from("events")
      .insert(stripOptionalEventFlags(insertPayload) as never)
      .select("id")
      .maybeSingle()
    insertError = created.error
  }

  if (insertError || !created.data?.id) {
    if (flyerUrl) {
      const path = flyerUrl.split("/event-flyers/")[1]
      if (path) {
        await mutationClient.storage.from("event-flyers").remove([path])
      }
    }
    return persistFailure(
      insertError?.message ?? "La base de datos no devolvió el ID del evento.",
    )
  }

  const eventId = String(created.data.id)

  if (hasUserSchedule) {
    const scheduleError = await persistEventSchedule(
      mutationClient,
      eventId,
      raw as EventFormValues,
    )
    if (scheduleError) return persistFailure(scheduleError)
  }

  const createdLineupError = await persistEventLineupIfProvided(
    eventId,
    raw.lineup,
  )
  if (createdLineupError) return persistFailure(createdLineupError)
  const createdCheckoutError = await persistEventCheckoutPolicy(
    mutationClient,
    eventId,
    raw,
  )
  if (createdCheckoutError) return persistFailure(createdCheckoutError)

  await revalidatePersistedEvent(mutationClient, eventId)

  return { success: true, eventId, venueId: null }
}

async function runSeatingRpcWithRetry<T>(input: {
  context: string
  eventId?: string
  payload: CreateCompleteEventRpcPayload
  execute: (
    payload: CreateCompleteEventRpcPayload,
  ) => Promise<{ data: T; error: { message: string } | null }>
}): Promise<{ data: T; error: { message: string } | null }> {
  try {
    const first = await input.execute(input.payload)
    if (first.error) {
      logPersistError(input.context, first.error)
      logger.error({
        context: input.context,
        event_id: input.eventId,
        error: first.error,
      })
    }
    return first
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logPersistError(input.context, error)
    logger.error({
      context: input.context,
      event_id: input.eventId,
      error,
    })
    return { data: null as T, error: { message } }
  }
}

export async function materializeEventSeatingUnits(
  client: SupabaseClient<Database>,
  eventId: string,
): Promise<string | null> {
  const { error } = await client.rpc("materialize_event_seating_units", {
    p_event_id: eventId,
  })
  if (!error) return null
  logger.error({
    context: "materialize_event_seating_units",
    event_id: eventId,
    error,
  })
  return error.message.replace(/^materialize_event_seating_units:\s*/i, "")
}

async function resyncEventSeatingUnitsAfterMapSave(
  client: SupabaseClient<Database>,
  eventId: string,
): Promise<string | null> {
  return materializeEventSeatingUnits(client, eventId)
}

async function detachInactiveMapTiersInDatabase(
  client: SupabaseClient<Database>,
  eventId: string,
  keepTierIds: Iterable<string> = [],
): Promise<string | null> {
  const keep = new Set(
    [...keepTierIds].filter((id) => typeof id === "string" && id.trim().length > 0),
  )
  const { data: tiers, error: loadError } = await client
    .from("ticket_tiers")
    .select("id, sold, seating_sector_id")
    .eq("event_id", eventId)
  if (loadError) return loadError.message

  for (const tier of tiers ?? []) {
    const sold = Math.max(0, Number(tier.sold) || 0)
    const hasSector = Boolean(tier.seating_sector_id?.trim())
    if (!hasSector && (sold > 0 || keep.has(tier.id))) continue

    if (sold > 0 && hasSector) {
      const { error } = await client
        .from("ticket_tiers")
        .update({
          seating_sector_id: null,
          layout_type: "general",
          capacity_per_unit: 1,
          zone_id: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", tier.id)
        .eq("event_id", eventId)
      if (error) return error.message
      continue
    }

    if (!keep.has(tier.id)) {
      const { error } = await client
        .from("ticket_tiers")
        .delete()
        .eq("id", tier.id)
        .eq("event_id", eventId)
      if (error) return error.message
      continue
    }

    if (hasSector) {
      const { error } = await client
        .from("ticket_tiers")
        .update({
          seating_sector_id: null,
          layout_type: "general",
          capacity_per_unit: 1,
          zone_id: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", tier.id)
        .eq("event_id", eventId)
      if (error) return error.message
    }
  }

  return null
}

function normalizeSectorLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^sector\s+/, "")
}

async function syncMapBackedTiersAfterMapSave(
  client: SupabaseClient<Database>,
  eventId: string,
  map: InteractiveVenueMap,
): Promise<string | null> {
  if (!venueMapHasInventory(map)) return null
  const { data: tiers, error } = await client
    .from("ticket_tiers")
    .select("id, name, seating_sector_id, layout_type, capacity, sold, capacity_per_unit")
    .eq("event_id", eventId)
  if (error) return error.message

  const groups = listVenuePriceGroups(map)
  const linked = (tiers ?? []).map((tier) => {
    const existing = (tier.seating_sector_id ?? "").trim()
    if (existing) {
      return { ...tier, seatingSectorId: existing }
    }
    const name = normalizeSectorLabel(tier.name)
    const group = groups.find(
      (item) => normalizeSectorLabel(item.name) === name,
    )
    return {
      ...tier,
      seatingSectorId: group ? priceGroupSectorId(group) : null,
    }
  })

  const healed = applyMapCapacityToTickets(linked, map)
  for (const tier of healed) {
    const sectorId = (tier.seatingSectorId ?? "").trim()
    if (!sectorId) continue
    const layoutType =
      layoutTypeForMapSectorId(map, sectorId) ?? tier.layout_type
    if (layoutType !== "numbered_seat" && layoutType !== "table_combo") {
      continue
    }
    const sold = Math.max(0, Number(tier.sold) || 0)
    const capacity = Math.max(1, Number(tier.capacity) || 1, sold)
    const { error: updateError } = await client
      .from("ticket_tiers")
      .update({
        seating_sector_id: sectorId,
        layout_type: layoutType,
        capacity,
        capacity_per_unit: Math.max(1, Number(tier.capacity_per_unit) || 1),
      } as never)
      .eq("id", tier.id)
      .eq("event_id", eventId)
    if (updateError) return updateError.message
  }
  return null
}

async function syncTicketCapacityFromSeatingUnits(
  client: SupabaseClient<Database>,
  eventId: string,
): Promise<string | null> {
  const [{ data: units, error: unitsError }, { data: tiers, error: tiersError }] =
    await Promise.all([
      client
        .from("event_seating_units")
        .select("sector_id, capacity_per_unit")
        .eq("event_id", eventId),
      client
        .from("ticket_tiers")
        .select("id, seating_sector_id, layout_type, capacity, sold")
        .eq("event_id", eventId),
    ])
  if (unitsError) return unitsError.message
  if (tiersError) return tiersError.message
  if (!units?.length) return null

  const placesBySector = new Map<string, number>()
  for (const unit of units) {
    const sectorId = unit.sector_id?.trim()
    if (!sectorId) continue
    placesBySector.set(
      sectorId,
      (placesBySector.get(sectorId) ?? 0) +
        Math.max(1, Number(unit.capacity_per_unit) || 1),
    )
  }

  for (const tier of tiers ?? []) {
    const sectorId = tier.seating_sector_id?.trim()
    if (!sectorId) continue
    if (tier.layout_type !== "numbered_seat" && tier.layout_type !== "table_combo") {
      continue
    }
    const generated = placesBySector.get(sectorId)
    if (generated == null || generated <= 0) continue
    const sold = Math.max(0, Number(tier.sold) || 0)
    const nextCapacity = Math.max(generated, sold)
    if (nextCapacity === Number(tier.capacity)) continue
    const { error } = await client
      .from("ticket_tiers")
      .update({ capacity: nextCapacity } as never)
      .eq("id", tier.id)
      .eq("event_id", eventId)
    if (error) return error.message
  }
  return null
}

async function assertPersistedInventoryCapacity(
  client: SupabaseClient<Database>,
  eventId: string,
): Promise<string | null> {
  const { data: tiers, error } = await client
    .from("ticket_tiers")
    .select("id, name, capacity")
    .eq("event_id", eventId)
  if (error) {
    logPersistError("event-persist", error)
    return error.message
  }
  const broken = (tiers ?? []).filter(
    (tier) => tier.capacity == null || Number(tier.capacity) < 1,
  )
  if (broken.length > 0) {
    return `El inventario quedó sin stock en: ${broken
      .map((tier) => tier.name)
      .join(", ")}. El guardado se abortó.`
  }
  return null
}

async function syncTierAdmitCounts(
  eventId: string,
  tickets: EventFormValues["tickets"],
): Promise<string | null> {
  const admin = createAdminClient()
  const { data: tiers, error: tiersLoadError } = await admin
    .from("ticket_tiers")
    .select("id, name")
    .eq("event_id", eventId)

  if (tiersLoadError) {
    logPersistError("event-persist", tiersLoadError)
    return tiersLoadError.message
  }

  if (!tiers?.length) return null

  for (const tier of tiers) {
    const match =
      tickets.find((t) => t.id && t.id === tier.id) ??
      tickets.find((t) => t.name.trim() === tier.name.trim())
    if (!match) continue
    const tierType = inferInventoryTierType({
      tierType: match.tierType,
      layoutType: match.layoutType,
      bundleItems: match.bundleItems,
    })
    const admit =
      match.layoutType === "general"
        ? Math.max(1, Math.min(50, match.admitCount ?? 1))
        : 1
    const resolvedBundle = (match.bundleItems ?? [])
      .map((item) => {
        const indexMatch = /^index:(\d+)$/.exec(item.tierId)
        const byIndex =
          indexMatch != null ? tickets[Number(indexMatch[1])] : undefined
        const target =
          tickets.find((candidate) => candidate.id === item.tierId) ??
          byIndex ??
          tickets.find((candidate) => candidate.name.trim() === item.tierId)
        const persistedId =
          target?.id ??
          (target
            ? tiers.find((row) => row.name.trim() === target.name.trim())?.id
            : undefined)
        return {
          tierId: persistedId ?? item.tierId,
          quantity: item.quantity,
        }
      })
      .filter(
        (item) => item.tierId.length > 0 && !item.tierId.startsWith("index:"),
      )
    const patch = {
      admit_count: admit,
      min_purchase_limit: Math.max(
        1,
        Math.floor(Number(match.minPurchaseLimit) || 1),
      ),
      max_purchase_limit:
        match.maxPurchaseLimit == null || Number(match.maxPurchaseLimit) <= 0
          ? null
          : Math.floor(Number(match.maxPurchaseLimit)),
      tier_type: tierType,
      category: ticketCategoryForInventory(tierType),
      list_price:
        tierType === "bundle" && match.listPrice != null
          ? match.listPrice
          : null,
      bundle_items: serializeBundleItems(resolvedBundle) as unknown as Json,
      bundle_type:
        tierType === "bundle"
          ? inferBundleType({
              bundleType: match.bundleType,
              dayId: match.dayId,
              items: resolvedBundle,
            })
          : null,
      updated_at: new Date().toISOString(),
    }
    if (tierType === "bundle") {
      const unitPriceByTierId: Record<string, number> = {}
      tickets.forEach((ticket, ticketIndex) => {
        const unit = Number(ticket.price) || 0
        unitPriceByTierId[`index:${ticketIndex}`] = unit
        if (ticket.id) unitPriceByTierId[ticket.id] = unit
        const named = ticket.name.trim()
        if (named) unitPriceByTierId[named] = unit
      })
      const pricedItems = resolvedBundle.map((item) => ({
        tierId:
          unitPriceByTierId[item.tierId] != null
            ? item.tierId
            : tickets.find((row) => row.name.trim() === item.tierId)?.id ??
              item.tierId,
        quantity: item.quantity,
      }))
      const rule = normalizePromoRule({
        tipoDescuento: match.promoDiscountType,
        valorDescuento: match.promoDiscountValue,
        cantidadRequerida: match.promoRequiredQty,
        cantidadPaga: match.promoPayQty,
      })
      const livePrices: Record<string, number> = {}
      for (const item of pricedItems) {
        livePrices[item.tierId] =
          unitPriceByTierId[item.tierId] ??
          unitPriceByTierId[
            tickets.find((row) => row.id === item.tierId)?.name.trim() ?? ""
          ] ??
          0
      }
      Object.assign(patch, {
        price: promotionalBundlePrice({
          items: pricedItems,
          unitPriceByTierId: livePrices,
          rule,
        }),
        list_price: regularBundlePrice(pricedItems, livePrices),
        promo_discount_type: rule.tipoDescuento,
        promo_discount_value: rule.valorDescuento,
        promo_required_qty: rule.cantidadRequerida,
        promo_pay_qty: rule.cantidadPaga,
      })
    }
    const description =
      match.description?.trim().slice(0, TICKET_DESCRIPTION_MAX) || null
    const highlightBadge =
      match.highlightBadge === "bestseller" ? "bestseller" : null
    const withCopy = await admin
      .from("ticket_tiers")
      .update({
        ...patch,
        description,
        highlight_badge: highlightBadge,
      })
      .eq("id", tier.id)
    if (
      withCopy.error &&
      /description|highlight_badge|min_purchase_limit|max_purchase_limit|promo_discount|schema cache|PGRST204|42703/i.test(
        withCopy.error.message,
      )
    ) {
      const {
        promo_discount_type: omittedType,
        promo_discount_value: omittedValue,
        promo_required_qty: omittedRequired,
        promo_pay_qty: omittedPay,
        min_purchase_limit: omittedMin,
        max_purchase_limit: omittedMax,
        ...safePatch
      } = patch as typeof patch & {
        promo_discount_type?: string | null
        promo_discount_value?: number
        promo_required_qty?: number
        promo_pay_qty?: number
        min_purchase_limit?: number
        max_purchase_limit?: number | null
      }
      void omittedMin
      void omittedMax
      void omittedType
      void omittedValue
      void omittedRequired
      void omittedPay
      const retry = await admin
        .from("ticket_tiers")
        .update(safePatch)
        .eq("id", tier.id)
      if (retry.error) return retry.error.message
    } else if (withCopy.error) {
      return withCopy.error.message
    }
  }
  return null
}

function isMissingPhasesTable(message: string) {
  return /ticket_tier_phases|schema cache|PGRST204|42703/i.test(message)
}

async function syncTicketTierPhases(
  eventId: string,
  tickets: EventFormValues["tickets"],
): Promise<string | null> {
  const admin = createAdminClient()
  const { data: tiers, error: tiersError } = await admin
    .from("ticket_tiers")
    .select("id, name")
    .eq("event_id", eventId)

  if (tiersError) {
    logPersistError("event-persist", tiersError)
    return tiersError.message
  }
  if (!tiers?.length) return null

  const { data: existing, error: existingError } = await admin
    .from("ticket_tier_phases")
    .select("id, tier_id, sold")
    .in(
      "tier_id",
      tiers.map((tier) => tier.id),
    )

  if (existingError) {
    if (isMissingPhasesTable(existingError.message)) return null
    logPersistError("event-persist", existingError)
    return existingError.message
  }

  const keepIds = new Set<string>()

  for (const tier of tiers) {
    const match =
      tickets.find((item) => item.id && item.id === tier.id) ??
      tickets.find((item) => item.name.trim() === tier.name.trim())
    const phases = match?.phases ?? []
    const parentCapacity = Math.max(1, Number(match?.capacity) || 1)

    for (const [index, phase] of phases.entries()) {
      const name = phase.name.trim() || `Lote ${index + 1}`
      const price = Math.max(0, Number(phase.price) || 0)
      const limit = Math.min(
        parentCapacity,
        Math.max(1, Number(phase.capacityLimit) || 1),
      )
      const endMs = phase.endTime ? Date.parse(phase.endTime) : Number.NaN
      const expired =
        Number.isFinite(endMs) && endMs <= Date.now()
      const status =
        phase.status === "sold_out" || expired
          ? ("sold_out" as const)
          : phase.status === "active"
            ? ("active" as const)
            : ("scheduled" as const)
      const patch = {
        name,
        price,
        capacity_limit: limit,
        start_time: phase.startTime || null,
        end_time: phase.endTime || null,
        status,
      }

      if (phase.id) {
        const { error } = await admin
          .from("ticket_tier_phases")
          .update(patch)
          .eq("id", phase.id)
          .eq("tier_id", tier.id)
        if (error) {
          logPersistError("event-persist", error)
          return error.message
        }
        keepIds.add(phase.id)
        continue
      }

      const { data: created, error } = await admin
        .from("ticket_tier_phases")
        .insert({ ...patch, tier_id: tier.id })
        .select("id")
        .maybeSingle()
      if (error) {
        logPersistError("event-persist", error)
        return error.message
      }
      if (created?.id) keepIds.add(created.id)
    }
  }

  const stale = (existing ?? []).filter((row) => {
    if (keepIds.has(row.id)) return false
    return Number(row.sold) === 0
  })
  if (stale.length > 0) {
    await admin
      .from("ticket_tier_phases")
      .delete()
      .in(
        "id",
        stale.map((row) => row.id),
      )
  }

  await admin.rpc("heal_ticket_tier_phases", {
    p_event_id: eventId,
  })
  return null
}

async function syncTicketSaleWindows(
  eventId: string,
  tickets: EventFormValues["tickets"],
): Promise<string | null> {
  const admin = createAdminClient()
  const { data: tiers, error: tiersError } = await admin
    .from("ticket_tiers")
    .select("id, name")
    .eq("event_id", eventId)

  if (tiersError) {
    logPersistError("event-persist", tiersError)
    return tiersError.message
  }

  for (const tier of tiers ?? []) {
    const match =
      tickets.find((item) => item.id && item.id === tier.id) ??
      tickets.find((item) => item.name.trim() === tier.name.trim())
    const { error } = await admin
      .from("ticket_tiers")
      .update({
        sale_starts_at: saleWindowToIso(match?.saleStartsAt),
        sale_ends_at: saleWindowToIso(match?.saleEndsAt),
      })
      .eq("id", tier.id)
    if (error) {
      if (isMissingSaleWindowSchema(error.message)) return null
      logPersistError("event-persist", error)
      return error.message
    }
  }
  return null
}

function parseAgeRestriction(raw: unknown): AgeRestriction {
  const value = String(raw ?? "").trim()
  if ((AGE_RESTRICTION_VALUES as readonly string[]).includes(value)) {
    return value as AgeRestriction
  }
  return "atp"
}

const ALLOWED_FLYER_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
])
const MAX_FLYER_BYTES = MAX_EVENT_FLYER_BYTES

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 80)
}

async function uploadEventFlyer(
  supabase: SupabaseClient<Database>,
  userId: string,
  file: File,
): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED_FLYER_TYPES.has(file.type)) {
    return {
      error: "El flyer debe ser PNG, JPG o WEBP.",
    }
  }

  if (file.size > MAX_FLYER_BYTES) {
    return {
      error: "El flyer no puede superar los 5 MB.",
    }
  }

  const bytes = await readFileBytes(file)
  const kind = detectRasterImageMagic(bytes)
  if (!kind) {
    return { error: "El flyer no es un JPG, PNG o WEBP valido." }
  }
  const contentType = rasterContentType(kind)

  const uniqueName = `${Date.now()}-${sanitizeFileName(file.name || "flyer.jpg")}`
  const path = `${userId}/${uniqueName}`

  const { error: uploadError } = await supabase.storage
    .from("event-flyers")
    .upload(path, bytesToBlob(bytes, contentType), {
      cacheControl: "60",
      upsert: false,
      contentType,
    })

  if (uploadError) {
    return {
      error: `No se pudo subir el flyer: ${uploadError.message}`,
    }
  }

  const { data } = supabase.storage.from("event-flyers").getPublicUrl(path)

  if (!data?.publicUrl) {
    await supabase.storage.from("event-flyers").remove([path])
    return { error: "No se pudo obtener la URL pública del flyer." }
  }

  return { url: data.publicUrl }
}

export type CreateCompleteEventResult =
  | { success: true; eventId: string; venueId: string | null }
  | {
      success: false
      error: string
      code?: AppErrorCode
      source?: PersistErrorSource
      title?: string
      field?: string
      actionHint?: string
      wizardConflict?: WizardConflict
    }

export type EditableEventData = {
  id: string
  organizerId: string
  title: string
  flyerUrl: string | null
  updatedAt: string
  status: EventStatus
  values: EventFormValues
  zoneTierPricing: Array<{
    id: string
    sectorKey: string
    sectorName: string
    ticketTierId: string
    ticketTierName: string
    price: number
    tableNumberStart: number | null
    tableNumberEnd: number | null
  }>
}

function toLocalDateTimeInput(value: string): string {
  return toDatetimeLocalInput(value)
}

function resolveEventSectorId(
  raw: string | null | undefined,
  zones: EventFormValues["venue"]["zones"],
): string | null {
  const id = raw?.trim() || null
  if (!id) return null
  const list = zones ?? []
  if (list.some((zone) => zone.id === id)) return id
  const bySlug = list.find(
    (zone) => logicalSectorId(zone.name, null) === id,
  )
  return bySlug?.id ?? null
}

export type EventGeneralSector = {
  id: string
  name: string
  capacity: number
}

export async function listEventGeneralSectors(
  eventId: string,
): Promise<
  | { ok: true; sectors: EventGeneralSector[] }
  | { ok: false; error: string }
> {
  const scopedEventId = asUuidOrNull(eventId, [])
  if (!scopedEventId) {
    return {
      ok: false,
      error: "Error al cargar sectores. Intente nuevamente.",
    }
  }

  try {
    const { supabase, user } = await requireAuthenticatedUser()
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const { data: event } = await supabase
      .from("events")
      .select("id, organizer_id")
      .eq("id", scopedEventId)
      .maybeSingle()

    if (
      !event ||
      (event.organizer_id !== user.id && profile?.role !== "super_admin")
    ) {
      return {
        ok: false,
        error: "Error al cargar sectores. Intente nuevamente.",
      }
    }

    const { data, error } = await supabase
      .from("event_zones")
      .select("id, name, capacity, type")
      .eq("event_id", scopedEventId)
      .eq("type", "general_admission")
      .order("created_at")

    if (error) {
      logger.error({
        context: "list_event_general_sectors",
        event_id: scopedEventId,
        error,
      })
      return {
        ok: false,
        error: "Error al cargar sectores. Intente nuevamente.",
      }
    }

    return {
      ok: true,
      sectors: (data ?? []).flatMap((row) => {
        const name = String(row.name ?? "").trim()
        const capacity = Math.max(0, Number(row.capacity) || 0)
        if (!name || capacity < 1) return []
        return [
          {
            id: logicalSectorId(name, String(row.id ?? "")),
            name,
            capacity,
          },
        ]
      }),
    }
  } catch (error) {
    logger.error({
      context: "list_event_general_sectors",
      event_id: scopedEventId,
      error,
    })
    return {
      ok: false,
      error: "Error al cargar sectores. Intente nuevamente.",
    }
  }
}

function parseVenueZones(raw: unknown): EventFormValues["venue"]["zones"] {
  if (!Array.isArray(raw)) return undefined
  const zones = raw.flatMap((item) => {
    const zone = item as Record<string, unknown>
    const name = String(zone.name ?? "").trim()
    const capacity = Number(zone.capacity ?? 0)
    if (!name || !Number.isFinite(capacity) || capacity < 1) return []
    const reserved = zone.type === "reserved_seating"
    const rawId = typeof zone.id === "string" ? zone.id : null
    return [
      {
        id: logicalSectorId(name, rawId),
        name,
        type: reserved
          ? ("reserved_seating" as const)
          : ("general_admission" as const),
        capacity,
        rows: reserved ? Number(zone.rows ?? 0) || null : null,
        seatsPerRow: reserved
          ? Number(zone.seatsPerRow ?? zone.seats_per_row ?? 0) || null
          : null,
      },
    ]
  })
  return zones.length > 0 ? zones : undefined
}

async function persistLogicalEventZones(
  client: SupabaseClient<Database>,
  eventId: string,
  data: EventFormValues,
): Promise<string | null> {
  const zones = normalizeLogicalSectors(data.venue.zones).filter(
    (zone) => zone.type === "general_admission",
  )

  const { data: existing, error: existingError } = await client
    .from("event_zones")
    .select("id, name, type")
    .eq("event_id", eventId)
  if (existingError) {
    logPersistError("event-persist", existingError)
    return existingError.message
  }

  const keepNames = new Set(
    zones.map((zone) => zone.name.trim().toLocaleLowerCase("es")),
  )
  for (const row of existing ?? []) {
    if (row.type && row.type !== "general_admission") continue
    const key = String(row.name).trim().toLocaleLowerCase("es")
    if (keepNames.has(key)) continue
    const { error } = await client
      .from("event_zones")
      .delete()
      .eq("id", row.id)
      .eq("event_id", eventId)
    if (error) {
      logPersistError("event-persist", error)
      return error.message
    }
  }

  if (zones.length === 0) return null

  const byName = new Map(
    (existing ?? [])
      .filter((row) => keepNames.has(String(row.name).trim().toLocaleLowerCase("es")))
      .map((row) => [
        String(row.name).trim().toLocaleLowerCase("es"),
        row.id,
      ]),
  )

  for (const zone of zones) {
    const key = zone.name.trim().toLocaleLowerCase("es")
    const currentId = byName.get(key)
    if (currentId) {
      const { error } = await client
        .from("event_zones")
        .update({
          capacity: positiveInventoryCapacity(zone.capacity),
          type: zone.type,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", currentId)
        .eq("event_id", eventId)
      if (error) {
        logPersistError("event-persist", error)
        return error.message
      }
      continue
    }
    const { error } = await client.from("event_zones").insert({
      event_id: eventId,
      name: zone.name,
      type: zone.type,
      capacity: positiveInventoryCapacity(zone.capacity),
    } as never)
    if (error) {
      logPersistError("event-persist", error)
      return error.message
    }
  }
  return null
}

async function loadEditableLineup(
  supabase: SupabaseClient,
  eventId: string,
  jsonLineup: unknown,
) {
  const attempts = [
    EVENT_ARTISTS_LINEUP_SELECT,
    EVENT_ARTISTS_LINEUP_SELECT_NO_PREVIEW,
    EVENT_ARTISTS_LINEUP_SELECT_LEGACY,
    EVENT_ARTISTS_LINEUP_SELECT_LEGACY_NO_PREVIEW,
  ]

  let rows: unknown[] = []
  for (const columns of attempts) {
    const result = await supabase
      .from("event_artists")
      .select(columns)
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
    if (!result.error) {
      rows = result.data ?? []
      break
    }
  }

  const relational = lineupDraftsFromItems(
    rows.map((row) =>
      mapLineupItem(row as Parameters<typeof mapLineupItem>[0]),
    ),
  )
  if (relational.length > 0) return relational

  const parsed = parseEventLineup(jsonLineup)
  return parsed.artists.map((artist, index) => {
    const slot =
      parsed.slots.find((item) => item.title === artist.name) ??
      parsed.slots[index]
    return {
      id: artist.id,
      artistId: artist.id.startsWith("artist-") ? null : artist.id,
      lineupEntryId: null,
      spotifyId: artist.spotifyId,
      name: artist.name,
      imageUrl: artist.imageUrl,
      genre: artist.role,
      performanceTime: performanceTimeToInput(slot?.time),
      stage: artist.role ?? "",
      order: index,
      isHeadliner: Boolean(artist.isHeadliner),
      topTrackPreviewUrl: artist.topTrackPreviewUrl,
      topTrackName: artist.topTrackName,
    }
  })
}

export async function getEventForEditing(
  eventId: string,
): Promise<EditableEventData | null> {
  if (!eventId?.trim()) return null

  try {
    const { supabase, user } = await requireAuthenticatedUser()
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, organizer_approval_status")
      .eq("id", user.id)
      .maybeSingle()

    const isSuperAdmin = profile?.role === "super_admin"
    const reader = isSuperAdmin ? createAdminClient() : supabase

    const eventSelectWithCheckout =
      "id, organizer_id, title, description, date, ends_at, location, image_url, flyer_url, venue_id, visibility, status, schedule_days, category_id, age_restriction, province, department, venue_map, default_ticket_tab, lineup, has_seating_plan, has_schedule, delivery_mode, access_link, max_tickets_per_user, platform_fee_percentage, platform_fixed_fee, is_sponsored_by_tokepass, accepts_mercado_pago, accepts_pos_payments, refund_policy, updated_at"
    const eventSelectWithAgenda =
      "id, organizer_id, title, description, date, ends_at, location, image_url, flyer_url, venue_id, visibility, status, schedule_days, category_id, age_restriction, province, department, venue_map, default_ticket_tab, lineup, has_seating_plan, has_schedule, delivery_mode, access_link, max_tickets_per_user, platform_fee_percentage, platform_fixed_fee, is_sponsored_by_tokepass, updated_at"
    const eventSelectWithPicker =
      "id, organizer_id, title, description, date, ends_at, location, image_url, flyer_url, venue_id, visibility, status, schedule_days, category_id, age_restriction, province, department, venue_map, default_ticket_tab, lineup, has_seating_plan, max_tickets_per_user, updated_at"
    const eventSelectWithPlace =
      "id, organizer_id, title, description, date, ends_at, location, image_url, flyer_url, venue_id, visibility, status, schedule_days, category_id, age_restriction, province, department, venue_map, max_tickets_per_user, updated_at"
    const eventSelectCore =
      "id, organizer_id, title, description, date, ends_at, location, image_url, flyer_url, venue_id, visibility, status, schedule_days, category_id, age_restriction, venue_map, max_tickets_per_user, updated_at"

    let eventQuery = await reader
      .from("events")
      .select(eventSelectWithCheckout)
      .eq("id", eventId)
      .maybeSingle()

    if (
      eventQuery.error &&
      /accepts_mercado_pago|accepts_pos_payments|refund_policy|schema cache|PGRST204|42703/i.test(
        eventQuery.error.message,
      )
    ) {
      eventQuery = await reader
        .from("events")
        .select(eventSelectWithAgenda)
        .eq("id", eventId)
        .maybeSingle()
    }

    if (
      eventQuery.error &&
      /has_schedule|schema cache|PGRST204|42703/i.test(eventQuery.error.message)
    ) {
      eventQuery = await reader
        .from("events")
        .select(eventSelectWithPicker)
        .eq("id", eventId)
        .maybeSingle()
    }

    if (
      eventQuery.error &&
      /has_seating_plan|default_ticket_tab|lineup|schema cache|PGRST204|42703/i.test(
        eventQuery.error.message,
      )
    ) {
      eventQuery = await reader
        .from("events")
        .select(eventSelectWithPlace)
        .eq("id", eventId)
        .maybeSingle()
    }

    if (
      eventQuery.error &&
      /province|department|schema cache|PGRST204|42703/i.test(
        eventQuery.error.message,
      )
    ) {
      eventQuery = await reader
        .from("events")
        .select(eventSelectCore)
        .eq("id", eventId)
        .maybeSingle()
    }

    const { data: event, error: eventError } = eventQuery

    if (eventError || !event) return null
    if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
      return null
    }

    const ticketSelectWithCopy =
      "id, name, price, base_price, platform_fee, capacity, sold, time_limit, bonus_reward, day_id, visibility, layout_type, seating_sector_id, capacity_per_unit, admit_count, category, list_price, tier_type, bundle_items, bundle_type, promo_discount_type, promo_discount_value, promo_required_qty, promo_pay_qty, description, highlight_badge, min_purchase_limit, max_purchase_limit, sale_starts_at, sale_ends_at"
    const ticketSelectCore =
      "id, name, price, base_price, platform_fee, capacity, sold, time_limit, bonus_reward, day_id, visibility, layout_type, seating_sector_id, capacity_per_unit, admit_count, category, list_price, tier_type, bundle_items, bundle_type"

    const [{ data: tiers, error: tiersError }, venueResult] = await Promise.all([
      (async () => {
        const rich = await reader
          .from("ticket_tiers")
          .select(ticketSelectWithCopy)
          .eq("event_id", eventId)
          .order("created_at")
        if (
          rich.error &&
          /description|highlight_badge|min_purchase_limit|max_purchase_limit|promo_discount|sale_starts_at|sale_ends_at|schema cache|PGRST204|42703/i.test(
            rich.error.message,
          )
        ) {
          return reader
            .from("ticket_tiers")
            .select(ticketSelectCore)
            .eq("event_id", eventId)
            .order("created_at")
        }
        return rich
      })(),
      event.venue_id
        ? reader
            .from("venues")
            .select(
              "id, name, location, address, city, capacity, max_capacity, zone_blueprint, latitude, longitude, seating_background_url, seating_layout, venue_map",
            )
            .eq("id", event.venue_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (tiersError) return null

    let venue = venueResult.data
    if (event.venue_id && (venueResult.error || !venue)) {
      const fallback = await reader
        .from("venues")
        .select("id, name, location, address, city, capacity, zone_blueprint, seating_layout, venue_map")
        .eq("id", event.venue_id)
        .maybeSingle()
      venue = fallback.data
        ? {
            ...fallback.data,
            max_capacity: Number(fallback.data.capacity) || 1,
            latitude: null,
            longitude: null,
            seating_background_url: null,
            seating_layout: fallback.data.seating_layout ?? null,
          }
        : null
    }

    const { data: eventZoneRows } = await reader
      .from("event_zones")
      .select("id, name, type, capacity")
      .eq("event_id", eventId)
      .order("created_at")

    const venueZones = parseVenueZones(
      (eventZoneRows ?? []).map((row) => ({
        id: logicalSectorId(String(row.name ?? ""), String(row.id ?? "")),
        name: row.name,
        type: row.type,
        capacity: row.capacity,
      })),
    )
    const firstZone = venueZones?.[0]
    const venueCapacity = Number(venue?.capacity ?? 0) || 1
    const venueMaxCapacity = Number(
      (venue as { max_capacity?: number | null } | null)?.max_capacity ?? 0,
    )
    const parsedDays = parseScheduleDays(event.schedule_days)
    const scheduleDays = scheduleDaysToFormValues(parsedDays)
    const isMultiDay = isMultiDaySchedule(parsedDays)
    const visibility =
      event.visibility === "private" || event.visibility === "guest_list_only"
        ? event.visibility
        : "public"

    const latitude =
      venue?.latitude == null || !Number.isFinite(Number(venue.latitude))
        ? null
        : Number(venue.latitude)
    const longitude =
      venue?.longitude == null || !Number.isFinite(Number(venue.longitude))
        ? null
        : Number(venue.longitude)

    const ticketFeePercentage = clampServiceFeePercentage(
      (event as { platform_fee_percentage?: number | null })
        .platform_fee_percentage ?? DEFAULT_PLATFORM_FEE_PERCENTAGE,
    )

    const ticketValues: EventFormValues["tickets"] = (tiers ?? []).map((tier) => ({
      id: tier.id,
      name: String(tier.name ?? "Entrada"),
      price: Number(tier.price) || 0,
      basePrice: Number(tier.base_price) || 0,
      feeStrategy: "pass_to_customer",
      calculationMode: "net_income",
      capacity: Math.max(1, Number(tier.capacity) || 1),
      sold: Math.max(0, Number(tier.sold) || 0),
      timeLimit: tier.time_limit ?? "",
      saleStartsAt: saleWindowToFormValue(
        (tier as { sale_starts_at?: string | null }).sale_starts_at,
      ),
      saleEndsAt: saleWindowToFormValue(
        (tier as { sale_ends_at?: string | null }).sale_ends_at,
      ),
      bonusReward: tier.bonus_reward ?? "",
      description:
        typeof (tier as { description?: string | null }).description === "string"
          ? String((tier as { description?: string | null }).description).slice(
              0,
              TICKET_DESCRIPTION_MAX,
            )
          : "",
      highlightBadge: parseTicketHighlightBadge(
        (tier as { highlight_badge?: string | null }).highlight_badge,
      ),
      dayId: asUuidOrNull(tier.day_id, ["all"]),
      visibility:
        tier.visibility === "private"
          ? ("private" as const)
          : ("public" as const),
      layoutType:
        tier.layout_type === "table_combo" ||
        tier.layout_type === "numbered_seat"
          ? tier.layout_type
          : ("general" as const),
      seatingSectorId: resolveEventSectorId(
        tier.seating_sector_id,
        venueZones,
      ),
      capacityPerUnit: Math.max(1, Number(tier.capacity_per_unit ?? 1) || 1),
      minPurchaseLimit: Math.max(
        1,
        Number((tier as { min_purchase_limit?: number }).min_purchase_limit ?? 1) ||
          1,
      ),
      maxPurchaseLimit: (() => {
        const raw = Number(
          (tier as { max_purchase_limit?: number | null }).max_purchase_limit,
        )
        if (!Number.isFinite(raw) || raw <= 0) return null
        return Math.floor(raw)
      })(),
      admitCount: Math.max(
        1,
        Number((tier as { admit_count?: number }).admit_count ?? 1) || 1,
      ),
      tierType: inferInventoryTierType({
        tierType: (tier as { tier_type?: string }).tier_type,
        layoutType: tier.layout_type,
        category: (tier as { category?: string }).category,
        bundleItems: parseBundleItems(
          (tier as { bundle_items?: unknown }).bundle_items,
        ),
      }),
      listPrice:
        (tier as { list_price?: number | null }).list_price == null
          ? null
          : Number((tier as { list_price?: number | null }).list_price),
      bundleItems: parseBundleItems(
        (tier as { bundle_items?: unknown }).bundle_items,
      ),
      bundleType: parseBundleType(
        (tier as { bundle_type?: string | null }).bundle_type,
      ),
      promoDiscountType: parsePromoDiscountType(
        (tier as { promo_discount_type?: string | null }).promo_discount_type,
      ),
      promoDiscountValue: Number(
        (tier as { promo_discount_value?: number }).promo_discount_value ?? 0,
      ),
      promoRequiredQty: Math.max(
        1,
        Number((tier as { promo_required_qty?: number }).promo_required_qty ?? 1) || 1,
      ),
      promoPayQty: Math.max(
        0,
        Number((tier as { promo_pay_qty?: number }).promo_pay_qty ?? 1) || 0,
      ),
      phases: [],
    }))

    const tierIds = tiers.map((tier) => tier.id)
    if (tierIds.length > 0) {
      const phasesQuery = await reader
        .from("ticket_tier_phases")
        .select(
          "id, tier_id, name, price, capacity_limit, start_time, end_time, status, sold, created_at",
        )
        .in("tier_id", tierIds)
        .order("created_at")
      if (!phasesQuery.error && phasesQuery.data) {
        const byTier = new Map<string, EventFormValues["tickets"][number]["phases"]>()
        for (const row of phasesQuery.data) {
          const list = byTier.get(row.tier_id) ?? []
          list.push({
            id: row.id,
            name: String(row.name ?? "Lote"),
            price: Number(row.price) || 0,
            capacityLimit: Math.max(1, Number(row.capacity_limit) || 1),
            startTime: row.start_time,
            endTime: row.end_time,
            status: row.status,
            sold: Math.max(0, Number(row.sold) || 0),
          })
          byTier.set(row.tier_id, list)
        }
        for (const ticket of ticketValues) {
          if (ticket.id) {
            ticket.phases = byTier.get(ticket.id) ?? []
          }
        }
      }
    }

    const { data: pricingRows } = await reader
      .from("zone_tier_pricing")
      .select(
        "id, sector_key, ticket_tier_id, price, table_number_start, table_number_end",
      )
      .eq("event_id", eventId)

    const tierNameById = new Map(
      tiers.map((tier) => [tier.id, String(tier.name ?? "Entrada")]),
    )
    const sectorNameById = new Map<string, string>()
    for (const tier of ticketValues) {
      if (tier.seatingSectorId) {
        sectorNameById.set(tier.seatingSectorId, tier.name)
      }
    }
    if (venue?.seating_layout && Array.isArray(venue.seating_layout)) {
      for (const sector of venue.seating_layout as Array<
        Record<string, unknown>
      >) {
        const id = String(sector.id ?? "")
        const name = String(sector.sector_name ?? sector.name ?? "")
        if (id && name) sectorNameById.set(id, name)
      }
    }

    const healedValues = prepareEventForPersist({
      basics: {
          title: event.title,
          date: toLocalDateTimeInput(event.date),
          endDate: event.ends_at ? toLocalDateTimeInput(event.ends_at) : "",
          description: event.description ?? "",
          flyerName: event.flyer_url || event.image_url ? "Flyer actual" : null,
          visibility,
          isMultiDay,
          scheduleDays,
          categoryId: event.category_id ?? "",
          ageRestriction: parseAgeRestriction(event.age_restriction),
          hasSeatingPlan: (() => {
            const stored = (event as { has_seating_plan?: boolean | null })
              .has_seating_plan
            if (stored == null) {
              return Boolean(event.venue_id || event.venue_map)
            }
            return Boolean(stored)
          })(),
          hasSchedule: Boolean(
            (event as { has_schedule?: boolean | null }).has_schedule,
          ),
          deliveryMode: (() => {
            const stored = parseDeliveryMode(
              (event as { delivery_mode?: unknown }).delivery_mode,
            )
            if (stored === "ONLINE") return stored
            if (
              isStreamingVenue({
                venueName: venue?.name,
                venueLocation: venue?.location ?? event.location,
              })
            ) {
              return "ONLINE"
            }
            return stored
          })(),
          accessLink:
            typeof (event as { access_link?: unknown }).access_link === "string"
              ? String((event as { access_link?: unknown }).access_link)
              : "",
        },
        venue: {
          mode: event.venue_id ? "existing" : "new",
          existingVenueId: event.venue_id,
          zoneType: firstZone?.type ?? "general_admission",
          venueName: venue?.name ?? event.location ?? "",
          venueLocation: composeVenuePlace({
            street:
              (typeof venue?.address === "string" && venue.address.trim()) ||
              venue?.location ||
              event.location,
            city: venue?.city,
            department: (event as { department?: string | null }).department,
            province: (event as { province?: string | null }).province,
          }).street,
          venueCity:
            composeVenuePlace({
              street: venue?.location,
              city: venue?.city,
              department: (event as { department?: string | null }).department,
              province: (event as { province?: string | null }).province,
            }).city ??
            [(event as { department?: string | null }).department, (event as { province?: string | null }).province].filter(Boolean).join(", "),
          province:
            (event as { province?: string | null }).province ??
            (typeof venue?.city === "string" && venue.city.includes(",")
              ? venue.city.split(",").slice(1).join(",").trim()
              : ""),
          department: (event as { department?: string | null }).department ?? (typeof venue?.city === "string"
            ? venue.city.split(",")[0]?.trim()
            : ""),
          provinceId: null,
          departmentId: null,
          capacity: firstZone?.capacity ?? venueCapacity,
          customMaxCapacity:
            venueMaxCapacity > (firstZone?.capacity ?? venueCapacity)
              ? venueMaxCapacity
              : null,
          rows: firstZone?.rows ?? undefined,
          seatsPerRow: firstZone?.seatsPerRow ?? undefined,
          latitude,
          longitude,
          seatingBackgroundUrl:
            typeof venue?.seating_background_url === "string"
              ? venue.seating_background_url
              : null,
          venueMap: event.venue_map ?? venue?.venue_map ?? null,
          seatingLayout: venue?.seating_layout,
          includesSeatingMap: Boolean(
            firstZone?.type === "reserved_seating" ||
              (Array.isArray(venue?.seating_layout) &&
                venue.seating_layout.length > 0) ||
              (venue?.venue_map &&
                typeof venue.venue_map === "object" &&
                ((Array.isArray(
                  (venue.venue_map as { elements?: unknown[] }).elements,
                ) &&
                  ((venue.venue_map as { elements?: unknown[] }).elements
                    ?.length ?? 0) > 0) ||
                  (Array.isArray(
                    (venue.venue_map as { zones?: unknown[] }).zones,
                  ) &&
                    ((venue.venue_map as { zones?: unknown[] }).zones?.length ??
                      0) > 0))),
          ),
          saveVenueForReuse: false,
          zones: venueZones,
        },
        tickets: ticketValues,
        ticketsDefaultTab: parseDefaultTicketTab(
          (event as { default_ticket_tab?: string | null }).default_ticket_tab,
        ),
        lineup: await loadEditableLineup(
          reader,
          eventId,
          (event as { lineup?: unknown }).lineup,
        ),
        maxTicketsPerUser: resolvePurchaseLimit(
          (event as { max_tickets_per_user?: number | null }).max_tickets_per_user,
        ),
        acceptsMercadoPago: eventAcceptsMercadoPago(
          (event as { accepts_mercado_pago?: boolean | null })
            .accepts_mercado_pago,
        ),
        acceptsPosPayments: eventAcceptsPosPayments(
          (event as { accepts_pos_payments?: boolean | null })
            .accepts_pos_payments,
        ),
        defaultFeeStrategy: "pass_to_customer",
        serviceFeePercentage: ticketFeePercentage,
        refundPolicy: parseEventRefundPolicy(
          (event as { refund_policy?: unknown }).refund_policy,
        ),
    })

    return {
      id: event.id,
      organizerId: event.organizer_id,
      title: event.title,
      flyerUrl: event.flyer_url ?? event.image_url,
      status: (event.status as EventStatus) || "draft",
      updatedAt:
        typeof event.updated_at === "string" && event.updated_at
          ? event.updated_at
          : new Date().toISOString(),
      values: healedValues,
      zoneTierPricing: (pricingRows ?? []).map((row) => ({
        id: row.id,
        sectorKey: row.sector_key,
        sectorName: sectorNameById.get(row.sector_key) ?? row.sector_key,
        ticketTierId: row.ticket_tier_id,
        ticketTierName: tierNameById.get(row.ticket_tier_id) ?? "Entrada",
        price: Number(row.price) || 0,
        tableNumberStart: row.table_number_start,
        tableNumberEnd: row.table_number_end,
      })),
    }
  } catch (error) {
    console.error("[getEventForEditing]", eventId, error)
    return null
  }
}

/**
 * Crea el evento atómicamente. Espera FormData con:
 * - `payload`: JSON string de `EventFormValues`
 * - `flyer`: File opcional (imagen)
 */
export async function createCompleteEvent(
  formData: FormData,
): Promise<CreateCompleteEventResult> {
  const rawPayload = formData.get("payload")
  if (typeof rawPayload !== "string") {
    return {
      success: false,
      error: "Payload del evento inválido.",
    }
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawPayload)
  } catch {
    return {
      success: false,
      error: "No se pudo interpretar la configuración del evento.",
    }
  }

  const draftMode = formData.get("draftMode") === "1"
  let identityOnly = formData.get("identityOnly") === "1"
  const parsed =
    draftMode || identityOnly
      ? draftEventSchema.safeParse(parsedJson)
      : publishEventSchema.safeParse(parsedJson)

  if (!parsed.success) {
    return persistFailure(parsed.error)
  }

  if (identityOnly && formHasInventoryOrVenue(parsed.data)) {
    identityOnly = false
  }

  if (identityOnly) {
    return persistNewEventIdentityOnly(formData, parsed.data)
  }

  const drafted = coerceDraftEventForm(parsed.data)
  const formValues = withHealedMapTickets(
    applyFormSeatingSectorSanitizer(
      {
        ...drafted,
        tickets: sanitizeTicketTiersForPersist(drafted.tickets, {
          mode: "create",
        }),
      },
      normalizeLogicalSectors(drafted.venue.zones).map((zone) => zone.id),
    ),
  )

  const skuError = draftMode ? null : venueMapSkuGuard(formValues)
  if (skuError) return skuError

  let supabase: Awaited<ReturnType<typeof createClient>>
  let userId: string

  try {
    const session = await requireAuthenticatedUser()
    supabase = session.supabase
    userId = session.user.id
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Debes iniciar sesión para crear un evento.",
    }
  }

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", userId)
    .maybeSingle()

  const actorRole = actorProfile?.role ?? null
  const actorCanCreate =
    actorRole === "super_admin" ||
    (actorRole === "admin" &&
      actorProfile?.organizer_approval_status === "approved")
  if (!actorCanCreate) {
    return {
      success: false,
      error: "Tu cuenta de organizador no está habilitada para crear eventos.",
    }
  }

  // White-glove: solo super_admin puede crear a nombre de otra productora.
  // Un admin normal siempre queda atado a su propio ID (ignora el param).
  let organizerId = userId
  const targetRaw = formData.get("targetOrganizerId")
  const targetOrganizerId =
    typeof targetRaw === "string" && targetRaw.trim() ? targetRaw.trim() : null

  if (targetOrganizerId && actorRole === "super_admin") {
    const admin = createAdminClient()
    const { data: targetProfile, error: targetError } = await admin
      .from("profiles")
      .select("id, role, organizer_approval_status")
      .eq("id", targetOrganizerId)
      .maybeSingle()

    if (
      targetError ||
      !targetProfile ||
      targetProfile.role !== "admin" ||
      targetProfile.organizer_approval_status !== "approved"
    ) {
      return {
        success: false,
        error: "La productora destino no existe o no es un organizador válido.",
      }
    }

    organizerId = targetProfile.id
  }

  const flyerEntry = formData.get("flyer")
  let flyerUrl: string | null = null

  // Cliente RPC: service-role si impersonamos (el RPC exige auth.uid = organizer
  // o service_role). Caso normal: sesión del organizador.
  const rpcClient =
    organizerId !== userId ? createAdminClient() : supabase

  if (flyerEntry instanceof File && flyerEntry.size > 0) {
    const uploaded = await uploadEventFlyer(rpcClient, organizerId, flyerEntry)
    if ("error" in uploaded) {
      return { success: false, error: uploaded.error }
    }
    flyerUrl = uploaded.url
  }

  const feeConfig = resolveFormFeeConfig(formValues, defaultEventFeeConfig())
  let rpcPayload: CreateCompleteEventRpcPayload
  try {
    if (!draftMode) {
      const freeCapError = assertFreeTicketCapacityAllowed(
        formValues.tickets,
        feeConfig.maxFreeTickets,
        actorRole === "super_admin",
      )
      if (freeCapError) {
        return { success: false, error: freeCapError }
      }
    }
    rpcPayload = mapEventFormToRpcPayload(formValues, feeConfig, flyerUrl)
    console.info("[event-persist] create payload", {
      tickets: rpcPayload.tiers.length,
      lineup: formValues.lineup?.length ?? 0,
      combos: formValues.tickets.filter((tier) => tier.tierType === "bundle").length,
      addons: formValues.tickets.filter((tier) => tier.tierType === "addon").length,
      zones: rpcPayload.zones.length,
    })
  } catch (error) {
    logPersistError("create_complete_event payload", error)
    return persistFailure(error)
  }

  const { data: eventId, error } = await runSeatingRpcWithRetry<string | null>({
    context: "create_complete_event_with_seating_tx",
    payload: rpcPayload,
    execute: async (payload) => {
      const result = await rpcClient.rpc("create_complete_event_with_seating_tx", {
        payload: payload as unknown as Json,
        p_organizer_id: organizerId,
      })
      return { data: result.data ?? null, error: result.error }
    },
  })

  if (error) {
    if (flyerUrl) {
      const path = flyerUrl.split("/event-flyers/")[1]
      if (path) {
        await rpcClient.storage.from("event-flyers").remove([path])
      }
    }

    return persistFailure(
      error.message.replace(
        /^create_complete_event_with_seating_tx:\s*/i,
        "",
      ),
    )
  }

  if (!eventId) {
    return {
      success: false,
      error: "La base de datos no devolvió el ID del evento.",
    }
  }

  const admitError = await syncTierAdmitCounts(String(eventId), formValues.tickets)
  if (admitError) {
    return persistFailure(admitError)
  }
  const phasesError = await syncTicketTierPhases(String(eventId), formValues.tickets)
  if (phasesError) return persistFailure(phasesError)
  const saleWindowError = await syncTicketSaleWindows(
    String(eventId),
    formValues.tickets,
  )
  if (saleWindowError) return persistFailure(saleWindowError)
  const lineupError = await persistEventLineupIfProvided(
    String(eventId),
    formValues.lineup,
  )
  if (lineupError) return persistFailure(lineupError)
  const scheduleError = await persistEventSchedule(
    rpcClient,
    String(eventId),
    formValues,
  )
  if (scheduleError) return persistFailure(scheduleError)
  const purchaseLimitError = await persistEventMaxTicketsPerUser(
    rpcClient,
    String(eventId),
    explicitPurchaseLimit(formValues.maxTicketsPerUser),
  )
  if (purchaseLimitError) {
    return persistFailure(purchaseLimitError)
  }
  const venuePersist = await persistEventVenueFields(
    rpcClient,
    String(eventId),
    formValues,
    { allowCreate: true },
  )
  if (venuePersist.error) {
    return persistFailure(venuePersist.error)
  }
  const venueId = venuePersist.venueId
  const deliveryError = await persistEventDeliveryProfile(
    rpcClient,
    String(eventId),
    formValues,
  )
  if (deliveryError) return persistFailure(deliveryError)
  const checkoutError = await persistEventCheckoutPolicy(
    rpcClient,
    String(eventId),
    formValues,
  )
  if (checkoutError) return persistFailure(checkoutError)
  const zonesError = await persistLogicalEventZones(
    rpcClient,
    String(eventId),
    formValues,
  )
  if (zonesError) return persistFailure(zonesError)

  const createMapActive = eventHasActiveSeatingMap({
    hasSeatingPlan: formValues.basics.hasSeatingPlan,
    includesSeatingMap: formValues.venue.includesSeatingMap,
    venueMap: formValues.venue.venueMap,
  })
  const materializeError = createMapActive
    ? await resyncEventSeatingUnitsAfterMapSave(rpcClient, String(eventId))
    : null
  if (materializeError) {
    return persistFailure(materializeError)
  }
  const seatingCapacityError = createMapActive
    ? await syncTicketCapacityFromSeatingUnits(rpcClient, String(eventId))
    : null
  if (seatingCapacityError) return persistFailure(seatingCapacityError)
  const capacityError = await assertPersistedInventoryCapacity(
    rpcClient,
    String(eventId),
  )
  if (capacityError) return persistFailure(capacityError)

  const feePersistError = await persistEventServiceFeePercentage(
    String(eventId),
    feeConfig.platformFeePercentage,
  )
  if (feePersistError) return persistFailure(feePersistError)

  await revalidatePersistedEvent(rpcClient, String(eventId))
  revalidatePath("/admin", "layout")
  revalidatePath("/", "layout")
  revalidatePath("/superadmin", "layout")
  revalidatePath("/super-admin", "layout")
  revalidatePath("/superadmin/events", "page")

  return { success: true, eventId: String(eventId), venueId }
}

/**
 * Updates event identity, venue and ticket tiers through one database
 * transaction. Tier prices in the form are public All-In values.
 */
export async function updateCompleteEvent(
  formData: FormData,
): Promise<CreateCompleteEventResult> {
  const eventId = String(formData.get("eventId") ?? "").trim()
  const rawPayload = formData.get("payload")

  if (!eventId || typeof rawPayload !== "string") {
    return { success: false, error: "Evento o payload inválido." }
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawPayload)
  } catch {
    return {
      success: false,
      error: "No se pudo interpretar la configuración del evento.",
    }
  }

  const draftMode = formData.get("draftMode") === "1"
  let identityOnly = formData.get("identityOnly") === "1"
  const parsed =
    draftMode || identityOnly
      ? draftEventSchema.safeParse(parsedJson)
      : publishEventSchema.safeParse(parsedJson)
  if (!parsed.success) {
    return persistFailure(parsed.error)
  }

  if (identityOnly && formHasInventoryOrVenue(parsed.data)) {
    identityOnly = false
  }

  const formValues = identityOnly
    ? (parsed.data as EventFormValues)
    : { ...coerceDraftEventForm(parsed.data) }

  let supabase: Awaited<ReturnType<typeof createClient>>
  let userId: string
  try {
    const session = await requireAuthenticatedUser()
    supabase = session.supabase
    userId = session.user.id
  } catch {
    return { success: false, error: "Debes iniciar sesión para editar." }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", userId)
    .maybeSingle()

  const isSuperAdmin = profile?.role === "super_admin"
  const reader = isSuperAdmin ? createAdminClient() : supabase

  const { data: event, error: eventError } = await reader
    .from("events")
    .select(
      "id, organizer_id, image_url, flyer_url, date, ends_at, schedule_days, venue_id, description",
    )
    .eq("id", eventId)
    .maybeSingle()

  if (eventError || !event) {
    return { success: false, error: "Evento no encontrado." }
  }

  if (!formValues.basics.description?.trim()) {
    formValues.basics.description = event.description?.trim() || "Borrador"
  }

  const isApprovedOrganizer =
    profile?.role === "admin" &&
    profile.organizer_approval_status === "approved"
  if (!isSuperAdmin && !isApprovedOrganizer) {
    return {
      success: false,
      error: "Tu cuenta de organizador no está habilitada para editar eventos.",
    }
  }

  if (event.organizer_id !== userId && !isSuperAdmin) {
    return { success: false, error: "No tenés permiso para editar este evento." }
  }

  const mutationClient =
    event.organizer_id !== userId ? createAdminClient() : supabase

  if (identityOnly) {
    return persistEventIdentityOnly({
      formData,
      formValues,
      eventId,
      organizerId: event.organizer_id,
      existingFlyerUrl: event.flyer_url ?? event.image_url,
      existing: {
        date: event.date,
        ends_at: event.ends_at,
        schedule_days: event.schedule_days,
      },
      mutationClient,
      venueId: event.venue_id,
    })
  }

  const { data: existingTiers, error: existingTiersError } =
    await mutationClient
      .from("ticket_tiers")
      .select("id, name, day_id, tier_type, seating_sector_id")
      .eq("event_id", eventId)

  if (existingTiersError) {
    return persistFailure(existingTiersError.message)
  }

  formValues.tickets = reconcileTicketsWithExistingRows(
    reconcileTicketTierIds(
      formValues.tickets,
      (existingTiers ?? []).map((row) => row.id),
    ),
    existingTiers ?? [],
  )
  Object.assign(
    formValues,
    withHealedMapTickets(
      formValues,
      (existingTiers ?? []).map((row) => row.id),
    ),
  )

  const skuError = draftMode ? null : venueMapSkuGuard(formValues)
  if (skuError) return skuError

  const healedTicketCount = formValues.tickets.length
  const venuePersist = await persistEventVenueFields(
    mutationClient,
    eventId,
    formValues,
    { allowCreate: true },
  )
  if (venuePersist.error) {
    return persistFailure(venuePersist.error)
  }
  const venueId = venuePersist.venueId
  const deliveryError = await persistEventDeliveryProfile(
    mutationClient,
    eventId,
    formValues,
  )
  if (deliveryError) return persistFailure(deliveryError)
  const checkoutError = await persistEventCheckoutPolicy(
    mutationClient,
    eventId,
    formValues,
  )
  if (checkoutError) return persistFailure(checkoutError)
  if (venueId) {
    formValues.venue.existingVenueId = venueId
  }
  const mapActive = eventHasActiveSeatingMap({
    hasSeatingPlan: formValues.basics.hasSeatingPlan,
    includesSeatingMap: formValues.venue.includesSeatingMap,
    venueMap: formValues.venue.venueMap,
  })
  if (mapActive) {
    const materializeBeforeTickets = await resyncEventSeatingUnitsAfterMapSave(
      mutationClient,
      eventId,
    )
    if (materializeBeforeTickets) {
      return persistFailure(materializeBeforeTickets)
    }
  } else {
    const detachError = await detachInactiveMapTiersInDatabase(
      mutationClient,
      eventId,
      formValues.tickets.map((tier) => tier.id ?? ""),
    )
    if (detachError) {
      return persistFailure(detachError)
    }
  }
  const zonesError = await persistLogicalEventZones(
    mutationClient,
    eventId,
    formValues,
  )
  if (zonesError) return persistFailure(zonesError)
  const persistedSectors = await loadPersistedSeatingSectorIds(
    mutationClient,
    eventId,
  )
  const sanitized = applyFormSeatingSectorSanitizer(formValues, [
    ...persistedSectors,
    ...normalizeLogicalSectors(formValues.venue.zones).map((zone) => zone.id),
  ])
  formValues.tickets = sanitized.tickets
  if (formValues.tickets.length === 0) {
    if (healedTicketCount > 0) {
      return persistFailure(
        "El inventario no se pudo guardar: las entradas se vaciaron al validar sectores. Revisá el mapa y los combos.",
      )
    }
    const lineupOnlyError = await persistEventLineupIfProvided(
      eventId,
      formValues.lineup,
    )
    if (lineupOnlyError) return persistFailure(lineupOnlyError)
    const purchaseLimitError = await persistEventMaxTicketsPerUser(
      mutationClient,
      eventId,
      explicitPurchaseLimit(formValues.maxTicketsPerUser),
    )
    if (purchaseLimitError) {
      return persistFailure(purchaseLimitError)
    }
    const emptyCheckoutError = await persistEventCheckoutPolicy(
      mutationClient,
      eventId,
      formValues,
    )
    if (emptyCheckoutError) return persistFailure(emptyCheckoutError)
    await revalidatePersistedEvent(mutationClient, eventId)
    return { success: true, eventId, venueId }
  }

  const flyerEntry = formData.get("flyer")
  let uploadedFlyerUrl: string | null = null

  if (flyerEntry instanceof File && flyerEntry.size > 0) {
    const uploaded = await uploadEventFlyer(
      mutationClient,
      event.organizer_id,
      flyerEntry,
    )
    if ("error" in uploaded) return { success: false, error: uploaded.error }
    uploadedFlyerUrl = uploaded.url
  }

  const storedFeeConfig = await loadEventFeeConfig(supabase, eventId)
  const feeConfig = resolveFormFeeConfig(formValues, storedFeeConfig)
  let rpcPayload: CreateCompleteEventRpcPayload
  try {
    if (!draftMode) {
      const freeCapError = assertFreeTicketCapacityAllowed(
        formValues.tickets,
        feeConfig.maxFreeTickets,
        isSuperAdmin,
      )
      if (freeCapError) {
        return { success: false, error: freeCapError }
      }
    }
    rpcPayload = mapEventFormToRpcPayload(
      formValues,
      feeConfig,
      uploadedFlyerUrl ?? event.flyer_url ?? event.image_url,
      {
        date: event.date,
        ends_at: event.ends_at,
        schedule_days: event.schedule_days,
      },
    )
    console.info("[event-persist] update payload", {
      eventId,
      tickets: rpcPayload.tiers.length,
      lineup: formValues.lineup?.length ?? 0,
      combos: formValues.tickets.filter((tier) => tier.tierType === "bundle").length,
      addons: formValues.tickets.filter((tier) => tier.tierType === "addon").length,
      zones: rpcPayload.zones.length,
    })
  } catch (error) {
    logPersistError("update_complete_event payload", error)
    return persistFailure(error)
  }

  const rpcResult = await runSeatingRpcWithRetry<string | null>({
    context: "update_complete_event_with_seating_tx",
    eventId,
    payload: rpcPayload,
    execute: async (payload) => {
      const result = await mutationClient.rpc(
        "update_complete_event_with_seating_tx",
        {
          p_event_id: eventId,
          payload: payload as unknown as Json,
        },
      )
      return { data: result.data ?? null, error: result.error }
    },
  })

  if (rpcResult.error) {
    if (uploadedFlyerUrl) {
      const path = uploadedFlyerUrl.split("/event-flyers/")[1]
      if (path) {
        await mutationClient.storage.from("event-flyers").remove([path])
      }
    }
    return persistFailure(
      rpcResult.error.message.replace(
        /^update_complete_event_with_seating_tx:\s*/i,
        "",
      ),
    )
  }

  const updatedId = rpcResult.data

  const admitSyncError = await syncTierAdmitCounts(eventId, formValues.tickets)
  if (admitSyncError) {
    return persistFailure(admitSyncError)
  }
  const phasesError = await syncTicketTierPhases(eventId, formValues.tickets)
  if (phasesError) return persistFailure(phasesError)
  const saleWindowError = await syncTicketSaleWindows(eventId, formValues.tickets)
  if (saleWindowError) return persistFailure(saleWindowError)
  const lineupError = await persistEventLineupIfProvided(
    eventId,
    formValues.lineup,
  )
  if (lineupError) return persistFailure(lineupError)
  const scheduleError = await persistEventSchedule(mutationClient, eventId, formValues, {
    date: event.date,
    ends_at: event.ends_at,
    schedule_days: event.schedule_days,
  })
  if (scheduleError) return persistFailure(scheduleError)
  const purchaseLimitError = await persistEventMaxTicketsPerUser(
    mutationClient,
    eventId,
    explicitPurchaseLimit(formValues.maxTicketsPerUser),
  )
  if (purchaseLimitError) {
    return persistFailure(purchaseLimitError)
  }

  const materializeError = mapActive
    ? await resyncEventSeatingUnitsAfterMapSave(mutationClient, eventId)
    : null
  if (materializeError) {
    return persistFailure(materializeError)
  }
  const seatingCapacityError = mapActive
    ? await syncTicketCapacityFromSeatingUnits(mutationClient, eventId)
    : null
  if (seatingCapacityError) return persistFailure(seatingCapacityError)
  const capacityError = await assertPersistedInventoryCapacity(
    mutationClient,
    eventId,
  )
  if (capacityError) return persistFailure(capacityError)

  await revalidatePersistedEvent(mutationClient, eventId)
  revalidatePath("/admin", "layout")
  revalidatePath("/", "layout")

  await writeSecurityAuditLog({
    actorId: userId,
    action: "event_price_update",
    entity: "event",
    entityId: eventId,
    details: {
      draftMode,
      ticketCount: formValues.tickets.length,
      prices: formValues.tickets.map((ticket) => ({
        id: ticket.id ?? null,
        price: ticket.price,
      })),
    },
  })

  return {
    success: true,
    eventId: String(updatedId ?? eventId),
    venueId,
  }
}

export type PublishEventResult =
  | { success: true; purgedTestTickets?: number; status: EventStatus }
  | {
      success: false
      error: string
      code?: AppErrorCode
      missingFields?: string[]
    }

export async function validateEventCompleteness(eventId: string) {
  if (!eventId?.trim()) {
    return { canPublish: false, missingFields: ["Evento inválido."] }
  }
  const { supabase, user } = await requireAuthenticatedUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  const reader =
    profile?.role === "super_admin" ? createAdminClient() : supabase
  return runEventPublishCheck(eventId, reader)
}

/**
 * El organizador envía el evento a auditoría (`pending_approval`).
 * No publica ni habilita cobros. Sin CUIT / DNI.
 */
export async function publishEvent(
  eventId: string,
  options: { purgeTestTickets?: boolean } = {},
): Promise<PublishEventResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", user.id)
    .maybeSingle()

  const approval = (profile as { organizer_approval_status?: string } | null)
    ?.organizer_approval_status
  const isSuperAdmin = profile?.role === "super_admin"
  const isApprovedOrganizer =
    isSuperAdmin || (profile?.role === "admin" && approval === "approved")

  if (!isApprovedOrganizer) {
    return {
      success: false,
      error: "Tu cuenta de organizador aún no está aprobada.",
    }
  }

  const reader = isSuperAdmin ? createAdminClient() : supabase
  const { data: event, error: eventError } = await reader
    .from("events")
    .select(
      "id, organizer_id, status, date, title, location, venue_id, flyer_url, image_url, schedule_days, delivery_mode, venues(id, name, location)",
    )
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) {
    return persistFailure(eventError.message)
  }

  if (!event || (event.organizer_id !== user.id && !isSuperAdmin)) {
    return { success: false, error: "No tenés permiso para publicar este evento." }
  }

  if (event.status === "published") {
    return { success: true, purgedTestTickets: 0, status: "published" }
  }

  if (event.status === "pending_approval") {
    return { success: true, purgedTestTickets: 0, status: "pending_approval" }
  }

  if (
    event.status !== "draft" &&
    event.status !== "needs_revision" &&
    event.status !== "rejected"
  ) {
    return {
      success: false,
      error: "Solo se pueden enviar a revisión los borradores o eventos con cambios pedidos.",
    }
  }

  const startsAt = new Date(event.date)
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
    return persistFailure({ code: "INVALID_EVENT_DATE" })
  }

  const mutationClient =
    event.organizer_id !== user.id ? createAdminClient() : supabase

  const completeness = await runEventPublishCheck(eventId, mutationClient)
  if (!completeness.canPublish) {
    return {
      success: false,
      error:
        completeness.missingFields.join(" ") ||
        "El evento todavía tiene datos pendientes.",
      code: "INCOMPLETE_DAY_TICKETS",
      missingFields: completeness.missingFields,
    }
  }

  let purgedTestTickets = 0
  if (options.purgeTestTickets !== false) {
    const { data: purged, error: purgeError } = await mutationClient.rpc(
      "purge_event_test_tickets",
      { p_event_id: eventId },
    )
    if (purgeError) {
      return persistFailure(purgeError.message)
    }
    purgedTestTickets = Number(purged ?? 0)
  }

  const { data: updated, error: updateError } = await mutationClient
    .from("events")
    .update({
      status: "pending_approval",
      review_note: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("organizer_id", event.organizer_id)
    .in("status", ["draft", "needs_revision", "rejected"])
    .select("id")
    .maybeSingle()

  if (updateError) {
    return persistFailure(updateError.message)
  }

  if (!updated) {
    return {
      success: false,
      error: "No se pudo enviar el evento a revisión. Recargá e intentá de nuevo.",
    }
  }

  await revalidatePersistedEvent(mutationClient, eventId)
  revalidatePath("/admin")
  revalidatePath("/superadmin/events")
  revalidatePath("/superadmin/auditoria")
  revalidatePath("/superadmin")
  revalidatePath("/superadmin/soporte")

  void notifyOrganizerEventAudit({
    eventId,
    kind: "submitted",
  })

  return { success: true, purgedTestTickets, status: "pending_approval" }
}

export type UpdateEventSalesStatusResult =
  | { success: true; status: EventStatus }
  | { success: false; error: string }

/**
 * Control de venta del organizador: publicar / pausar / volver a borrador.
 * No toca cancelled/archived/completed.
 */
export async function updateEventSalesStatus(
  eventId: string,
  nextStatus: "published" | "paused" | "draft",
): Promise<UpdateEventSalesStatusResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", user.id)
    .maybeSingle()

  const isSuper = profile?.role === "super_admin"
  const reader = isSuper ? createAdminClient() : supabase
  const { data: event, error: eventError } = await reader
    .from("events")
    .select("id, organizer_id, status")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) return persistFailure(eventError.message)
  if (!event) return { success: false, error: "Evento no encontrado." }

  const isOwner = event.organizer_id === user.id
  if (!isOwner && !isSuper) {
    return { success: false, error: "No tenés permiso para cambiar el estado." }
  }

  const mutationClient = isOwner ? supabase : createAdminClient()
  const current = event.status as EventStatus

  if (nextStatus === "published") {
    if (current === "published") {
      return { success: true, status: "published" }
    }
    if (current === "paused") {
      const { error } = await mutationClient
        .from("events")
        .update({ status: "published", updated_at: new Date().toISOString() })
        .eq("id", eventId)
      if (error) return persistFailure(error.message)
      await revalidateEventSalesPaths(mutationClient, eventId)
      return { success: true, status: "published" }
    }
    const reviewed = await publishEvent(eventId, { purgeTestTickets: true })
    if (!reviewed.success) return reviewed
    return { success: true, status: reviewed.status }
  }

  if (nextStatus === "paused") {
    if (current !== "published" && current !== "paused") {
      return {
        success: false,
        error: "Solo podés pausar un evento publicado.",
      }
    }
    const { error } = await mutationClient
      .from("events")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", eventId)
    if (error) return persistFailure(error.message)
    await revalidateEventSalesPaths(mutationClient, eventId)
    return { success: true, status: "paused" }
  }

  // draft
  if (current !== "paused" && current !== "draft" && current !== "published") {
    return {
      success: false,
      error: "No se puede pasar este evento a borrador.",
    }
  }
  const { error } = await mutationClient
    .from("events")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", eventId)
  if (error) return persistFailure(error.message)
  await revalidateEventSalesPaths(mutationClient, eventId)
  return { success: true, status: "draft" }
}

async function revalidateEventSalesPaths(
  client: SupabaseClient<Database>,
  eventId: string,
) {
  await revalidatePersistedEvent(client, eventId)
  revalidatePath("/admin", "layout")
  revalidatePath("/superadmin/events", "page")
}

export async function countEventTestTickets(
  eventId: string,
): Promise<number> {
  if (!eventId?.trim()) return 0
  const { supabase, user } = await requireAuthenticatedUser()

  const { data: event } = await supabase
    .from("events")
    .select("organizer_id")
    .eq("id", eventId)
    .maybeSingle()

  if (!event || event.organizer_id !== user.id) return 0

  const { count, error } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("is_test", true)

  if (error) return 0
  return count ?? 0
}

export async function getOrganizerPreviewShareUrl(
  eventId: string,
): Promise<
  { success: true; url: string } | { success: false; error: string }
> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  const isSuper = profile?.role === "super_admin"
  const reader = isSuper ? createAdminClient() : supabase

  const { data: event, error } = await reader
    .from("events")
    .select("id, slug, organizer_id, status, preview_key")
    .eq("id", eventId)
    .maybeSingle()

  if (error || !event) {
    return { success: false, error: "Evento no encontrado." }
  }
  if (event.organizer_id !== user.id && !isSuper) {
    return { success: false, error: "No tenés permiso para copiar este enlace." }
  }
  if (!isSandboxEventStatus(event.status)) {
    return {
      success: false,
      error: "El enlace de prueba solo está disponible antes de publicar.",
    }
  }

  const path = publicEventPreviewPath(event, event.preview_key)
  return { success: true, url: `${getSeoOrigin()}${path}` }
}

export type DeleteOrArchiveEventResult =
  | { success: true; mode: "deleted" | "cancelled" | "archived" }
  | { success: false; error: string }

/**
 * Borrado seguro:
 * - Con órdenes `paid` → bloqueado (el organizador debe pedir cancelación a soporte)
 * - Sin entradas vendidas/comprometidas → DELETE físico
 * - Con tickets no cobrados → soft delete (`cancelled`) para preservar auditoría
 */
export async function deleteOrArchiveEvent(
  eventId: string,
): Promise<DeleteOrArchiveEventResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organizer_id, status, title")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) {
    return persistFailure(eventError.message)
  }
  if (!event || event.organizer_id !== user.id) {
    return { success: false, error: "No tenés permiso sobre este evento." }
  }

  if (event.status === "cancelled") {
    return { success: false, error: "El evento ya está cancelado." }
  }

  const paidOrderCount = await countPaidOrdersForEvent(eventId)
  if (paidOrderCount > 0) {
    return {
      success: false,
      error:
        "Este evento tiene compras pagadas. Solicitá la cancelación a soporte para iniciar el reembolso.",
    }
  }

  const { count, error: countError } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("status", ["valid", "used", "scanned", "pending_payment"])

  if (countError) {
    return persistFailure(countError.message)
  }

  const ticketsSold = count ?? 0

  if (ticketsSold === 0) {
    const { error: deleteError } = await supabase
      .from("events")
      .delete()
      .eq("id", eventId)
      .eq("organizer_id", user.id)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    revalidatePath("/admin")
    revalidatePath("/admin/events")
    revalidatePath("/events")
    revalidatePath("/")
    revalidatePath("/superadmin/events")
    return { success: true, mode: "deleted" }
  }

  const { data: updated, error: updateError } = await supabase
    .from("events")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .select("id")
    .maybeSingle()

  if (updateError) {
    return persistFailure(updateError.message)
  }
  if (!updated) {
    return {
      success: false,
      error: "No se pudo cancelar el evento. Recargá e intentá de nuevo.",
    }
  }

  revalidatePath("/admin")
  revalidatePath("/admin/events")
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/events/${eventId}`)
  revalidatePath("/events")
  revalidatePath("/")
  revalidatePath("/superadmin/events")

  return { success: true, mode: "cancelled" }
}

export async function archiveEvent(
  eventId: string,
): Promise<DeleteOrArchiveEventResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organizer_id, status")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) {
    return persistFailure(eventError.message)
  }
  if (!event || event.organizer_id !== user.id) {
    return { success: false, error: "No tenés permiso sobre este evento." }
  }

  if (event.status === "archived") {
    return { success: true, mode: "archived" }
  }

  if (event.status === "cancelled") {
    return {
      success: false,
      error: "Un evento cancelado no se puede archivar.",
    }
  }

  const { count, error: countError } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("status", ["valid", "used", "scanned", "pending_payment"])

  if (countError) {
    return persistFailure(countError.message)
  }

  const paidOrderCount = await countPaidOrdersForEvent(eventId)
  if (paidOrderCount > 0) {
    return {
      success: false,
      error:
        "Este evento tiene compras pagadas. Solicitá la cancelación a soporte.",
    }
  }

  if ((count ?? 0) > 0 && event.status === "published") {
    return {
      success: false,
      error:
        "Hay entradas vendidas. Usá Eliminar para cancelar el evento y preservar la auditoría.",
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("events")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .select("id")
    .maybeSingle()

  if (updateError) {
    return persistFailure(updateError.message)
  }
  if (!updated) {
    return { success: false, error: "No se pudo archivar el evento." }
  }

  revalidatePath("/admin")
  revalidatePath("/admin/events")
  revalidatePath(`/events/${eventId}`)
  revalidatePath("/events")
  revalidatePath("/")

  return { success: true, mode: "archived" }
}

export type EventCommercialSettings = EventFeeConfig & {
  eventId: string
  title: string
}

export async function getEventCommercialSettings(
  eventId: string,
): Promise<EventCommercialSettings | null> {
  if (!eventId?.trim()) return null
  const { supabase, user } = await requireAuthenticatedUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (!isPlatformOwnerRole(profile?.role)) return null

  const admin = createAdminClient()
  const { data: event } = await admin
    .from("events")
    .select(
      "id, title, platform_fee_percentage, platform_fixed_fee, max_free_tickets, is_sponsored_by_tokepass",
    )
    .eq("id", eventId)
    .maybeSingle()

  if (!event) return null

  return {
    eventId: event.id,
    title: event.title,
    platformFeePercentage: Number(event.platform_fee_percentage ?? 8),
    platformFixedFee: Number(event.platform_fixed_fee ?? 0),
    maxFreeTickets: Number(event.max_free_tickets ?? 100),
    isSponsoredByTokePass: Boolean(event.is_sponsored_by_tokepass),
  }
}

export type UpdateEventCommercialSettingsResult =
  | { success: true; recalculatedTiers: number }
  | { success: false; error: string }

/**
 * Platform owner only (super_admin / PLATFORM_OWNER): fees, free-ticket cap,
 * TokePass sponsorship. Recomputes tier base_price / platform_fee from public
 * All-In price.
 *
 * Auth: misma fuente que `app/(superadmin)/layout.tsx` → `profiles.role === "super_admin"`.
 * Persistencia: service-role (bypass RLS de organizer). El trigger P28/P38 permite
 * mutar columnas comerciales cuando `auth.role() = 'service_role'`.
 */
export async function updateEventCommercialSettings(
  eventId: string,
  input: {
    platformFeePercentage: number
    platformFixedFee: number
    maxFreeTickets: number
    isSponsoredByTokePass: boolean
  },
): Promise<UpdateEventCommercialSettingsResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError || !isPlatformOwnerRole(profile?.role)) {
    return {
      success: false,
      error: "Solo el dueño de la plataforma puede editar estos valores.",
    }
  }

  const percentage = Number(input.platformFeePercentage)
  const fixed = Number(input.platformFixedFee)
  const maxFree = Math.floor(Number(input.maxFreeTickets))
  const sponsored = Boolean(input.isSponsoredByTokePass)

  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 95) {
    return { success: false, error: "El porcentaje debe estar entre 0 y 95." }
  }
  if (!Number.isFinite(fixed) || fixed < 0) {
    return { success: false, error: "El cargo fijo no puede ser negativo." }
  }
  if (!Number.isFinite(maxFree) || maxFree < 0) {
    return { success: false, error: "El máximo de entradas gratis es inválido." }
  }

  const feeConfig: EventFeeConfig = {
    platformFeePercentage: percentage,
    platformFixedFee: fixed,
    maxFreeTickets: maxFree,
    isSponsoredByTokePass: sponsored,
  }

  const admin = createAdminClient()

  const { error: updateError } = await admin
    .from("events")
    .update({
      platform_fee_percentage: feeConfig.platformFeePercentage,
      platform_fixed_fee: feeConfig.platformFixedFee,
      max_free_tickets: feeConfig.maxFreeTickets,
      is_sponsored_by_tokepass: feeConfig.isSponsoredByTokePass,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)

  if (updateError) {
    return persistFailure(updateError.message)
  }

  const { data: tiers, error: tiersError } = await admin
    .from("ticket_tiers")
    .select("id, price")
    .eq("event_id", eventId)

  if (tiersError) {
    return persistFailure(tiersError.message)
  }

  let recalculatedTiers = 0
  for (const tier of tiers ?? []) {
    const breakdown = allInBreakdown(
      Number(tier.price),
      eventFeeRate(feeConfig),
      eventFixedFee(feeConfig),
    )
    const { error } = await admin
      .from("ticket_tiers")
      .update({
        base_price: breakdown.basePrice,
        platform_fee: breakdown.platformFee,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tier.id)
    if (!error) recalculatedTiers += 1
  }

  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/admin/events/${eventId}/edit`)
  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/superadmin/events/${eventId}`)
  revalidatePath("/superadmin/events")
  revalidatePath("/")

  return { success: true, recalculatedTiers }
}

export async function saveVenueMapOnly(
  eventId: string,
  venueMapData: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
  const id = eventId.trim()
  if (!id) {
    return { success: false, error: "Evento inválido." }
  }

  let supabase: Awaited<ReturnType<typeof createClient>>
  let userId: string
  try {
    const session = await requireAuthenticatedUser()
    supabase = session.supabase
    userId = session.user.id
  } catch {
    return { success: false, error: "Debes iniciar sesión para guardar el mapa." }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", userId)
    .maybeSingle()

  const isSuperAdmin = isPlatformOwnerRole(profile?.role)
  const reader = isSuperAdmin ? createAdminClient() : supabase

  const { data: event, error: eventError } = await reader
    .from("events")
    .select("id, organizer_id")
    .eq("id", id)
    .maybeSingle()

  if (eventError || !event) {
    return { success: false, error: "Evento no encontrado." }
  }

  if (!isSuperAdmin) {
    const isApprovedOrganizer =
      profile?.role === "admin" &&
      profile.organizer_approval_status === "approved"
    if (!isApprovedOrganizer) {
      return {
        success: false,
        error: "Tu cuenta de organizador no está habilitada para editar eventos.",
      }
    }
    if (event.organizer_id !== userId) {
      return { success: false, error: "No tenés permiso para editar este evento." }
    }
  }

  let payload: Json
  try {
    payload = serializeVenueMap(parseVenueMap(venueMapData)) as unknown as Json
  } catch {
    return { success: false, error: "El mapa tiene un formato inválido." }
  }

  const mutationClient =
    event.organizer_id !== userId ? createAdminClient() : supabase

  const parsedMap = parseVenueMap(venueMapData)
  const seatingLayout = venueMapToSeatingLayout(parsedMap) as unknown as Json
  const now = new Date().toISOString()
  const { data: eventRow, error: eventReadError } = await mutationClient
    .from("events")
    .select("venue_id")
    .eq("id", id)
    .maybeSingle()
  if (eventReadError) {
    return { success: false, error: eventReadError.message }
  }

  const mapPatch = {
    venue_map: payload,
    has_seating_plan: true,
    updated_at: now,
  }
  const { error } = await mutationClient
    .from("events")
    .update(mapPatch as never)
    .eq("id", id)

  if (error && OPTIONAL_EVENT_FLAG_COLUMNS_RE.test(error.message)) {
    const retry = await mutationClient
      .from("events")
      .update({
        venue_map: payload,
        updated_at: now,
      } as never)
      .eq("id", id)
    if (retry.error) {
      return { success: false, error: retry.error.message }
    }
  } else if (error) {
    return { success: false, error: error.message }
  }

  if (eventRow?.venue_id) {
    const venueWrite = await mutationClient
      .from("venues")
      .update({
        venue_map: payload,
        seating_layout: seatingLayout,
        updated_at: now,
      } as never)
      .eq("id", eventRow.venue_id)
    if (venueWrite.error) {
      return { success: false, error: venueWrite.error.message }
    }
  }

  const healError = await syncMapBackedTiersAfterMapSave(
    mutationClient,
    id,
    parsedMap,
  )
  if (healError) {
    return { success: false, error: healError }
  }

  const materializeError = await materializeEventSeatingUnits(mutationClient, id)
  if (materializeError) {
    return { success: false, error: materializeError }
  }
  const capacitySyncError = await syncTicketCapacityFromSeatingUnits(
    mutationClient,
    id,
  )
  if (capacitySyncError) {
    return { success: false, error: capacitySyncError }
  }

  await revalidatePersistedEvent(mutationClient, id)
  return { success: true }
}

