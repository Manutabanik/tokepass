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
}: {
  eventId: string
  initiallyFavorited?: boolean
  isAuthenticated?: boolean
  className?: string
  size?: "icon" | "pill"
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
          "min-h-12 rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10",
          className,
        )}
        aria-pressed={favorited}
      >
        {pending ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <Heart
            className={cn("size-4", favorited && "fill-rose-500 text-rose-500")}
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
        "size-12 rounded-full border-0 bg-black/45 text-white shadow-lg shadow-black/30 backdrop-blur-md hover:bg-black/60",
        className,
      )}
      onClick={handleClick}
    >
      {pending ? (
        <LoaderCircle className="size-5 animate-spin" />
      ) : (
        <Heart
          className={cn("size-5", favorited && "fill-rose-500 text-rose-500")}
          aria-hidden="true"
        />
      )}
    </Button>
  )
}
