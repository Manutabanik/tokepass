"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

export function ThemeToggle({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      disabled={!mounted}
      aria-label={
        !mounted
          ? "Cambiar tema"
          : isDark
            ? "Activar modo claro"
            : "Activar modo oscuro"
      }
      title={
        !mounted ? "Tema" : isDark ? "Modo claro" : "Modo oscuro"
      }
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full border transition",
        "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100",
        "dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
        "disabled:opacity-60",
        compact && "size-8",
        className,
      )}
    >
      {!mounted ? (
        <span className="size-4 rounded-full bg-zinc-300 dark:bg-zinc-600" />
      ) : isDark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </button>
  )
}
