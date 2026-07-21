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

  const { pathname } = request.nextUrl
  const isAdminRoute = pathname.startsWith("/admin")
  const isSuperAdminRoute =
    pathname.startsWith("/superadmin") || pathname.startsWith("/super-admin")
  const isPromoterRoute = pathname.startsWith("/promoter")
  const isProtectedRoute = isAdminRoute || isSuperAdminRoute || isPromoterRoute

  if (!user && isProtectedRoute) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = isPromoterRoute ? "/login" : "/login-organizador"
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`)

    return redirectWithRefreshedCookies(loginUrl, response)
  }

  if (user && isProtectedRoute) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const role = error ? null : profile?.role

    // The platform panel is exclusive to super admins.
    if (isSuperAdminRoute && role !== "super_admin") {
      const fallbackUrl = request.nextUrl.clone()
      fallbackUrl.pathname = role === "admin" ? "/admin" : "/"
      fallbackUrl.search = ""
      return redirectWithRefreshedCookies(fallbackUrl, response)
    }

    // The organizer panel is open to admins and super admins.
    if (
      isAdminRoute &&
      role !== "admin" &&
      role !== "super_admin"
    ) {
      const homeUrl = request.nextUrl.clone()
      homeUrl.pathname = "/"
      homeUrl.search = ""
      return redirectWithRefreshedCookies(homeUrl, response)
    }
  }

  return response
}
