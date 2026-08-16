import { NextResponse, type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"
import {
  buildContentSecurityPolicy,
  createCspNonce,
} from "@/lib/security/csp"
import {
  applyVipCookie,
  evaluateWaitingRoomGate,
} from "@/lib/waiting-room/gate"
import { isAuthRefreshBypassPath } from "@/lib/waiting-room/paths"

function passthroughWithCsp(request: NextRequest) {
  const nonce = createCspNonce()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
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

  const gate = await evaluateWaitingRoomGate(request)
  if (gate.kind === "block") return gate.response

  const response = await updateSession(request)
  if (gate.kind === "admit") {
    applyVipCookie(response, gate.cookie)
  }
  return response
}
