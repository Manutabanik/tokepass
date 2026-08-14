"use client"

/**
 * @deprecated Preferí `StoryFlyerTrigger` / `StoryFlyerSuccessCard`.
 * Compat: compra confirmada → flyer dinámico modo buyer.
 */

import { StoryFlyerTrigger } from "@/components/public/story-flyer-modal"
import { ImagePlus } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  eventTitle: string
  eventImageUrl?: string | null
  customStoryUrl?: string | null
  eventDate?: string
  eventLocation?: string
  buyerName?: string | null
  className?: string
}

export function SocialShareButton({
  eventTitle,
  eventImageUrl,
  customStoryUrl,
  eventDate,
  eventLocation,
  buyerName,
  className,
}: Props) {
  return (
    <StoryFlyerTrigger
      data={{
        eventTitle,
        eventDate: eventDate || new Date().toISOString(),
        eventLocation: eventLocation || "Ver ubicación en Tokepass",
        imageUrl: eventImageUrl,
        customStoryUrl,
        mode: "buyer",
        buyerName,
      }}
      label="Subir mi entrada a Historias"
      icon={<ImagePlus className="size-4 shrink-0" aria-hidden />}
      variant="primary"
      className={cn("w-full rounded-full sm:w-auto", className)}
    />
  )
}
