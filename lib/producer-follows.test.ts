import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isProducerFollowAuthError,
  PRODUCER_FOLLOW_AUTH_REQUIRED,
} from "./producer-follows"

describe("producer follow auth error", () => {
  it("detects the login signal from the server action", () => {
    assert.equal(
      isProducerFollowAuthError(new Error(PRODUCER_FOLLOW_AUTH_REQUIRED)),
      true,
    )
    assert.equal(isProducerFollowAuthError(new Error("otra cosa")), false)
  })
})
