import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { includeStoryCaptureNode } from "@/lib/story-flyer-share"

describe("story capture node filter", () => {
  it("keeps nodes that cannot call closest", () => {
    assert.equal(includeStoryCaptureNode(null), true)
    assert.equal(includeStoryCaptureNode("text"), true)
    assert.equal(includeStoryCaptureNode({ closest: "nope" }), true)
    assert.equal(includeStoryCaptureNode({ target: {} }), true)
  })

  it("excludes action bars when closest is available", () => {
    const node = {
      closest(selector: string) {
        return selector === "[data-story-actions]" ? {} : null
      },
    }
    assert.equal(includeStoryCaptureNode(node), false)
    assert.equal(
      includeStoryCaptureNode({
        closest() {
          return null
        },
      }),
      true,
    )
  })
})
