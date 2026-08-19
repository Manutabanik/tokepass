import Image from "next/image"

import type { PublicSponsor } from "@/lib/sponsors"
import { storyImageSrc } from "@/lib/story-image"
import { cn } from "@/lib/utils"

function isRasterLogo(url: string): boolean {
  try {
    return /\.(?:png|jpe?g|webp|avif)$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

function SponsorLogo({
  sponsor,
  size,
  grayscale,
}: {
  sponsor: PublicSponsor
  size: "sm" | "md"
  grayscale: boolean
}) {
  const width = size === "sm" ? 72 : 112
  const height = size === "sm" ? 24 : 36
  const logoClassName = cn(
    "w-auto object-contain",
    size === "sm" ? "max-h-6" : "max-h-9",
  )
  const inner = (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-xl border border-zinc-200/80 bg-white shadow-sm",
        "dark:border-zinc-200/20 dark:bg-white",
        size === "sm" ? "h-10 min-w-10 px-2.5" : "h-14 min-w-14 px-3.5",
        grayscale &&
          "grayscale transition-[filter] duration-200 hover:grayscale-0",
      )}
    >
      {isRasterLogo(sponsor.logoUrl) ? (
        <Image
          src={sponsor.logoUrl}
          alt={sponsor.name}
          width={width}
          height={height}
          className={logoClassName}
        />
      ) : (
        // SVG u otros: mismo origen para que el SW viejo no los marque 502 Opaque.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={storyImageSrc(sponsor.logoUrl) ?? sponsor.logoUrl}
          alt={sponsor.name}
          className={logoClassName}
        />
      )}
    </span>
  )

  if (!sponsor.websiteUrl) {
    return (
      <span title={sponsor.name} className="inline-flex">
        {inner}
      </span>
    )
  }

  return (
    <a
      href={sponsor.websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={sponsor.name}
      className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {inner}
    </a>
  )
}

export function SponsorGrid({
  sponsors,
  heading,
  size = "md",
  grayscale = false,
  className,
}: {
  sponsors: PublicSponsor[]
  heading?: string
  size?: "sm" | "md"
  grayscale?: boolean
  className?: string
}) {
  if (sponsors.length === 0) return null

  return (
    <section className={cn("space-y-3", className)} aria-label={heading ?? "Sponsors"}>
      {heading ? (
        <p
          className={cn(
            "font-semibold uppercase tracking-[0.16em] text-muted-foreground",
            size === "sm" ? "text-[10px]" : "text-xs",
          )}
        >
          {heading}
        </p>
      ) : null}
      <div
        className={cn(
          "flex flex-wrap items-center",
          size === "sm" ? "gap-2" : "gap-3",
        )}
      >
        {sponsors.map((sponsor) => (
          <SponsorLogo
            key={sponsor.id}
            sponsor={sponsor}
            size={size}
            grayscale={grayscale}
          />
        ))}
      </div>
    </section>
  )
}

export function SponsorMarquee({
  sponsors,
  title = "Empresas corporativas que confían en la tecnología TokePass",
}: {
  sponsors: PublicSponsor[]
  title?: string
}) {
  if (sponsors.length === 0) return null

  const loop = sponsors.length < 8 ? [...sponsors, ...sponsors] : sponsors
  const track = [...loop, ...loop]

  return (
    <section className="mt-16 space-y-6 sm:mt-20" aria-label={title}>
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
          Partners
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
          {title}
        </h2>
      </div>
      <div className="relative overflow-hidden py-2">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#f4f2f8] to-transparent dark:from-[#030712] sm:w-20"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#f4f2f8] to-transparent dark:from-[#030712] sm:w-20"
          aria-hidden
        />
        <div className="tokepass-marquee-track flex w-max items-center gap-4 pr-4">
          {track.map((sponsor, index) => (
            <SponsorLogo
              key={`${sponsor.id}-${index}`}
              sponsor={sponsor}
              size="md"
              grayscale
            />
          ))}
        </div>
      </div>
    </section>
  )
}
