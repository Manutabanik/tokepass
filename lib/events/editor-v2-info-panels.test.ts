import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  infoLocationErrorsOpenLogistics,
  infoSuperPanelForFieldPath,
  resolveInfoSuperPanel,
} from "./editor-v2-info-panels"

describe("infoSuperPanelForFieldPath", () => {
  it("keeps identity fields on the first panel", () => {
    assert.equal(infoSuperPanelForFieldPath("basicInfo.name"), "identity")
    assert.equal(infoSuperPanelForFieldPath(["flyerUrl"]), "identity")
    assert.equal(infoSuperPanelForFieldPath("lineup.0.name"), "identity")
    assert.equal(infoSuperPanelForFieldPath("archetype"), "identity")
  })

  it("routes dates, venue and virtual fields to logistics", () => {
    assert.equal(infoSuperPanelForFieldPath("location.venueName"), "logistics")
    assert.equal(infoSuperPanelForFieldPath(["location", "address"]), "logistics")
    assert.equal(infoSuperPanelForFieldPath("basicInfo.locationName"), "logistics")
    assert.equal(infoSuperPanelForFieldPath(["schedule", 0, "startDate"]), "logistics")
    assert.equal(infoSuperPanelForFieldPath("virtualLink"), "logistics")
    assert.equal(infoSuperPanelForFieldPath("isVirtual"), "logistics")
  })
})

describe("resolveInfoSuperPanel", () => {
  it("opens logistics when location has form errors", () => {
    assert.equal(
      infoLocationErrorsOpenLogistics({
        location: { venueName: { type: "manual", message: "Falta el lugar" } },
      }),
      true,
    )
    assert.equal(
      resolveInfoSuperPanel({
        location: { address: { type: "manual", message: "Falta la dirección" } },
      }),
      "logistics",
    )
  })

  it("prefers the field that publish asked to reveal", () => {
    assert.equal(
      resolveInfoSuperPanel(
        {
          location: { venueName: { type: "manual", message: "Falta el lugar" } },
        },
        "basicInfo.name",
      ),
      "identity",
    )
    assert.equal(
      resolveInfoSuperPanel(
        {
          basicInfo: { name: { type: "manual", message: "Falta el nombre" } },
        },
        "location.venueName",
      ),
      "logistics",
    )
  })
})
