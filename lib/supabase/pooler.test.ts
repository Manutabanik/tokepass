import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  TRANSACTIONAL_POOLER_PORT,
  isTransactionalPoolerUrl,
  resolvePooledDatabaseUrl,
} from "./pooler"

describe("supabase transactional pooler", () => {
  it("rewrites a direct 5432 URL to Supavisor 6543", () => {
    const pooled = resolvePooledDatabaseUrl(
      "postgresql://postgres.abc:secret@db.abc.supabase.co:5432/postgres",
    )
    assert.ok(pooled)
    const url = new URL(pooled)
    assert.equal(url.port, String(TRANSACTIONAL_POOLER_PORT))
    assert.equal(url.searchParams.get("pgbouncer"), "true")
    assert.equal(isTransactionalPoolerUrl(pooled), true)
  })

  it("keeps an already pooled URL and does not invent a DSN", () => {
    const raw =
      "postgresql://postgres.abc:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
    const pooled = resolvePooledDatabaseUrl(raw)
    assert.ok(pooled)
    assert.equal(new URL(pooled).port, "6543")
    assert.equal(resolvePooledDatabaseUrl(""), null)
    assert.equal(isTransactionalPoolerUrl("not-a-url"), false)
  })
})
