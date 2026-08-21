"use client"

import { UserRound } from "lucide-react"
import Link from "next/link"

import { AccountAvatarMenu } from "@/components/account/account-avatar-menu"
import { BrandLogo } from "@/components/shared/brand-logo"
import { NavbarSearch } from "@/components/shared/navbar-search"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { cn } from "@/lib/utils"

export function PublicNavbarClient({
  isAuthenticated,
  userLabel = "Mi cuenta",
  userEmail = "",
  userInitials = "?",
  avatarUrl = null,
}: {
  isAuthenticated: boolean
  userLabel?: string
  userEmail?: string
  userInitials?: string
  avatarUrl?: string | null
}) {
  return (
    <>
      <header
        className={cn(
          "navbar no-print fixed top-0 z-50 w-full border-b border-border/50",
          "bg-background/80 backdrop-blur-md",
          "pt-[max(env(safe-area-inset-top),1rem)]",
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-4 sm:gap-3 lg:px-8">
          <div className="flex shrink-0 items-center">
            <BrandLogo
              href="/"
              size="header"
              markOnly
              className="sm:hidden"
            />
            <BrandLogo
              href="/"
              size="header"
              className="hidden min-w-0 truncate sm:inline-flex"
            />
          </div>

          <div className="flex min-w-0 flex-1 justify-center">
            <NavbarSearch />
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              href="/organizar-eventos"
              className="hidden whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-50 lg:inline-flex dark:text-violet-200 dark:hover:bg-violet-500/10"
            >
              Organizar
            </Link>

            <ThemeToggle
              className={cn(
                "inline-flex size-11 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-zinc-600 shadow-none",
                "hover:bg-zinc-100 hover:text-zinc-900",
                "dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white",
              )}
              compact
            />

            {isAuthenticated ? (
              <AccountAvatarMenu
                initials={userInitials}
                label={userLabel}
                email={userEmail}
                avatarUrl={avatarUrl}
              />
            ) : (
              <Link
                href="/login"
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold text-white sm:h-10 sm:px-4",
                  "bg-gradient-to-r from-violet-600 to-fuchsia-600",
                  "shadow-sm transition hover:from-violet-500 hover:to-fuchsia-500",
                )}
              >
                <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="sm:hidden">Ingresar</span>
                <span className="hidden sm:inline">Ingresar a mi cuenta</span>
              </Link>
            )}
          </div>
        </div>
      </header>
    </>
  )
}
