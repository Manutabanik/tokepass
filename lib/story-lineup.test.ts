import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { storyLineupLabel } from "@/lib/story-canvas"

describe("story lineup label", () => {
  it("names two artists and adds y mas when the roster is longer", () => {
    assert.equal(
      storyLineupLabel(["Chaqueno Palavecino", "Lazaro Caballero"], 2),
      "Lineup: Chaqueno Palavecino, Lazaro Caballero y mas",
    )
  })

  it("joins two artists without leftover copy", () => {
    assert.equal(
      storyLineupLabel(["Ana", "Beto"], 0),
      "Lineup: Ana y Beto",
    )
  })

  it("keeps a single artist clean", () => {
    assert.equal(storyLineupLabel(["Solo"], 0), "Lineup: Solo")
  })
})
