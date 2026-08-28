"use server"

import { buildCheckoutGuestAuthInput } from "@/lib/checkout/guest-credentials"
import { logger } from "@/lib/logger"
import { getRequestIp } from "@/lib/request-ip"
import { consumeNamedRateLimit } from "@/lib/security/distributed-rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export async function ensureGuestCheckoutSessionAction(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) return true

  const ip = await getRequestIp()
  const allowed = await consumeNamedRateLimit("checkoutIp", ip)
  if (!allowed) return false

  const { email, password } = buildCheckoutGuestAuthInput()

  try {
    const admin = createAdminClient()
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { checkout_guest: true },
      app_metadata: { identity: "buyer", checkout_guest: true },
    })
    if (createError) {
      logger.error({
        context: "checkout/guest-session",
        message: "guest_user_create_failed",
        error: createError.message,
      })
      return false
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (signInError) {
      logger.error({
        context: "checkout/guest-session",
        message: "guest_user_signin_failed",
        error: signInError.message,
      })
      return false
    }

    return true
  } catch (error) {
    logger.error({
      context: "checkout/guest-session",
      message: "guest_session_unhandled",
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
