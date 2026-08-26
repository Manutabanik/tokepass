import { NextResponse } from "next/server"

import { claimGuestMagicLink } from "@/app/actions/guest-ticket-access"
import {
  GUEST_ORDER_COOKIE,
  guestAccessCookieAttrs,
} from "@/lib/checkout/guest-access"
import { getEmailAppUrl } from "@/lib/email/resend"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get("token")?.trim() ?? ""
  const appUrl = getEmailAppUrl()
  if (!token) {
    return NextResponse.redirect(`${appUrl}/cuenta/entradas/acceso`)
  }

  const claimed = await claimGuestMagicLink(token)
  if (!claimed.ok) {
    return NextResponse.redirect(`${appUrl}/cuenta/entradas/acceso?error=1`)
  }

  const response = NextResponse.redirect(`${appUrl}/cuenta/entradas/acceso`)
  response.cookies.set(GUEST_ORDER_COOKIE, token, guestAccessCookieAttrs())
  return response
}
