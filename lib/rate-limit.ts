import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

/**
 * Internal rate limit via Postgres `consume_rate_limit`.
 * Returns true if the request is allowed.
 */
export async function consumeRateLimit(input: {
  bucketKey: string
  limit: number
  windowSeconds: number
  /** Prefer admin for anon public endpoints so RLS never blocks the bucket write. */
  useAdmin?: boolean
}): Promise<boolean> {
  const client = input.useAdmin
    ? createAdminClient()
    : await createClient()

  const { data, error } = await client.rpc("consume_rate_limit", {
    p_bucket_key: input.bucketKey,
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds,
  })

  if (error) {
    logger.error({
      context: "lib/rate-limit",
      message: "consume_rate_limit_failed",
      error: error.message,
      bucketKey: input.bucketKey,
    })
    // Fail closed for abuse-sensitive public endpoints when using admin.
    return !input.useAdmin
  }

  return Boolean(data)
}

export async function isRateLimited(input: {
  bucketKey: string
  limit: number
  windowSeconds: number
}): Promise<boolean> {
  const client = createAdminClient()
  const { data, error } = await client.rpc("is_rate_limited", {
    p_bucket_key: input.bucketKey,
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds,
  })

  if (error) {
    logger.error({
      context: "lib/rate-limit",
      message: "is_rate_limited_failed",
      error: error.message,
      bucketKey: input.bucketKey,
    })
    return false
  }

  return Boolean(data)
}
