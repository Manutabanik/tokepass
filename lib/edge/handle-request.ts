import { NextResponse, type NextRequest } from "next/server"

import { REQUEST_PATHNAME_HEADER } from "@/lib/auth/next-path"
import { updateSession } from "@/lib/supabase/middleware"
import {
  buildContentSecurityPolicy,
  createCspNonce,
} from "@/lib/security/csp"
import {
  EDGE_CHECKOUT_RATE_LIMIT_ERROR,
  edgeCheckoutIpBlocked,
} from "@/lib/security/edge-checkout-rate-limit"
import {
  applyVipCookie,
  evaluateWaitingRoomGate,
} from "@/lib/waiting-room/gate"
import { isAuthRefreshBypassPath } from "@/lib/waiting-room/paths"

function passthroughWithCsp(request: NextRequest) {
  const nonce = createCspNonce()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set(
    REQUEST_PATHNAME_HEADER,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  )
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })
  response.headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce))
  return response
}

export async function handleEdgeRequest(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isAuthRefreshBypassPath(pathname)) {
    return passthroughWithCsp(request)
  }

  if (await edgeCheckoutIpBlocked(request)) {
    return NextResponse.json(
      { success: false, error: EDGE_CHECKOUT_RATE_LIMIT_ERROR },
      { status: 429 },
    )
  }

  const gate = await evaluateWaitingRoomGate(request)
  if (gate.kind === "block") return gate.response

  const response = await updateSession(request)
  if (gate.kind === "admit") {
    applyVipCookie(response, gate.cookie)
  }
  return response
}
