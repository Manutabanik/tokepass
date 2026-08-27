import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyVenueMap } from "@/types/venue-map"
import type { EventDetails } from "@/app/actions/public-events"

import {
  applyEventCatalogRow,
  applyTicketTierCatalogRow,
  ticketSelectorPatchFromRow,
} from "./event-catalog-realtime"

function sampleEvent(): EventDetails {
  return {
    id: "evt-1",
    slug: "fiesta",
    title: "Fiesta",
    description: "Noche",
    date: "2026-09-01T00:00:00.000Z",
    endsAt: null,
    location: "CABA",
    deliveryMode: "PRESENCIAL",
    imageUrl: null,
    socialShareImageUrl: null,
    status: "published",
    visibility: "public",
    scheduleDays: [],
    serviceChargeRate: 0.15,
    platformFixedFee: 0,
    isSponsoredByTokePass: false,
    maxFreeTickets: 0,
    organizerId: "org-1",
    organizerName: "Org",
    organizerBio: null,
    organizerAvatarUrl: null,
    venue: {
      id: "venue-1",
      name: "Club",
      location: "CABA",
      address: null,
      city: "CABA",
      capacity: 200,
      max_capacity: 200,
      seating_background_url: null,
      latitude: null,
      longitude: null,
      seating_layout: [],
      venue_map: emptyVenueMap(),
    },
    hasInteractiveMap: false,
    seatingMaps: [],
    seatingUnits: [],
    seatingSectorSummaries: [],
    zoneTierPricing: [
      {
        sectorKey: "vip",
        ticketTierId: "tier-1",
        price: 10000,
        tableNumberStart: null,
        tableNumberEnd: null,
      },
    ],
    comboItemsByTier: {},
    tiers: [
      {
        id: "tier-1",
        name: "General",
        price: 10000,
        capacity: 100,
        sold: 20,
        time_limit: null,
        bonus_reward: null,
        day_id: null,
        visibility: "public",
        layout_type: "general",
        seating_sector_id: null,
        capacity_per_unit: 1,
        category: "standard",
        list_price: null,
        tier_type: "general",
        ticket_type: "standard",
        bundle_items: [],
        bundle_type: null,
        description: null,
        highlight_badge: null,
        sale_starts_at: null,
        sale_ends_at: null,
        available: 80,
        phases: [],
      },
    ],
    defaultTicketTab: "auto",
    maxTicketsPerUser: null,
    pixels: {
      metaPixelId: null,
      metaPixelEnabled: false,
      tiktokPixelId: null,
      tiktokPixelEnabled: false,
      ga4MeasurementId: null,
      ga4Enabled: false,
    },
    promoVideoUrl: null,
    galleryUrls: [],
    lineup: { artists: [], slots: [] },
    sponsors: [],
    categoryId: null,
    createdAt: null,
    isDraftPreview: false,
    acceptsMercadoPago: true,
    acceptsPosPayments: true,
    refundPolicy: "organizer",
    restrictions: null,
    whatToBring: null,
  }
}

describe("event-catalog-realtime", () => {
  it("aplica precio, aforo y available desde ticket_tiers", () => {
    const next = applyTicketTierCatalogRow(sampleEvent(), "UPDATE", {
      id: "tier-1",
      price: 12500,
      capacity: 90,
      sold: 40,
    })
    assert.equal(next.tiers[0]?.price, 12500)
    assert.equal(next.tiers[0]?.capacity, 90)
    assert.equal(next.tiers[0]?.sold, 40)
    assert.equal(next.tiers[0]?.available, 50)
    assert.equal(next.zoneTierPricing[0]?.price, 12500)
  })

  it("saca la tarifa eliminada del catalogo", () => {
    const next = applyTicketTierCatalogRow(sampleEvent(), "DELETE", {
      id: "tier-1",
    })
    assert.equal(next.tiers.length, 0)
    assert.equal(next.zoneTierPricing.length, 0)
  })

  it("actualiza fecha, flyer y saca tarifas privadas", () => {
    const dated = applyEventCatalogRow(sampleEvent(), {
      date: "2026-10-12T20:00:00.000Z",
      flyer_url: "https://cdn.example/flyer-new.jpg",
    })
    assert.equal(dated.date, "2026-10-12T20:00:00.000Z")
    assert.equal(dated.imageUrl, "https://cdn.example/flyer-new.jpg")

    const hidden = applyTicketTierCatalogRow(sampleEvent(), "UPDATE", {
      id: "tier-1",
      visibility: "private",
    })
    assert.equal(hidden.tiers.length, 0)
  })

  it("aplica medios de cobro y politica de devolucion", () => {
    const next = applyEventCatalogRow(sampleEvent(), {
      accepts_mercado_pago: false,
      accepts_pos_payments: false,
      refund_policy: "no_refunds",
    })
    assert.equal(next.acceptsMercadoPago, false)
    assert.equal(next.acceptsPosPayments, false)
    assert.equal(next.refundPolicy, "no_refunds")
  })

  it("actualiza titulo y venue_map del evento", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zona-a",
        name: "VIP",
        color: "#22d3ee",
        price: 0,
        polygon: [
          { x: 10, y: 10 },
          { x: 40, y: 10 },
          { x: 40, y: 40 },
          { x: 10, y: 40 },
        ],
        layoutType: "table_combo",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 4,
        capacity: 4,
        labelPrefix: "Mesa ",
      },
    ]
    const next = applyEventCatalogRow(sampleEvent(), {
      title: "Fiesta VIP",
      venue_map: map,
    })
    assert.equal(next.title, "Fiesta VIP")
    assert.equal(next.venue?.venue_map.zones[0]?.id, "zona-a")
  })

  it("arma el patch del selector de tickets", () => {
    const patch = ticketSelectorPatchFromRow({
      id: "tier-1",
      price: 8000,
      capacity: 10,
      sold: 3,
    })
    assert.equal(patch?.price, 8000)
    assert.equal(patch?.available, 7)
    const inactive = ticketSelectorPatchFromRow({
      id: "tier-2",
      visibility: "private",
      capacity: 10,
      sold: 1,
    })
    assert.equal(inactive?.isActive, false)
    assert.equal(inactive?.available, 0)
  })
})
