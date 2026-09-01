import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

import {
  getFreshLoginProfile,
  resolveAuthCallbackDestination,
  safeInternalNextPath,
} from "@/lib/auth/post-login"
import {
  createWalletDeviceId,
  normalizeWalletDeviceId,
  resolveIncomingWalletDeviceId,
  WALLET_DEVICE_COOKIE,
  walletDeviceCookieOptions,
} from "@/lib/auth/wallet-device"
import { logger } from "@/lib/logger"
import type { UserRole } from "@/types/database"
import type { Database } from "@/types/database"

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
])

function createCallbackClient(request: NextRequest, response: NextResponse) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )
}

function redirectUrl(request: NextRequest, path: string) {
  const forwardedHost = request.headers.get("x-forwarded-host")
  const origin = request.nextUrl.origin
  if (process.env.NODE_ENV !== "development" && forwardedHost) {
    return new URL(path, `https://${forwardedHost}`)
  }
  return new URL(path, origin)
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value, cookie)
  })
  return to
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const otpType = request.nextUrl.searchParams.get("type")
  const next = safeInternalNextPath(request.nextUrl.searchParams.get("next"))
  const oauthError =
    request.nextUrl.searchParams.get("error_description") ??
    request.nextUrl.searchParams.get("error")

  const cookieJar = NextResponse.next()
  const supabase = createCallbackClient(request, cookieJar)

  let exchanged = false

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    exchanged = !error
    if (error) {
      logger.error({
        context: "auth/callback",
        message: "exchange_code_failed",
        error,
      })
    }
  } else if (
    tokenHash &&
    otpType &&
    EMAIL_OTP_TYPES.has(otpType as EmailOtpType)
  ) {
    const { error } = await supabase.auth.verifyOtp({
      type: otpType as EmailOtpType,
      token_hash: tokenHash,
    })
    exchanged = !error
    if (error) {
      logger.error({
        context: "auth/callback",
        message: "verify_otp_failed",
        error,
      })
    }
  }

  if (exchanged) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      let role: UserRole | null = null
      try {
        const profile = await getFreshLoginProfile(user.id)
        role = profile?.role ?? null
      } catch (profileError) {
        logger.error({
          context: "auth/callback",
          message: "fresh_profile_lookup_failed",
          userId: user.id,
          error: profileError,
        })
      }

      const cookieDeviceId = normalizeWalletDeviceId(
        request.cookies.get(WALLET_DEVICE_COOKIE)?.value,
      )
      const deviceId =
        resolveIncomingWalletDeviceId(null, cookieDeviceId) ??
        createWalletDeviceId()
      cookieJar.cookies.set(
        WALLET_DEVICE_COOKIE,
        deviceId,
        walletDeviceCookieOptions(),
      )
      const { error: claimError } = await supabase.rpc(
        "claim_active_wallet_device",
        { p_device_id: deviceId },
      )
      if (claimError) {
        logger.error({
          context: "auth/callback",
          message: "wallet_device_claim_failed",
          userId: user.id,
          error: claimError,
        })
      }

      const path = resolveAuthCallbackDestination(next, role)
      return copyCookies(
        cookieJar,
        NextResponse.redirect(redirectUrl(request, path)),
      )
    }
  }

  const loginUrl = redirectUrl(request, "/login")
  loginUrl.searchParams.set(
    "error",
    oauthError
      ? "No se pudo completar el acceso con Google. Intentá de nuevo."
      : "No se pudo confirmar la cuenta. Solicita un nuevo enlace.",
  )
  if (next) loginUrl.searchParams.set("next", next)
  return copyCookies(cookieJar, NextResponse.redirect(loginUrl))
}
