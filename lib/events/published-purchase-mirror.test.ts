import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyEventDraftV2 } from "@/lib/validations/event-draft-v2"

import {
  nextMirroredAccessLink,
  nextMirroredCatalogVisibility,
  preservePublishedEventVisibility,
} from "./published-purchase-mirror"

describe("nextMirroredAccessLink", () => {
  it("writes the draft stream URL while the event stays online", () => {
    const draft = {
      ...emptyEventDraftV2(),
      isVirtual: true,
      virtualLink: "https://meet.example/aula",
      settings: {
        ...emptyEventDraftV2().settings,
        deliveryMode: "ONLINE" as const,
      },
    }
    assert.equal(
      nextMirroredAccessLink({
        draft,
        liveAccessLink: "https://old.example/sala",
      }),
      "https://meet.example/aula",
    )
  })

  it("keeps the live stream URL if the draft flips to presencial", () => {
    const draft = {
      ...emptyEventDraftV2(),
      isVirtual: false,
      virtualLink: "",
      settings: {
        ...emptyEventDraftV2().settings,
        deliveryMode: "PRESENCIAL" as const,
      },
    }
    assert.equal(
      nextMirroredAccessLink({
        draft,
        liveAccessLink: "https://meet.example/aula",
      }),
      "https://meet.example/aula",
    )
  })

  it("clears the live link only when the online draft is empty", () => {
    const draft = {
      ...emptyEventDraftV2(),
      isVirtual: true,
      virtualLink: "   ",
      settings: {
        ...emptyEventDraftV2().settings,
        deliveryMode: "ONLINE" as const,
      },
    }
    assert.equal(
      nextMirroredAccessLink({
        draft,
        liveAccessLink: "https://meet.example/aula",
      }),
      null,
    )
  })
})

describe("nextMirroredCatalogVisibility", () => {
  it("hides a listed event when the organizer turns the catalog off", () => {
    assert.equal(
      nextMirroredCatalogVisibility({
        liveVisibility: "public",
        isPublic: false,
      }),
      "private",
    )
  })

  it("does not list a private or guest-list event from a stale isPublic default", () => {
    assert.equal(
      nextMirroredCatalogVisibility({
        liveVisibility: "private",
        isPublic: true,
      }),
      null,
    )
    assert.equal(
      nextMirroredCatalogVisibility({
        liveVisibility: "guest_list_only",
        isPublic: true,
      }),
      null,
    )
    assert.equal(
      nextMirroredCatalogVisibility({
        liveVisibility: "guest_list_only",
        isPublic: false,
      }),
      null,
    )
  })

  it("is a no-op when the live listing already matches", () => {
    assert.equal(
      nextMirroredCatalogVisibility({
        liveVisibility: "public",
        isPublic: true,
      }),
      null,
    )
    assert.equal(
      nextMirroredCatalogVisibility({
        liveVisibility: "private",
        isPublic: false,
      }),
      null,
    )
  })
})

describe("preservePublishedEventVisibility", () => {
  it("keeps guest_list_only when the organizer republishes from V2", () => {
    assert.equal(
      preservePublishedEventVisibility("guest_list_only", "public"),
      "guest_list_only",
    )
    assert.equal(
      preservePublishedEventVisibility("guest_list_only", "private"),
      "guest_list_only",
    )
    assert.equal(
      preservePublishedEventVisibility("public", "private"),
      "private",
    )
  })
})
