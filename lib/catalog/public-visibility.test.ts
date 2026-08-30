import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyEventDraftV2 } from "@/lib/validations/event-draft-v2"

import {
  catalogVisibilityFromDraft,
  overlayDraftCatalogVisibility,
  PRIVATE_CATALOG_VISIBILITY,
  PUBLIC_CATALOG_VISIBILITY,
} from "./public-visibility"

describe("catalogVisibilityFromDraft", () => {
  it("maps settings.isPublic onto events.visibility", () => {
    assert.equal(catalogVisibilityFromDraft(true), PUBLIC_CATALOG_VISIBILITY)
    assert.equal(catalogVisibilityFromDraft(undefined), PUBLIC_CATALOG_VISIBILITY)
    assert.equal(catalogVisibilityFromDraft(false), PRIVATE_CATALOG_VISIBILITY)
  })
})

describe("overlayDraftCatalogVisibility", () => {
  it("writes isPublic only when the draft drifted", () => {
    const draft = emptyEventDraftV2()
    assert.equal(draft.settings.isPublic, true)
    const same = overlayDraftCatalogVisibility(draft, true)
    assert.equal(same.changed, false)
    const hidden = overlayDraftCatalogVisibility(draft, false)
    assert.equal(hidden.changed, true)
    assert.equal(hidden.draft.settings.isPublic, false)
  })
})
