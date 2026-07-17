import { NextResponse, type NextRequest } from "next/server"

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
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()

        if (profile) {
          const destination =
            profile.role === "admin" || profile.role === "super_admin"
              ? "/admin"
              : "/"
          return NextResponse.redirect(new URL(destination, request.url))
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
