"use client"

import { Heart, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition, type MouseEvent } from "react"
import { toast } from "sonner"

import { toggleFavoriteEvent } from "@/app/actions/favorites"
import { Button } from "@/components/ui/button"
import { invalidateFavoriteIdsCache } from "@/lib/favorite-ids-cache"
import { cn } from "@/lib/utils"

export function FavoriteToggleButton({
  eventId,
  initiallyFavorited = false,
  isAuthenticated = true,
  className,
  size = "icon",
  tone = "overlay",
}: {
  eventId: string
  initiallyFavorited?: boolean
  isAuthenticated?: boolean
  className?: string
  size?: "icon" | "pill"
  tone?: "overlay" | "bar"
}) {
  const router = useRouter()
  const [favorited, setFavorited] = useState(initiallyFavorited)
  const [pending, startTransition] = useTransition()

  function handleClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()

    if (!isAuthenticated) {
      router.push(`/login?next=/events/${eventId}`)
      return
    }

    startTransition(async () => {
      const previous = favorited
      setFavorited(!previous)
      const result = await toggleFavoriteEvent(eventId)
      if (!result.success) {
        setFavorited(previous)
        if (result.error === "auth_required") {
          router.push(`/login?next=/events/${eventId}`)
          return
        }
        toast.error(result.error)
        return
      }
      setFavorited(result.favorited)
      invalidateFavoriteIdsCache()
      toast.success(
        result.favorited ? "Guardado en favoritos" : "Quitado de favoritos",
      )
      router.refresh()
    })
  }

  if (size === "pill") {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={handleClick}
        className={cn(
          "min-h-12 rounded-xl border-white/15 bg-white/5 text-white transition-all duration-300 hover:scale-105 hover:bg-white/10 active:scale-90",
          favorited && "border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.35)]",
          className,
        )}
        aria-pressed={favorited}
      >
        {pending ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <Heart
            className={cn(
              "size-4 transition-transform duration-300",
              favorited &&
                "fill-red-500 text-red-500 motion-safe:animate-favorite-pop",
            )}
          />
        )}
        {favorited ? "En favoritos" : "Guardar favorito"}
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      disabled={pending}
      aria-label={favorited ? "Quitar de favoritos" : "Guardar favorito"}
      aria-pressed={favorited}
      className={cn(
        "transition-all duration-300 hover:scale-110 active:scale-75",
        tone === "bar"
          ? "size-10 rounded-full border border-border bg-background p-2.5 text-foreground shadow-none hover:bg-muted"
          : "size-12 rounded-full border border-white/10 bg-black/40 p-2.5 text-white shadow-lg shadow-black/30 backdrop-blur-md hover:bg-black/60",
        favorited &&
          "text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]",
        className,
      )}
      onClick={handleClick}
    >
      {pending ? (
        <LoaderCircle className="size-5 animate-spin" />
      ) : (
        <Heart
          className={cn(
            "size-5 transition-transform duration-300",
            favorited &&
              "scale-110 fill-current text-red-500 drop-shadow-md motion-safe:animate-favorite-pop",
          )}
          aria-hidden="true"
        />
      )}
    </Button>
  )
}
