import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BYTES = 8 * 1024 * 1024

function isAllowedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  let supabaseHost = ""
  try {
    supabaseHost = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    ).hostname.toLowerCase()
  } catch {
    supabaseHost = ""
  }
  if (supabaseHost && host === supabaseHost) return true
  return host.endsWith(".supabase.co")
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url")?.trim()
  if (!raw) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 })
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "invalid_protocol" }, { status: 400 })
  }
  if (parsed.username || parsed.password) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 })
  }
  if (!isAllowedImageHost(parsed.hostname)) {
    return NextResponse.json({ error: "host_not_allowed" }, { status: 400 })
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
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "not_an_image" }, { status: 400 })
    }

    const buffer = new Uint8Array(await upstream.arrayBuffer())
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "too_large" }, { status: 413 })
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
      },
    })
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 })
  }
}
