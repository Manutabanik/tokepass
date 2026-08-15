import { NextResponse } from "next/server"

import { parseStoryImageUrl } from "@/lib/story-image"

const MAX_BYTES = 8 * 1024 * 1024

export async function handleStoryImageProxy(request: Request) {
  const requestUrl = new URL(request.url)
  const raw = requestUrl.searchParams.get("url")?.trim()
  const asDataUrl = requestUrl.searchParams.get("format") === "dataurl"
  if (!raw) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 })
  }

  const parsed = parseStoryImageUrl(raw)
  if (!parsed) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 })
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(8000),
    })
    if (!upstream.ok) {
      return NextResponse.json({ error: "upstream_error" }, { status: 502 })
    }

    const contentType = upstream.headers.get("content-type") ?? ""
    const mime = contentType.split(";")[0]?.trim().toLowerCase() || "image/jpeg"
    if (!mime.startsWith("image/")) {
      return NextResponse.json({ error: "not_an_image" }, { status: 400 })
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "too_large" }, { status: 413 })
    }

    if (asDataUrl) {
      return NextResponse.json({
        dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
      })
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mime,
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Cache-Control": "public, max-age=300",
      },
    })
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 })
  }
}
