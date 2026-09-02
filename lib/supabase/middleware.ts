import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { isPosStaffRole } from "@/lib/pos-checkout"
import {
  REFERRAL_COOKIE_NAME,
  RRPP_COOKIE_NAME,
  buildReferralCookieOptions,
  normalizeReferralCode,
} from "@/lib/referral"
import {
  buildContentSecurityPolicy,
  createCspNonce,
} from "@/lib/security/csp"
import {
  isPosOpsPath,
  isStaffOpsPath,
  staffCanAccessPath,
  staffHomeForRoles,
} from "@/types/auth"
import { AUTH_NEXT_COOKIE } from "@/lib/auth/callback-url"
import {
  DEVICE_WALLET_PATH,
  DEVICE_WALLET_REASON_EXPIRED,
  DEVICE_WALLET_REASON_PARAM,
  REQUEST_PATHNAME_HEADER,
  authenticatedVisitorDestination,
  isAuthEntryRoute,
  isDeviceWalletFallbackPath,
} from "@/lib/auth/next-path"
import {
  expiredAuthCookieOptions,
  isSupabaseAuthCookieName,
  shouldPurgeAuthSessionOnLoginError,
} from "@/lib/auth/session-cookies"
import type { EventStaffRole } from "@/types/auth"
import type { Database } from "@/types/database"

function applyCsp(response: NextResponse, nonce: string) {
  response.headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy(nonce),
  )
  return response
}

function createPassthroughResponse(request: NextRequest, nonce: string) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set(
    REQUEST_PATHNAME_HEADER,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  )
  return applyCsp(
    NextResponse.next({
      request: { headers: requestHeaders },
    }),
    nonce,
  )
}

function sessionCookieSecurity(request: NextRequest) {
  return {
    sameSite: "lax" as const,
    secure:
      request.nextUrl.protocol === "https:" ||
      process.env.VERCEL === "1" ||
      process.env.VERCEL_ENV === "production",
  }
}

function redirectWithRefreshedCookies(
  url: URL,
  responseWithCookies: NextResponse,
  nonce: string,
  request: NextRequest,
) {
  const redirectResponse = applyCsp(NextResponse.redirect(url), nonce)
  const security = sessionCookieSecurity(request)

  responseWithCookies.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value, {
      ...cookie,
      ...security,
    })
  })

  return redirectResponse
}

function captureReferralFromRequest(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const raw =
    request.nextUrl.searchParams.get("rrpp") ??
    request.nextUrl.searchParams.get("ref")
  const code = normalizeReferralCode(raw)
  if (!code) return response

  const cookieOptions = buildReferralCookieOptions()
  response.cookies.set(REFERRAL_COOKIE_NAME, code, cookieOptions)
  response.cookies.set(RRPP_COOKIE_NAME, code, cookieOptions)
  return response
}

export async function updateSession(request: NextRequest) {
  const nonce = createCspNonce()
  let response = createPassthroughResponse(request, nonce)
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
    return applyCsp(NextResponse.redirect(url, 308), nonce)
  }
  if (
    pathname.startsWith("/my-tickets/") ||
    pathname.startsWith("/mis-tickets/")
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/cuenta/entradas"
    return applyCsp(NextResponse.redirect(url, 308), nonce)
  }
  if (pathname.startsWith("/my-orders/")) {
    const url = request.nextUrl.clone()
    url.pathname = "/cuenta/compras"
    return applyCsp(NextResponse.redirect(url, 308), nonce)
  }

  const loginError = request.nextUrl.searchParams.get("error")
  if (
    shouldPurgeAuthSessionOnLoginError(loginError) &&
    (pathname === "/login" || pathname === "/login-organizador")
  ) {
    const security = sessionCookieSecurity(request)
    for (const cookie of request.cookies.getAll()) {
      if (!isSupabaseAuthCookieName(cookie.name)) continue
      request.cookies.delete(cookie.name)
      response.cookies.set(
        cookie.name,
        "",
        expiredAuthCookieOptions(security.secure),
      )
    }
    response.cookies.set(
      AUTH_NEXT_COOKIE,
      "",
      expiredAuthCookieOptions(security.secure),
    )
    return response
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

          response = createPassthroughResponse(request, nonce)
          response = captureReferralFromRequest(request, response)

          const security = sessionCookieSecurity(request)
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              sameSite: security.sameSite,
              secure: security.secure,
            })
          })
        },
      },
    },
  )

  // getUser validates the token with Supabase Auth; getSession alone does not.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Va después del bloque de purga por `?error=`: ese caso necesita renderizar
  // /login con sesión viva para que el cliente limpie las cookies zombie, y
  // redirigirlo acá lo dejaría en un bucle.
  if (user && isAuthEntryRoute(pathname)) {
    const { data: visitorProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const destination = authenticatedVisitorDestination(
      request.nextUrl.searchParams.get("next"),
      visitorProfile?.role ?? null,
    )

    return redirectWithRefreshedCookies(
      new URL(destination, request.nextUrl.origin),
      response,
      nonce,
      request,
    )
  }

  // `AccountPortalLayout` manda al login cuando no hay sesión, y eso deja al
  // usuario sin acceso a una entrada que ya está guardada en su dispositivo.
  // La billetera local no necesita sesión, así que el pase sigue alcanzable.
  if (!user && isDeviceWalletFallbackPath(pathname)) {
    const walletUrl = request.nextUrl.clone()
    walletUrl.pathname = DEVICE_WALLET_PATH
    walletUrl.search = ""
    walletUrl.searchParams.set(
      DEVICE_WALLET_REASON_PARAM,
      DEVICE_WALLET_REASON_EXPIRED,
    )

    return redirectWithRefreshedCookies(walletUrl, response, nonce, request)
  }

  const isAdminRoute = pathname.startsWith("/admin")
  const isSuperAdminRoute =
    pathname.startsWith("/superadmin") || pathname.startsWith("/super-admin")
  const isPosRoute = isPosOpsPath(pathname)
  const isRrppRoute = pathname === "/rrpp" || pathname.startsWith("/rrpp/")
  const isPromoterRoute = pathname.startsWith("/promoter") || isRrppRoute
  const isProtectedRoute =
    isAdminRoute || isSuperAdminRoute || isPromoterRoute || isPosRoute

  if (!user && isProtectedRoute) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = isPromoterRoute ? "/login" : "/login-organizador"
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`)

    return redirectWithRefreshedCookies(loginUrl, response, nonce, request)
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
      return redirectWithRefreshedCookies(fallbackUrl, response, nonce, request)
    }

    const actorId = user.id

    async function loadStaffRoles(): Promise<string[]> {
      const { data: assignments } = await supabase
        .from("event_staff_assignments")
        .select("role")
        .eq("user_id", actorId)
        .eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

      return [
        ...new Set((assignments ?? []).map((row) => String(row.role))),
      ]
    }

    function staffHome(roles: string[]): string {
      return staffHomeForRoles(roles as EventStaffRole[])
    }

    if (isPosRoute && role !== "admin" && role !== "super_admin") {
      const staffRoles = await loadStaffRoles()
      if (!staffRoles.some((staffRole) => isPosStaffRole(staffRole))) {
        const homeUrl = request.nextUrl.clone()
        homeUrl.pathname = staffRoles.length > 0 ? staffHome(staffRoles) : "/"
        homeUrl.search = ""
        return redirectWithRefreshedCookies(homeUrl, response, nonce, request)
      }
    }

    if (isAdminRoute && role !== "admin" && role !== "super_admin") {
      const staffRoles = await loadStaffRoles()

      if (staffRoles.length === 0) {
        const homeUrl = request.nextUrl.clone()
        homeUrl.pathname = "/"
        homeUrl.search = ""
        return redirectWithRefreshedCookies(homeUrl, response, nonce, request)
      }

      if (
        !isStaffOpsPath(pathname) ||
        !staffCanAccessPath(pathname, staffRoles)
      ) {
        const staffHomeUrl = request.nextUrl.clone()
        staffHomeUrl.pathname = staffHome(staffRoles)
        staffHomeUrl.search = ""
        return redirectWithRefreshedCookies(staffHomeUrl, response, nonce, request)
      }
    }
  }

  return response
}
