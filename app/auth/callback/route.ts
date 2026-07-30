import { NextResponse, type NextRequest } from "next/server"

import {
  getFreshLoginProfile,
  postLoginDestination,
} from "@/lib/auth/post-login"
import { logger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code)

    if (!exchangeError) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        try {
          const profile = await getFreshLoginProfile(user.id)
          return NextResponse.redirect(
            new URL(postLoginDestination(profile?.role), request.url),
          )
        } catch (profileError) {
          logger.error({
            context: "auth/callback",
            message: "fresh_profile_lookup_failed",
            userId: user.id,
            error: profileError,
          })
        }
      }
    }
  }

  const loginUrl = new URL("/login", request.url)
  loginUrl.searchParams.set(
    "error",
    "No se pudo confirmar la cuenta. Solicita un nuevo enlace.",
  )

  return NextResponse.redirect(loginUrl)
}
