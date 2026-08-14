import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isEventUuid } from "./site"
import {
  decodeEventParam,
  eventSlugSuffix,
  uuidPrefixFromSlugSuffix,
} from "./event-slug"

describe("event-slug", () => {
  it("decodes and trims URL params", () => {
    assert.equal(
      decodeEventParam("  fiesta-nacional-de-la-tradicion-a81c76e1  "),
      "fiesta-nacional-de-la-tradicion-a81c76e1",
    )
  })

  it("extracts the 8-char uuid prefix from generated slugs", () => {
    assert.equal(
      eventSlugSuffix("fiesta-nacional-de-la-tradicion-a81c76e1"),
      "a81c76e1",
    )
    assert.equal(
      uuidPrefixFromSlugSuffix("a81c76e1"),
      "a81c76e1-%",
    )
  })

  it("detects full event uuids", () => {
    assert.equal(
      isEventUuid("a81c76e1-1234-4111-8111-1234567890ab"),
      true,
    )
    assert.equal(isEventUuid("fiesta-nacional-de-la-tradicion-a81c76e1"), false)
  })
})
