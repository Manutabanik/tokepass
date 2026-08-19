import { NextResponse } from "next/server"

import { searchSpotifyArtists } from "@/app/actions/artists"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SEARCH_LIMIT = 5

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q") ?? ""
    const result = await searchSpotifyArtists(query)
    const items = (result.data ?? []).slice(0, SEARCH_LIMIT)
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
