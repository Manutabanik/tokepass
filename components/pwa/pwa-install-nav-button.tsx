"use client"

import { Download, Smartphone } from "lucide-react"

import { usePwaInstall } from "@/hooks/use-pwa-install"
import { cn } from "@/lib/utils"

export function PwaInstallNavButton({
  variant = "nav",
  className,
  onAction,
}: {
  variant?: "nav" | "sidebar" | "icon" | "menu"
  className?: string
  onAction?: () => void
}) {
  const { canShowInstallCta, isIos, promptInstall } = usePwaInstall()

  if (!canShowInstallCta) return null

  const Icon = isIos ? Smartphone : Download

  async function handleClick() {
    onAction?.()
    await promptInstall()
  }

  const label = "Instalar App"

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={() => void handleClick()}
        title={label}
        aria-label="Descargar TokePass"
        className={cn(
          "grid size-11 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground",
          className,
        )}
      >
        <Icon className="size-[18px]" aria-hidden="true" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      aria-label="Descargar TokePass"
      className={cn(
        "flex items-center gap-3 text-sm font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-foreground",
        variant === "nav" && "h-12 w-full rounded-xl px-3",
        variant === "sidebar" && "h-11 w-full rounded-xl px-3",
        variant === "menu" &&
          "h-auto w-full rounded-xl px-3 py-2.5 text-left",
        className,
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      {label}
    </button>
  )
}
