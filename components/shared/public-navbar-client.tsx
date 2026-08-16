"use client"

import { UserRound } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { AccountAvatarMenu } from "@/components/account/account-avatar-menu"
import { MobileAccountAvatarLink } from "@/components/account/mobile-account-avatar-link"
import { PublicMobileNav } from "@/components/navigation/public-mobile-nav"
import { BrandLogo } from "@/components/shared/brand-logo"
import { NavbarSearch } from "@/components/shared/navbar-search"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { cn } from "@/lib/utils"

const navLinkClass =
  "shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white"

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
  const pathname = usePathname()
  const isHome = pathname === "/"
  const exploreHref = isHome ? "#discovery-results" : "/"

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:h-[4.25rem] sm:gap-3 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
          <PublicMobileNav isAuthenticated={isAuthenticated} />
          <BrandLogo size="header" className="min-w-0 truncate" />
        </div>

        <nav
          className="hidden shrink-0 items-center justify-center gap-1 lg:flex lg:gap-2"
          aria-label="Principal"
        >
          <Link href={exploreHref} className={navLinkClass}>
            Explorar
          </Link>
          <Link href="/buscar" className={navLinkClass}>
            Buscar
          </Link>
          {!isAuthenticated ? (
            <Link
              href="/login?next=/cuenta/entradas"
              className={navLinkClass}
            >
              Mis Entradas
            </Link>
          ) : null}
          <Link
            href="/login-organizador"
            className={cn(
              navLinkClass,
              "border border-violet-300/70 text-violet-700 hover:bg-violet-50 dark:border-violet-400/40 dark:text-violet-200 dark:hover:bg-violet-500/10",
            )}
          >
            Organizar Eventos
          </Link>
        </nav>

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <NavbarSearch />

          <ThemeToggle
            className={cn(
              "hidden size-11 shrink-0 place-items-center rounded-full border border-zinc-200 text-zinc-600 lg:grid",
              "hover:bg-zinc-100 hover:text-zinc-900",
              "dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white",
            )}
            compact
          />

          {isAuthenticated ? (
            <>
              <MobileAccountAvatarLink
                initials={userInitials}
                avatarUrl={avatarUrl}
              />
              <AccountAvatarMenu
                initials={userInitials}
                label={userLabel}
                email={userEmail}
                avatarUrl={avatarUrl}
              />
            </>
          ) : (
            <Link
              href="/login"
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold text-white sm:h-10 sm:px-4",
                "bg-gradient-to-r from-violet-600 to-fuchsia-600",
                "shadow-sm transition hover:from-violet-500 hover:to-fuchsia-500",
              )}
            >
              <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">Ingresar</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
