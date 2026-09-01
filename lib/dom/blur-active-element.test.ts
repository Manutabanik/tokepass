import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  nodeHidesActiveDescendant,
  releaseHiddenFocusAncestorLike,
  releaseTakeoverLockLike,
  type InertLikeNode,
} from "./blur-active-element"

function fakeNode(
  attrs: Record<string, string | undefined> = {},
  options?: { containsActive?: boolean; inert?: boolean },
): InertLikeNode {
  const store = { ...attrs }
  return {
    contains() {
      return options?.containsActive ?? true
    },
    getAttribute(name) {
      return store[name] ?? null
    },
    hasAttribute(name) {
      return name in store
    },
    removeAttribute(name) {
      delete store[name]
    },
    inert: options?.inert ?? false,
  }
}

describe("blur-active-element", () => {
  it("detects a hidden ancestor that still holds focus", () => {
    const node = fakeNode({ "aria-hidden": "true", "data-base-ui-inert": "" })
    assert.equal(nodeHidesActiveDescendant(node, {}), true)
    assert.equal(nodeHidesActiveDescendant(node, null), false)
    assert.equal(
      nodeHidesActiveDescendant(
        fakeNode({ "aria-hidden": "true" }, { containsActive: false }),
        {},
      ),
      false,
    )
  })

  it("strips aria-hidden and Base UI inert while a descendant keeps focus", () => {
    const node = fakeNode(
      { "aria-hidden": "true", "data-base-ui-inert": "", inert: "" },
      { inert: true },
    )
    assert.equal(releaseHiddenFocusAncestorLike(node, {}), true)
    assert.equal(node.getAttribute("aria-hidden"), null)
    assert.equal(node.hasAttribute("data-base-ui-inert"), false)
    assert.equal(node.inert, false)
  })

  it("leaves a hidden ancestor alone when focus is outside", () => {
    const node = fakeNode(
      { "aria-hidden": "true" },
      { containsActive: false },
    )
    assert.equal(releaseHiddenFocusAncestorLike(node, {}), false)
    assert.equal(node.getAttribute("aria-hidden"), "true")
  })

  it("always unlocks the studio takeover so the bottom bar stays clickable", () => {
    const node = fakeNode(
      { "aria-hidden": "true", "data-base-ui-inert": "" },
      { containsActive: false, inert: true },
    )
    assert.equal(releaseTakeoverLockLike(node), true)
    assert.equal(node.getAttribute("aria-hidden"), null)
    assert.equal(node.hasAttribute("data-base-ui-inert"), false)
    assert.equal(node.inert, false)
  })
})
