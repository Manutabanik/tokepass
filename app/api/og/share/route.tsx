import { ImageResponse } from "next/og"
import type { NextRequest } from "next/server"

export const runtime = "edge"

const WIDTH = 1080
const HEIGHT = 1920
const MAX_TITLE_LEN = 72

function sanitizeTitle(raw: string | null): string {
  if (!raw) return "Evento Tokepass"
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }
  const clean = decoded
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!clean) return "Evento Tokepass"
  return clean.length > MAX_TITLE_LEN
    ? `${clean.slice(0, MAX_TITLE_LEN - 1)}…`
    : clean
}

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return false
  if (h.endsWith(".local") || h.endsWith(".internal")) return true
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h)) return true
  if (h === "0.0.0.0" || h === "metadata.google.internal") return true
  return false
}

function allowedImageHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === "localhost" || h === "127.0.0.1") return true
  if (h.endsWith(".supabase.co")) return true
  try {
    const configured = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (configured) {
      const allowed = new URL(configured).hostname.toLowerCase()
      if (h === allowed) return true
    }
  } catch {
    // ignore
  }
  return false
}

function sanitizeImageUrl(raw: string | null): string | null {
  if (!raw) return null
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }
  const trimmed = decoded.trim()
  if (!trimmed || trimmed.length > 2048) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (
    url.protocol === "http:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  ) {
    return null
  }
  if (
    isPrivateHostname(url.hostname) &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  ) {
    return null
  }
  if (!allowedImageHost(url.hostname)) return null

  return url.toString()
}

function CustomStoryImage({ src }: { src: string }) {
  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#09090b",
      }}
    >
      <img
        src={src}
        alt=""
        width={WIDTH}
        height={HEIGHT}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </div>
  )
}

function AutoHypeCard({
  title,
  imageUrl,
}: {
  title: string
  imageUrl: string | null
}) {
  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#09090b",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          width={WIDTH}
          height={HEIGHT}
          style={{
            position: "absolute",
            top: "-8%",
            left: "-8%",
            width: "116%",
            height: "116%",
            objectFit: "cover",
            opacity: 0.5,
            filter: "blur(28px)",
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(160deg, #4c1d95 0%, #831843 45%, #09090b 100%)",
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.6)",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          height: "100%",
          padding: "120px 72px 100px",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 120,
              height: 6,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.35)",
              marginBottom: 36,
            }}
          />
          <div
            style={{
              display: "flex",
              color: "#ffffff",
              fontSize: 64,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              textAlign: "center",
              textTransform: "uppercase",
            }}
          >
            ¡YO YA TENGO MI ENTRADA!
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 780,
            height: 980,
            borderRadius: 36,
            overflow: "hidden",
            boxShadow: "0 40px 80px rgba(0,0,0,0.65)",
            border: "2px solid rgba(255,255,255,0.12)",
            backgroundColor: "#18181b",
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              width={780}
              height={980}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                color: "#a1a1aa",
                fontSize: 40,
                fontWeight: 700,
              }}
            >
              Tokepass
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
            gap: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#fafafa",
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.15,
              textAlign: "center",
              maxWidth: 900,
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "14px 28px",
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#e4e4e7",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Adquirida en Tokepass
          </div>
        </div>
      </div>
    </div>
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const title = sanitizeTitle(searchParams.get("title"))
  const imageUrl = sanitizeImageUrl(searchParams.get("image"))
  const customStoryUrl = sanitizeImageUrl(searchParams.get("customStoryUrl"))

  const element = customStoryUrl ? (
    <CustomStoryImage src={customStoryUrl} />
  ) : (
    <AutoHypeCard title={title} imageUrl={imageUrl} />
  )

  return new ImageResponse(element, {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  })
}
