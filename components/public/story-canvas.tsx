"use client"

import { motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react"
import { useId, type CSSProperties, type RefObject } from "react"
import { QRCodeSVG } from "qrcode.react"

import { StoryLiquidBackdrop } from "@/components/public/story-liquid-backdrop"
import { StoryParticles } from "@/components/public/story-particles"
import { formatStoryEventDates } from "@/lib/format"
import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  findStoryHeadline,
  findStoryTheme,
  publicStoryName,
  storyCtaUrl,
  storyInitials,
  storyLineupLabel,
  type StoryFlyerData,
  type StoryHeadlineId,
  type StoryThemeId,
} from "@/lib/story-canvas"
import { specularFromTilt } from "@/lib/story-tilt"

function storyDataImage(url: string | null | undefined): string | null {
  const trimmed = url?.trim()
  if (!trimmed?.startsWith("data:image/")) return null
  return trimmed
}

const FONT =
  "var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"

function WhiteTokepassMark({ size = 72 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      aria-hidden="true"
    >
      <rect width="128" height="128" rx="28" fill="rgba(255,255,255,0.12)" />
      <rect x="24" y="28" width="80" height="22" rx="11" fill="#ffffff" />
      <rect x="53" y="40" width="22" height="42" rx="11" fill="#ffffff" />
      <rect x="50" y="92" width="28" height="12" rx="6" fill="#A78BFA" />
    </svg>
  )
}

export function StoryCanvas({
  data,
  themeId,
  headlineId,
  canvasRef,
  live = false,
  pauseMotion = false,
  rotateX: rotateXProp,
  rotateY: rotateYProp,
  onPainted,
}: {
  data: StoryFlyerData
  themeId: StoryThemeId
  headlineId: StoryHeadlineId
  canvasRef?: RefObject<HTMLDivElement | null>
  live?: boolean
  pauseMotion?: boolean
  rotateX?: MotionValue<number>
  rotateY?: MotionValue<number>
  onPainted?: () => void
}) {
  const gradientId = `story-chrome-${useId().replace(/:/g, "")}`
  const reduceMotion = useReducedMotion()
  const fallbackX = useMotionValue(0)
  const fallbackY = useMotionValue(0)
  const rotateX = rotateXProp ?? fallbackX
  const rotateY = rotateYProp ?? fallbackY
  const glare = useTransform([rotateX, rotateY], (values) => {
    const spec = specularFromTilt({
      x: Number(values[0]) || 0,
      y: Number(values[1]) || 0,
    })
    return `radial-gradient(circle at ${spec.x}% ${spec.y}%, rgba(255,255,255,0.46) 0%, rgba(255,255,255,0.08) 28%, rgba(255,255,255,0) 58%)`
  })
  const theme = findStoryTheme(themeId)
  const headline = findStoryHeadline(headlineId)
  const eventImage = storyDataImage(data.imageUrl)
  const artistName = publicStoryName(data.artistName, "")
  const artistImage = storyDataImage(data.artistImageUrl)
  const organizerName = publicStoryName(data.organizerName, "Tokepass")
  const organizerAvatar = storyDataImage(data.organizerAvatarUrl)
  const lineup = (data.lineupArtists ?? [])
    .map((artist) => ({
      name: publicStoryName(artist.name, ""),
      imageUrl: storyDataImage(artist.imageUrl),
    }))
    .filter((artist) => artist.name)
  const showLineupStack = lineup.length > 1
  const stampName = artistName || lineup[0]?.name || organizerName
  const stampImage = artistImage || lineup[0]?.imageUrl || organizerAvatar
  const stampLabel = artistName
    ? `Voy a ver a ${artistName}`
    : `Presentado por ${organizerName}`
  const lineupCopy = storyLineupLabel(
    lineup.map((artist) => artist.name),
    data.lineupRemainingCount ?? 0,
  )
  const dateLabel = formatStoryEventDates(
    data.eventDates?.length ? data.eventDates : [data.eventDate],
  )
  const cta = storyCtaUrl()

  const rootStyle: CSSProperties = {
    width: STORY_CANVAS_WIDTH,
    height: STORY_CANVAS_HEIGHT,
    position: "relative",
    overflow: "hidden",
    backgroundColor: theme.background,
    color: "#fafafa",
    fontFamily: FONT,
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
    textRendering: "optimizeLegibility",
  }

  return (
    <div ref={canvasRef} data-story-canvas style={rootStyle}>
      <StoryLiquidBackdrop
        theme={theme}
        frozen={!live || Boolean(reduceMotion)}
      />

      {live ? (
        <StoryParticles color={theme.accent} paused={pauseMotion} />
      ) : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.08) 36%, rgba(0,0,0,0.62) 100%)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          boxSizing: "border-box",
          padding: "60px 52px 40px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <svg
          width="100%"
          height="188"
          viewBox="0 0 936 220"
          role="img"
          aria-label={`${headline.lines[0]} ${headline.lines[1]}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={theme.gradientStops[0]} />
              <stop offset="52%" stopColor={theme.gradientStops[1]} />
              <stop offset="100%" stopColor={theme.gradientStops[2]} />
            </linearGradient>
          </defs>
          <text
            x="468"
            y="92"
            textAnchor="middle"
            fill={`url(#${gradientId})`}
            fontSize="86"
            fontWeight={900}
            letterSpacing="-3"
            fontFamily={FONT}
          >
            {headline.lines[0]}
          </text>
          <text
            x="468"
            y="188"
            textAnchor="middle"
            fill={`url(#${gradientId})`}
            fontSize="86"
            fontWeight={900}
            letterSpacing="-3"
            fontFamily={FONT}
          >
            {headline.lines[1]}
          </text>
        </svg>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            perspective: 1000,
          }}
        >
          <motion.div
            style={{
              width: "100%",
              height: "100%",
              rotateX: reduceMotion ? 0 : rotateX,
              rotateY: reduceMotion ? 0 : rotateY,
              transformPerspective: 1000,
              transformStyle: "preserve-3d",
              willChange: live ? "transform" : "auto",
              position: "relative",
              overflow: "hidden",
              borderRadius: 32,
              padding: 16,
              background: live
                ? "rgba(255,255,255,0.1)"
                : "rgba(24,16,36,0.94)",
              border: "1px solid rgba(255,255,255,0.2)",
              boxShadow: `0 28px 48px rgba(0,0,0,0.55), 0 0 0 2px ${theme.accent}`,
              ...(live
                ? {
                    backdropFilter: "blur(18px)",
                    WebkitBackdropFilter: "blur(18px)",
                  }
                : {}),
            }}
          >
            {live ? (
              <motion.div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 32,
                  pointerEvents: "none",
                  mixBlendMode: "screen",
                  opacity: 0.85,
                  background: glare,
                }}
              />
            ) : null}
            <div
              style={{
                position: "relative",
                borderRadius: 24,
                overflow: "hidden",
                height: "100%",
                background: theme.background,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {eventImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={eventImage}
                  alt=""
                  data-story-image="hero"
                  data-flyer-img=""
                  onLoad={onPainted}
                  onError={onPainted}
                  ref={(node) => {
                    if (!onPainted || !node) return
                    if (node.complete && node.naturalWidth > 0) {
                      queueMicrotask(onPainted)
                    }
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "grid",
                    placeItems: "center",
                    color: "#a1a1aa",
                    fontSize: 40,
                    fontWeight: 800,
                    textAlign: "center",
                    padding: 32,
                  }}
                >
                  {data.eventTitle}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        <div style={{ marginTop: 20 }}>
          <p
            style={{
              margin: 0,
              fontSize: 36,
              lineHeight: 1.08,
              fontWeight: 900,
              letterSpacing: "-0.04em",
            }}
          >
            {data.eventTitle}
          </p>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 22,
              fontWeight: 700,
              color: "rgba(255,255,255,0.86)",
              textTransform: "capitalize",
            }}
          >
            {dateLabel}
          </p>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              minWidth: 0,
              flex: 1,
            }}
          >
            {showLineupStack ? (
              <div style={{ display: "flex", alignItems: "center" }}>
                {lineup.slice(0, 3).map((artist, index) => (
                  <div
                    key={`${artist.name}-${index}`}
                    style={{
                      width: 56,
                      height: 56,
                      marginLeft: index === 0 ? 0 : -14,
                      borderRadius: 999,
                      overflow: "hidden",
                      flexShrink: 0,
                      border: `2px solid ${theme.accent}`,
                      boxShadow: "0 6px 12px rgba(0,0,0,0.4)",
                      background: "rgba(255,255,255,0.12)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 16,
                      fontWeight: 800,
                      zIndex: 8 - index,
                    }}
                  >
                    {artist.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={artist.imageUrl}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : (
                      <span>{storyInitials(artist.name)}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 999,
                  overflow: "hidden",
                  flexShrink: 0,
                  border: `3px solid ${theme.accent}`,
                  boxShadow: `0 0 0 4px ${theme.accent}33, 0 10px 18px rgba(0,0,0,0.45)`,
                  background: "rgba(255,255,255,0.12)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 26,
                  fontWeight: 900,
                }}
              >
                {stampImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={stampImage}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  <span>{storyInitials(stampName)}</span>
                )}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: showLineupStack ? 20 : 22,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  letterSpacing: "-0.02em",
                  color: showLineupStack
                    ? "rgba(255,255,255,0.72)"
                    : "#fafafa",
                }}
              >
                {showLineupStack ? lineupCopy : stampLabel}
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            borderRadius: 999,
            padding: "14px 22px",
            background: "rgba(255,255,255,0.08)",
            border: `1px solid ${theme.accent}66`,
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.03em",
            }}
          >
            Adquiri tu entrada en tokepass.com.ar
          </p>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 16,
              fontWeight: 600,
              color: "rgba(255,255,255,0.55)",
            }}
          >
            Pega tu sticker de enlace aqui
          </p>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minWidth: 0,
            }}
          >
            <WhiteTokepassMark size={40} />
            {organizerAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={organizerAvatar}
                alt=""
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  objectFit: "cover",
                  border: "1px solid rgba(255,255,255,0.28)",
                  flexShrink: 0,
                }}
              />
            ) : null}
            <p
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                color: "rgba(255,255,255,0.58)",
                letterSpacing: "-0.01em",
              }}
            >
              {`Organizado por ${organizerName}`}
            </p>
          </div>
          <div
            style={{
              width: 112,
              height: 112,
              borderRadius: 16,
              overflow: "hidden",
              background: "#fff",
              padding: 8,
              boxSizing: "border-box",
              flexShrink: 0,
            }}
          >
            <QRCodeSVG
              value={cta}
              size={96}
              level="H"
              includeMargin
              bgColor="#ffffff"
              fgColor="#09090b"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
