import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isBotProtectedCheckoutRequest,
  requestIpFromHeaders,
} from "./edge-checkout-rate-limit"

function request(input: {
  method: string
  pathname: string
  headers?: Record<string, string>
}) {
  const headers = new Headers(input.headers)
  return {
    method: input.method,
    headers,
    nextUrl: {
      pathname: input.pathname,
      origin: "https://tokepass.test",
    },
  }
}

describe("edge checkout bot protection", () => {
  it("rate-limits checkout Server Actions and the scan API", () => {
    assert.equal(
      isBotProtectedCheckoutRequest(
        request({
          method: "POST",
          pathname: "/eventos/fiesta/checkout",
          headers: { "next-action": "holdSeat" },
        }),
      ),
      true,
    )
    assert.equal(
      isBotProtectedCheckoutRequest(
        request({
          method: "POST",
          pathname: "/api/scanner/scan",
        }),
      ),
      true,
    )
  })

  it("does not wrap public GETs or unrelated POSTs", () => {
    assert.equal(
      isBotProtectedCheckoutRequest(
        request({ method: "GET", pathname: "/eventos/fiesta" }),
      ),
      false,
    )
    assert.equal(
      isBotProtectedCheckoutRequest(
        request({
          method: "POST",
          pathname: "/admin/eventos",
          headers: { "next-action": "save" },
        }),
      ),
      false,
    )
  })

  it("prefers the Vercel forwarded client IP", () => {
    assert.equal(
      requestIpFromHeaders(
        new Headers({
          "x-vercel-forwarded-for": "203.0.113.10, 10.0.0.1",
          "x-real-ip": "10.0.0.1",
        }),
      ),
      "203.0.113.10",
    )
  })
})
