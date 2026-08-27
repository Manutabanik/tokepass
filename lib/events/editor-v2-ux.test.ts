import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  DRAFT_LEAVE_GUARD_MESSAGE,
  DRAFT_SAVE_TIMEOUT_MESSAGE,
  DraftPersistTimeoutError,
  EDITOR_V2_AUTOSAVE_MAX_MS,
  EDITOR_V2_AUTOSAVE_MIN_MS,
  EDITOR_V2_AUTOSAVE_MS,
  EDITOR_V2_AUTOSAVE_TIMEOUT_MS,
  OFFLINE_SAVE_LABEL,
  draftInventoryDrifted,
  draftSaveBadge,
  isDraftPersistTimeoutError,
  isInAppLeaveNavigation,
  publishedEventPublicPath,
  salesDashboardPath,
  shouldBlockDraftLeave,
  withDraftPersistTimeout,
} from "./editor-v2-ux"

describe("editor v2 autosave window", () => {
  it("keeps the draft JSON debounce inside 1500-2000ms", () => {
    assert.ok(EDITOR_V2_AUTOSAVE_MS >= EDITOR_V2_AUTOSAVE_MIN_MS)
    assert.ok(EDITOR_V2_AUTOSAVE_MS <= EDITOR_V2_AUTOSAVE_MAX_MS)
  })

  it("caps a hung persist at 10 seconds", () => {
    assert.equal(EDITOR_V2_AUTOSAVE_TIMEOUT_MS, 10_000)
  })
})

describe("withDraftPersistTimeout", () => {
  it("rejects a promise that never settles", async () => {
    await assert.rejects(
      () => withDraftPersistTimeout(new Promise(() => {}), 20),
      (error: unknown) => {
        assert.equal(isDraftPersistTimeoutError(error), true)
        assert.equal(
          error instanceof DraftPersistTimeoutError && error.message,
          DRAFT_SAVE_TIMEOUT_MESSAGE,
        )
        return true
      },
    )
  })

  it("returns the persist result when it finishes in time", async () => {
    const result = await withDraftPersistTimeout(
      Promise.resolve({ success: true as const }),
      50,
    )
    assert.deepEqual(result, { success: true })
  })
})

describe("shouldBlockDraftLeave", () => {
  it("blocks only dirty or in-flight autosave, never an intentional submit", () => {
    assert.equal(shouldBlockDraftLeave("saving"), true)
    assert.equal(
      shouldBlockDraftLeave("saving", { isSubmitting: true }),
      false,
    )
    assert.equal(shouldBlockDraftLeave("saved", { isDirty: true }), true)
    assert.equal(
      shouldBlockDraftLeave("saved", { isDirty: true, isSubmitting: true }),
      false,
    )
    assert.equal(
      shouldBlockDraftLeave("saved", { isDirty: true, allowLeave: true }),
      false,
    )
    assert.equal(shouldBlockDraftLeave("saved"), false)
    assert.equal(shouldBlockDraftLeave("offline"), false)
    assert.equal(shouldBlockDraftLeave("offline", { isDirty: true }), true)
    assert.equal(shouldBlockDraftLeave("idle"), false)
    assert.equal(shouldBlockDraftLeave("error"), false)
    assert.equal(shouldBlockDraftLeave("error", { isDirty: true }), true)
  })
})

describe("draftInventoryDrifted", () => {
  it("detects when persist rematched or converted ticket identities", () => {
    const current = {
      tickets: [
        {
          id: "map:vip",
          source: "map",
          sectorId: "vip",
          layoutType: "table_combo",
          slotId: "",
        },
      ],
      extras: [],
    }
    const saved = {
      tickets: [
        {
          id: "550e8400-e29b-41d4-a716-446655440099",
          source: "map",
          sectorId: "vip",
          layoutType: "table_combo",
          slotId: "",
        },
      ],
      extras: [],
    }
    assert.equal(draftInventoryDrifted(current, saved), true)
    assert.equal(draftInventoryDrifted(saved, saved), false)
  })
})

describe("draftSaveBadge", () => {
  it("shows the offline warning instead of Guardado", () => {
    assert.deepEqual(draftSaveBadge(false, "saved"), {
      label: OFFLINE_SAVE_LABEL,
      tone: "offline",
    })
    assert.equal(draftSaveBadge(true, "saving").label, "Guardando...")
    assert.equal(draftSaveBadge(true, "saved").label, "Guardado")
    assert.equal(draftSaveBadge(true, "error").label, "Error al guardar")
  })
})

describe("published event links", () => {
  it("builds catalog and sales paths", () => {
    assert.equal(
      publishedEventPublicPath("evt-1", "fiesta-nacional"),
      "/eventos/fiesta-nacional",
    )
    assert.equal(publishedEventPublicPath("evt-1"), "/eventos/evt-1")
    assert.equal(salesDashboardPath("evt-1"), "/admin/events/evt-1")
  })
})

describe("isInAppLeaveNavigation", () => {
  const current = "http://localhost:3000/admin/events/evt-1/edit"

  it("intercepts same-origin Next.js links", () => {
    assert.equal(
      isInAppLeaveNavigation({
        currentHref: current,
        nextHref: "/admin/events",
      }),
      true,
    )
  })

  it("ignores modified clicks, new tabs and same-page anchors", () => {
    assert.equal(
      isInAppLeaveNavigation({
        currentHref: current,
        nextHref: "/admin/events",
        modified: true,
      }),
      false,
    )
    assert.equal(
      isInAppLeaveNavigation({
        currentHref: current,
        nextHref: "/eventos/fiesta",
        targetBlank: true,
      }),
      false,
    )
    assert.equal(
      isInAppLeaveNavigation({
        currentHref: current,
        nextHref: `${current}#checklist`,
      }),
      false,
    )
  })
})

describe("leave copy", () => {
  it("keeps a clear warning while the JSON is syncing", () => {
    assert.match(DRAFT_LEAVE_GUARD_MESSAGE, /guardado en curso/i)
  })
})
