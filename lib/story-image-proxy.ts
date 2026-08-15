import { NextResponse } from "next/server"

import { parseStoryImageUrl } from "@/lib/story-image"

const MAX_BYTES = 8 * 1024 * 1024

function resolveStoryFetchUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.startsWith("data:image/")) return trimmed
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return trimmed
  }
  if (trimmed.startsWith("/")) {
    const site =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    return site ? `${site}${trimmed}` : null
  }
  return null
}

export async function fetchImageAsDataUrl(
  raw: string | null | undefined,
): Promise<string | null> {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("data:image/")) return trimmed

  const absolute = resolveStoryFetchUrl(trimmed)
  if (!absolute) return null
  const parsed = parseStoryImageUrl(absolute)
  const href =
    parsed?.toString() ??
    (trimmed.startsWith("/") && /^https?:\/\//.test(absolute)
      ? absolute
      : null)
  if (!href) return null

  try {
    const upstream = await fetch(href, {
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(8000),
    })
    if (!upstream.ok) return null
    const contentType = upstream.headers.get("content-type") ?? ""
    const mime = contentType.split(";")[0]?.trim().toLowerCase() || "image/jpeg"
    if (!mime.startsWith("image/")) return null
    const buffer = Buffer.from(await upstream.arrayBuffer())
    if (buffer.byteLength > MAX_BYTES) return null
    return `data:${mime};base64,${buffer.toString("base64")}`
  } catch {
    return null
  }
}

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
