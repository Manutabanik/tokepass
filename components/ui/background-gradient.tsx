"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function BackgroundGradient({
  children,
  className,
  containerClassName,
  variant = "featured",
}: {
  children?: ReactNode
  className?: string
  containerClassName?: string
  variant?: "featured" | "subtle"
  animate?: boolean
}) {
  if (variant === "subtle") {
    return (
      <div
        className={cn("group relative w-full max-w-full overflow-hidden", containerClassName)}
      >
        <div
          className="pointer-events-none absolute -inset-2 z-0 rounded-3xl bg-gradient-to-r from-emerald-500/20 via-primary/10 to-purple-500/20 opacity-20 blur-xl transition-opacity duration-500 group-hover:opacity-70"
          aria-hidden="true"
        />
        <div className={cn("relative z-10 w-full", className)}>{children}</div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group relative w-full min-w-0 max-w-full overflow-hidden",
        containerClassName,
      )}
    >
      <div
        className="pointer-events-none absolute -top-10 -left-10 z-0 size-96 rounded-full bg-[#10b981] opacity-70 blur-[70px] motion-safe:animate-pulse dark:opacity-60"
        style={{ animationDuration: "5s" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-10 -bottom-10 z-0 size-[30rem] rounded-full bg-[#a855f7] opacity-60 blur-[90px] motion-safe:animate-pulse dark:opacity-50"
        style={{ animationDuration: "7s" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -top-12 -right-8 z-0 size-72 rounded-full bg-[#0ea5e9] opacity-50 blur-[60px] dark:opacity-40"
        aria-hidden="true"
      />
      <div className={cn("relative z-10 w-full rounded-3xl shadow-2xl", className)}>
        {children}
      </div>
    </div>
  )
}
