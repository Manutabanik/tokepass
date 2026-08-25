import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  DRAFT_LEAVE_GUARD_MESSAGE,
  OFFLINE_SAVE_LABEL,
  draftSaveBadge,
  isInAppLeaveNavigation,
  publishedEventPublicPath,
  salesDashboardPath,
  shouldBlockDraftLeave,
} from "./editor-v2-ux"

describe("shouldBlockDraftLeave", () => {
  it("blocks only while the draft JSON is syncing or publishing", () => {
    assert.equal(shouldBlockDraftLeave("saving"), true)
    assert.equal(shouldBlockDraftLeave("saved", true), true)
    assert.equal(shouldBlockDraftLeave("saved"), false)
    assert.equal(shouldBlockDraftLeave("offline"), false)
    assert.equal(shouldBlockDraftLeave("idle"), false)
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
