import { NextResponse } from "next/server"

export const runtime = "edge"

/**
 * Legacy unversioned tile URL. Redirect to Voyager so stale clients don't keep
 * painting the old dark basemap once CDN entries expire.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await context.params
  const target = new URL(request.url)
  target.pathname = `/api/map-tiles/voyager/${z}/${x}/${y}`
  target.search = ""
  return NextResponse.redirect(target, 302)
}
