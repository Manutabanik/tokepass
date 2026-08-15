import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  defaultStoryHeadlineId,
  findStoryTheme,
  storyCategoryLabel,
  storyInitials,
  storyLiquidLayers,
} from "@/lib/story-canvas"

describe("story canvas helpers", () => {
  it("prefers seating over the ticket tier for the category badge", () => {
    assert.equal(
      storyCategoryLabel({
        tierName: "Acceso general",
        seatingLabel: "Mesa 12",
        seatingSectorName: "Mesa reservada",
      }),
      "MESA RESERVADA · MESA 12",
    )
  })

  it("falls back to acceso general", () => {
    assert.equal(storyCategoryLabel({}), "ACCESO GENERAL")
  })

  it("picks a buyer headline by default", () => {
    assert.equal(defaultStoryHeadlineId("buyer"), "got-ticket")
    assert.equal(defaultStoryHeadlineId("visitor"), "see-you")
  })

  it("builds initials for the artist stamp", () => {
    assert.equal(storyInitials("Bizarrap"), "B")
    assert.equal(storyInitials("Nathy Peluso"), "NP")
  })

  it("always exposes three liquid gradient layers", () => {
    assert.equal(storyLiquidLayers(findStoryTheme("neon-purple")).length, 3)
    assert.equal(storyLiquidLayers(findStoryTheme("gradient-minimal")).length, 3)
  })
})
