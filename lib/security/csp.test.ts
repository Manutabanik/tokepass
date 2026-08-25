import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildContentSecurityPolicy } from "./csp"

describe("buildContentSecurityPolicy", () => {
  it("allows Vercel SSO to load the PWA manifest on hosted deploys", () => {
    const previousVercel = process.env.VERCEL
    const previousEnv = process.env.VERCEL_ENV
    process.env.VERCEL = "1"
    process.env.VERCEL_ENV = "production"
    try {
      const policy = buildContentSecurityPolicy("test-nonce")
      assert.match(policy, /manifest-src 'self' https:\/\/vercel.com/)
    } finally {
      if (previousVercel == null) delete process.env.VERCEL
      else process.env.VERCEL = previousVercel
      if (previousEnv == null) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previousEnv
    }
  })

  it("keeps manifest-src same-origin off Vercel", () => {
    const previousVercel = process.env.VERCEL
    const previousEnv = process.env.VERCEL_ENV
    delete process.env.VERCEL
    delete process.env.VERCEL_ENV
    try {
      const policy = buildContentSecurityPolicy("test-nonce")
      assert.match(policy, /manifest-src 'self'/)
      assert.doesNotMatch(policy, /manifest-src 'self' https:\/\/vercel.com/)
    } finally {
      if (previousVercel == null) delete process.env.VERCEL
      else process.env.VERCEL = previousVercel
      if (previousEnv == null) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previousEnv
    }
  })
})
