import { NextResponse } from "next/server"

export const runtime = "edge"

const MAX_ZOOM = 20

type Upstream = {
  buildUrl: (z: number, x: number, y: number) => string
  minBytes: number
}

/** Bright, readable basemap (Voyager). Esri streets as fallback. */
const UPSTREAMS: Upstream[] = [
  {
    buildUrl: (z, x, y) =>
      `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
    minBytes: 200,
  },
  {
    buildUrl: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`,
    minBytes: 200,
  },
]

function parseTileCoord(value: string): number | null {
  if (!/^\d{1,8}$/.test(value)) return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : null
}

async function fetchUpstream(url: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        "User-Agent": "TokepassMapProxy/1.0 (+https://www.tokepass.com.ar)",
        Referer: "https://www.tokepass.com.ar/",
      },
      next: { revalidate: 86_400 },
    })
  } catch {
    return null
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z: zRaw, x: xRaw, y: yRaw } = await context.params
  const z = parseTileCoord(zRaw)
  const x = parseTileCoord(xRaw)
  const y = parseTileCoord(yRaw)

  if (z == null || x == null || y == null || z > MAX_ZOOM) {
    return new NextResponse("Bad tile coordinates", { status: 400 })
  }

  const extent = 2 ** z
  if (x >= extent || y >= extent) {
    return new NextResponse("Tile out of range", { status: 400 })
  }

  for (const upstream of UPSTREAMS) {
    const remote = await fetchUpstream(upstream.buildUrl(z, x, y))
    if (!remote?.ok) continue

    const body = await remote.arrayBuffer()
    if (body.byteLength < upstream.minBytes) continue

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": remote.headers.get("Content-Type") || "image/png",
        "Cache-Control":
          "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    })
  }

  return new NextResponse("Tile upstream unavailable", { status: 502 })
}
