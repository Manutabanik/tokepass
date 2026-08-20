"use client"

import { LogOut } from "lucide-react"
import { useTransition } from "react"

import { signOut } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { clearClientSessionArtifacts } from "@/lib/session-cleanup"

export function SignOutButton({
  className,
  showLabel = true,
  label = "Salir",
}: {
  className?: string
  showLabel?: boolean
  label?: string
}) {
  const [isPending, startTransition] = useTransition()

  function handleSignOut() {
    startTransition(async () => {
      try {
        await clearClientSessionArtifacts()
      } catch {
        // Logout debe continuar aunque falle IndexedDB / SW.
      }
      await signOut()
    })
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="lg"
      disabled={isPending}
      onClick={handleSignOut}
      className={
        className ??
        "rounded-full text-zinc-300 hover:bg-white/5 hover:text-white"
      }
    >
      <LogOut aria-hidden="true" />
      {showLabel ? <span>{label}</span> : null}
    </Button>
  )
}
