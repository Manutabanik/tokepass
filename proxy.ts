/**
 * Next.js 16 Edge interceptor (formerly middleware.ts).
 * Runtime is Edge. Do not add a sibling middleware.ts — the build rejects both.
 * Session refresh lives here via `updateSession` → `supabase.auth.getUser()`.
 */
import type { NextRequest } from "next/server"

import { handleEdgeRequest } from "@/lib/edge/handle-request"

export async function proxy(request: NextRequest) {
  return handleEdgeRequest(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
