import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import {
  REFERRAL_COOKIE_NAME,
  buildReferralCookieOptions,
  normalizeReferralCode,
} from "@/lib/referral"
import { isStaffOpsPath, staffHomeForRoles } from "@/types/auth"
import type { EventStaffRole } from "@/types/auth"
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

function captureReferralFromRequest(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const raw = request.nextUrl.searchParams.get("ref")
  const code = normalizeReferralCode(raw)
  if (!code) return response

  response.cookies.set(
    REFERRAL_COOKIE_NAME,
    code,
    buildReferralCookieOptions(),
  )
  return response
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  response = captureReferralFromRequest(request, response)

  const { pathname } = request.nextUrl

  // Rutas legacy B2C → portal /cuenta (308 permanente)
  const legacyDestinations: Record<string, string> = {
    "/my-tickets": "/cuenta/entradas",
    "/mis-tickets": "/cuenta/entradas",
    "/my-orders": "/cuenta/compras",
    "/profile": "/cuenta/perfil",
  }
  const legacyExact = legacyDestinations[pathname]
  if (legacyExact) {
    const url = request.nextUrl.clone()
    url.pathname = legacyExact
    return NextResponse.redirect(url, 308)
  }
  if (
    pathname.startsWith("/my-tickets/") ||
    pathname.startsWith("/mis-tickets/")
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/cuenta/entradas"
    return NextResponse.redirect(url, 308)
  }
  if (pathname.startsWith("/my-orders/")) {
    const url = request.nextUrl.clone()
    url.pathname = "/cuenta/compras"
    return NextResponse.redirect(url, 308)
  }

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
          response = captureReferralFromRequest(request, response)

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

    if (isAdminRoute && role !== "admin" && role !== "super_admin") {
      const { data: assignments } = await supabase
        .from("event_staff_assignments")
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

      const staffRoles = [
        ...new Set(
          (assignments ?? []).map((row) => row.role as EventStaffRole),
        ),
      ]

      if (staffRoles.length === 0) {
        const homeUrl = request.nextUrl.clone()
        homeUrl.pathname = "/"
        homeUrl.search = ""
        return redirectWithRefreshedCookies(homeUrl, response)
      }

      // Delegated staff: only scanner / bar / POS — never finances or event edit.
      if (!isStaffOpsPath(pathname)) {
        const staffHome = request.nextUrl.clone()
        staffHome.pathname = staffHomeForRoles(staffRoles)
        staffHome.search = ""
        return redirectWithRefreshedCookies(staffHome, response)
      }
    }
  }

  return response
}
