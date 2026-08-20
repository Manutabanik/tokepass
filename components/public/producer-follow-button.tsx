"use client"

import { LoaderCircle } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  isFollowingProducer,
  toggleFollowProducer,
} from "@/app/actions/producer-follows"
import { isProducerFollowAuthError } from "@/lib/producer-follows"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { publicProducerPath } from "@/lib/seo/site"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

export function ProducerFollowButton({
  producerId,
  producerName,
  isAuthenticated,
  initiallyFollowing,
  className,
}: {
  producerId: string
  producerName?: string
  isAuthenticated?: boolean
  initiallyFollowing?: boolean
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [following, setFollowing] = useState(Boolean(initiallyFollowing))
  const [signedIn, setSignedIn] = useState(Boolean(isAuthenticated))
  const [authReady, setAuthReady] = useState(typeof isAuthenticated === "boolean")
  const [isSelf, setIsSelf] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const loginNext = pathname || publicProducerPath(producerId)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      initiallyFollowing != null
        ? Promise.resolve(initiallyFollowing)
        : isFollowingProducer(producerId),
      createClient()
        .auth.getUser()
        .then(({ data }) => data.user),
    ]).then(([value, user]) => {
      if (cancelled) return
      setFollowing(value)
      setSignedIn(Boolean(user))
      setAuthReady(true)
      setIsSelf(user?.id === producerId)
    })
    return () => {
      cancelled = true
    }
  }, [initiallyFollowing, producerId])

  function openLogin() {
    setLoginOpen(true)
  }

  function goToLogin() {
    router.push(`/login?next=${encodeURIComponent(loginNext)}`)
  }

  function handleClick() {
    if (!signedIn) {
      openLogin()
      return
    }

    startTransition(async () => {
      const previous = following
      setFollowing(!previous)
      try {
        const result = await toggleFollowProducer(producerId)
        setFollowing(result.following)
        toast.success(
          result.following
            ? `Ahora seguís a ${producerName?.trim() || "esta productora"}`
            : "Dejaste de seguir",
        )
        router.refresh()
      } catch (error) {
        setFollowing(previous)
        if (isProducerFollowAuthError(error)) {
          openLogin()
          return
        }
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo actualizar el seguimiento.",
        )
      }
    })
  }

  if (isSelf) return null

  return (
    <>
      <Button
        type="button"
        variant={following ? "secondary" : "outline"}
        size="sm"
        disabled={pending || !authReady}
        aria-pressed={following}
        onClick={handleClick}
        className={cn("shrink-0 rounded-full border-border", className)}
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
        {following ? "Siguiendo" : "Seguir"}
      </Button>
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Iniciá sesión para seguir</DialogTitle>
            <DialogDescription>
              Necesitás una cuenta para seguir a{" "}
              {producerName?.trim() || "esta productora"} y ver sus próximos
              eventos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLoginOpen(false)}>
              Ahora no
            </Button>
            <Button type="button" onClick={goToLogin}>
              Iniciar sesión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
