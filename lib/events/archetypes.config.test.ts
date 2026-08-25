import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  ARCHETYPES,
  archetypeSupportsVirtual,
  getArchetypeConfig,
  resolveDraftArchetype,
} from "./archetypes.config"

describe("resolveDraftArchetype", () => {
  it("falls back to show and keeps a known id", () => {
    assert.equal(resolveDraftArchetype(undefined), "show")
    assert.equal(resolveDraftArchetype("course"), "course")
    assert.equal(resolveDraftArchetype("unknown"), "show")
  })
})

describe("archetypeSupportsVirtual", () => {
  it("allows virtual mode only for shows and courses", () => {
    assert.equal(archetypeSupportsVirtual("show"), true)
    assert.equal(archetypeSupportsVirtual("course"), true)
    assert.equal(archetypeSupportsVirtual("experience"), false)
    assert.equal(archetypeSupportsVirtual("sport"), false)
  })
})

describe("ARCHETYPES dictionary", () => {
  it("exposes labels for every archetype", () => {
    assert.equal(ARCHETYPES.show.labels.capacity, "Aforo del recinto")
    assert.equal(getArchetypeConfig("experience").labels.venue, "Punto de encuentro")
    assert.equal(getArchetypeConfig("course").labels.tickets, "Inscripciones")
    assert.equal(getArchetypeConfig("sport").labels.participants, "Equipos / Atletas")
  })
})
