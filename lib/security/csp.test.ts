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
      assert.doesNotMatch(policy, /vercel\.live/)
    } finally {
      if (previousVercel == null) delete process.env.VERCEL
      else process.env.VERCEL = previousVercel
      if (previousEnv == null) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previousEnv
    }
  })

  it("allows Vercel Live toolbar sources on preview deploys", () => {
    const previousVercel = process.env.VERCEL
    const previousEnv = process.env.VERCEL_ENV
    process.env.VERCEL = "1"
    process.env.VERCEL_ENV = "preview"
    try {
      const policy = buildContentSecurityPolicy("test-nonce")
      assert.match(policy, /script-src[^;]*https:\/\/vercel\.live/)
      assert.match(policy, /connect-src[^;]*https:\/\/vercel\.live/)
      assert.match(policy, /connect-src[^;]*wss:\/\/ws-us3\.pusher\.com/)
      assert.match(policy, /img-src[^;]*https:\/\/vercel\.live/)
      assert.match(policy, /frame-src[^;]*https:\/\/vercel\.live/)
      assert.match(policy, /style-src[^;]*https:\/\/vercel\.live/)
      assert.match(policy, /font-src[^;]*https:\/\/vercel\.live https:\/\/assets\.vercel\.com/)
    } finally {
      if (previousVercel == null) delete process.env.VERCEL
      else process.env.VERCEL = previousVercel
      if (previousEnv == null) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previousEnv
    }
  })

  it("keeps Vercel Live off production CSP", () => {
    const previousVercel = process.env.VERCEL
    const previousEnv = process.env.VERCEL_ENV
    process.env.VERCEL = "1"
    process.env.VERCEL_ENV = "production"
    try {
      const policy = buildContentSecurityPolicy("test-nonce")
      assert.doesNotMatch(policy, /vercel\.live/)
      assert.match(policy, /manifest-src 'self' https:\/\/vercel.com/)
    } finally {
      if (previousVercel == null) delete process.env.VERCEL
      else process.env.VERCEL = previousVercel
      if (previousEnv == null) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previousEnv
    }
  })
})
