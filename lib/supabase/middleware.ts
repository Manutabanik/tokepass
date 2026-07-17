import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import type { Database } from "@/types/database"

function redirectWithRefreshedCookies(
  url: URL,
  responseWithCookies: NextResponse,
) {
  const redirectResponse = NextResponse.redirect(url)

  responseWithCookies.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
  })

  return redirectResponse
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })

          response = NextResponse.next({ request })

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  // getUser validates the token with Supabase Auth; getSession alone does not.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin")

  if (!user && isAdminRoute) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login-organizador"
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    )

    return redirectWithRefreshedCookies(loginUrl, response)
  }

  if (user && isAdminRoute) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const canAccessAdmin =
      !error &&
      profile &&
      (profile.role === "admin" || profile.role === "super_admin")

    if (!canAccessAdmin) {
      const homeUrl = request.nextUrl.clone()
      homeUrl.pathname = "/"
      homeUrl.search = ""
      return redirectWithRefreshedCookies(homeUrl, response)
    }
  }

  return response
}
