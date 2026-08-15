export const STORY_CANVAS_WIDTH = 1080
export const STORY_CANVAS_HEIGHT = 1920

export type StoryThemeId = "neon-purple" | "dark-mesh" | "gradient-minimal"

export type StoryHeadlineId = "see-you" | "got-ticket" | "going-out"

export type StoryFlyerMode = "visitor" | "buyer"

export type StoryLineupArtist = {
  name: string
  imageUrl?: string | null
}

export type StoryFlyerData = {
  eventTitle: string
  eventDate: string
  eventLocation: string
  imageUrl?: string | null
  customStoryUrl?: string | null
  mode: StoryFlyerMode
  organizerName?: string | null
  organizerAvatarUrl?: string | null
  eventId?: string | null
  artistName?: string | null
  artistImageUrl?: string | null
  categoryLabel?: string | null
  lineupArtists?: StoryLineupArtist[]
  lineupRemainingCount?: number
}

export type StoryTheme = {
  id: StoryThemeId
  label: string
  background: string
  overlay?: string
  orbs: Array<{ x: string; y: string; color: string; size: number }>
  gradientStops: [string, string, string]
  ticketShadow: string
  accent: string
}

export type StoryHeadline = {
  id: StoryHeadlineId
  lines: [string, string]
}

export const STORY_THEMES: StoryTheme[] = [
  {
    id: "neon-purple",
    label: "Neon",
    background: "#090014",
    orbs: [
      { x: "16%", y: "10%", color: "rgba(168,85,247,0.58)", size: 760 },
      { x: "86%", y: "26%", color: "rgba(236,72,153,0.42)", size: 680 },
      { x: "38%", y: "82%", color: "rgba(34,211,238,0.28)", size: 720 },
    ],
    gradientStops: ["#f5d0fe", "#c084fc", "#22d3ee"],
    ticketShadow: "0 48px 90px rgba(168,85,247,0.4)",
    accent: "#e879f9",
  },
  {
    id: "dark-mesh",
    label: "Dark",
    background: "#050507",
    orbs: [
      { x: "18%", y: "14%", color: "rgba(16,185,129,0.34)", size: 700 },
      { x: "82%", y: "20%", color: "rgba(6,182,212,0.3)", size: 640 },
      { x: "52%", y: "84%", color: "rgba(139,92,246,0.24)", size: 760 },
    ],
    gradientStops: ["#6ee7b7", "#22d3ee", "#a78bfa"],
    ticketShadow: "0 48px 90px rgba(16,185,129,0.32)",
    accent: "#34d399",
  },
  {
    id: "gradient-minimal",
    label: "Minimal",
    background: "#08060f",
    overlay:
      "linear-gradient(180deg, #241b4b 0%, #120c24 46%, #05040a 100%)",
    orbs: [
      { x: "50%", y: "6%", color: "rgba(255,255,255,0.1)", size: 520 },
    ],
    gradientStops: ["#ffffff", "#ddd6fe", "#67e8f9"],
    ticketShadow: "0 40px 70px rgba(0,0,0,0.55)",
    accent: "#fafafa",
  },
]

export const STORY_HEADLINES: StoryHeadline[] = [
  { id: "see-you", lines: ["NOS VEMOS", "AHÍ"] },
  { id: "got-ticket", lines: ["YA TENGO", "MI ENTRADA"] },
  { id: "going-out", lines: ["HOY", "SE SALE"] },
]

export function defaultStoryHeadlineId(mode: StoryFlyerMode): StoryHeadlineId {
  return mode === "buyer" ? "got-ticket" : "see-you"
}

export function findStoryTheme(id: StoryThemeId): StoryTheme {
  return STORY_THEMES.find((theme) => theme.id === id) ?? STORY_THEMES[0]
}

export function findStoryHeadline(id: StoryHeadlineId): StoryHeadline {
  return STORY_HEADLINES.find((item) => item.id === id) ?? STORY_HEADLINES[0]
}

export function storyCategoryLabel(input: {
  tierName?: string | null
  seatingLabel?: string | null
  seatingSectorName?: string | null
}): string {
  const seating = [input.seatingSectorName, input.seatingLabel]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" · ")
  if (seating) return seating.toUpperCase()
  const tier = input.tierName?.trim()
  if (tier) return tier.toUpperCase()
  return "ACCESO GENERAL"
}

export function publicStoryName(
  value: string | null | undefined,
  fallback: string,
): string {
  const trimmed = value?.trim() || ""
  if (!trimmed || trimmed.includes("@")) return fallback
  return trimmed
}

export function storyInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "TP"
  )
}

export const STORY_LINEUP_AVATAR_MAX = 3

export function storyLineupLabel(
  names: string[],
  remainingCount = 0,
): string {
  const clean = names.map((name) => name.trim()).filter(Boolean)
  if (clean.length === 0) return ""
  const extra = remainingCount + Math.max(0, clean.length - 2)
  const shown = clean.slice(0, 2)
  if (shown.length === 1 && extra <= 0) return `Lineup: ${shown[0]}`
  if (shown.length === 1) return `Lineup: ${shown[0]} y mas`
  if (extra <= 0) return `Lineup: ${shown[0]} y ${shown[1]}`
  return `Lineup: ${shown[0]}, ${shown[1]} y mas`
}

export function storyCtaUrl(): string {
  return "https://www.tokepass.com.ar"
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "")
  if (raw.length !== 6) return hex
  const r = Number.parseInt(raw.slice(0, 2), 16)
  const g = Number.parseInt(raw.slice(2, 4), 16)
  const b = Number.parseInt(raw.slice(4, 6), 16)
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return hex
  return `rgba(${r},${g},${b},${alpha})`
}

export function storyLiquidLayers(theme: StoryTheme) {
  if (theme.orbs.length >= 3) return theme.orbs.slice(0, 3)
  const extras = theme.gradientStops.map((color, index) => ({
    x: `${20 + index * 30}%`,
    y: `${14 + index * 30}%`,
    color: hexToRgba(color, 0.34),
    size: 680 - index * 48,
  }))
  return [...theme.orbs, ...extras].slice(0, 3)
}
