"use client"

import {
  CalendarDays,
  Compass,
  Menu,
  Search,
  Ticket,
  UserRound,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { AccountAvatarMenu } from "@/components/account/account-avatar-menu"
import { MobileAccountAvatarLink } from "@/components/account/mobile-account-avatar-link"
import { BrandLogo } from "@/components/shared/brand-logo"
import { SignOutButton } from "@/components/shared/sign-out-button"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { cn } from "@/lib/utils"

const navLinkClass =
  "rounded-full px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white"

const mobileNavLinkClass =
  "flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/5"

function isAccountArea(pathname: string) {
  return pathname === "/cuenta" || pathname.startsWith("/cuenta/")
}

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
  const [menuOpen, setMenuOpen] = useState(false)

  const isHome = pathname === "/"
  const inAccount = isAccountArea(pathname)
  const exploreHref = isHome ? "#discovery-results" : "/events"

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b backdrop-blur-xl",
        "border-zinc-200/70 bg-white/80",
        "dark:border-white/8 dark:bg-[#030712]/80",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:h-[4.25rem] sm:gap-3 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Mobile: menú solo fuera del portal (ahí manda el bottom nav) */}
          {!inAccount || !isAuthenticated ? (
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/5 md:hidden"
                    aria-label="Abrir menú"
                  />
                }
              >
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent
                side="left"
                className="border-zinc-200 bg-white p-0 text-zinc-900 dark:border-white/8 dark:bg-[#09090b] dark:text-zinc-100"
              >
                <SheetHeader className="border-b border-zinc-200 dark:border-white/8">
                  <BrandLogo size="header" />
                  <SheetTitle className="sr-only">Menú</SheetTitle>
                  <SheetDescription className="sr-only">
                    Navegación principal de Tokepass
                  </SheetDescription>
                </SheetHeader>

                <nav
                  className="flex-1 space-y-1 overflow-y-auto p-3"
                  aria-label="Menú móvil"
                >
                  <Link
                    href={exploreHref}
                    onClick={closeMenu}
                    className={mobileNavLinkClass}
                  >
                    <Compass className="size-5 shrink-0" aria-hidden="true" />
                    Explorar
                  </Link>
                  <Link
                    href="/events"
                    onClick={closeMenu}
                    className={mobileNavLinkClass}
                  >
                    <Search className="size-5 shrink-0" aria-hidden="true" />
                    Buscar eventos
                  </Link>
                  <Link
                    href="/events"
                    onClick={closeMenu}
                    className={mobileNavLinkClass}
                  >
                    <CalendarDays
                      className="size-5 shrink-0"
                      aria-hidden="true"
                    />
                    Eventos
                  </Link>
                  {isAuthenticated ? (
                    <>
                      <Link
                        href="/cuenta/entradas"
                        onClick={closeMenu}
                        className={mobileNavLinkClass}
                      >
                        <Ticket
                          className="size-5 shrink-0"
                          aria-hidden="true"
                        />
                        Mis Entradas
                      </Link>
                      <Link
                        href="/cuenta"
                        onClick={closeMenu}
                        className={mobileNavLinkClass}
                      >
                        <UserRound
                          className="size-5 shrink-0"
                          aria-hidden="true"
                        />
                        Mi cuenta
                      </Link>
                    </>
                  ) : (
                    <Link
                      href="/login?next=/cuenta/entradas"
                      onClick={closeMenu}
                      className={mobileNavLinkClass}
                    >
                      <Ticket className="size-5 shrink-0" aria-hidden="true" />
                      Mis Entradas
                    </Link>
                  )}
                  <Link
                    href="/login-organizador"
                    onClick={closeMenu}
                    className={cn(
                      mobileNavLinkClass,
                      "border border-violet-300/70 text-violet-700 dark:border-violet-400/40 dark:text-violet-200",
                    )}
                  >
                    <UserRound className="size-5 shrink-0" aria-hidden="true" />
                    Organizar Eventos
                  </Link>
                </nav>

                <div className="space-y-3 border-t border-zinc-200 p-3 dark:border-white/8">
                  <div className="flex min-h-12 items-center justify-between gap-3 px-1">
                    <span className="text-sm text-zinc-500">Tema</span>
                    <ThemeToggle />
                  </div>
                  {isAuthenticated ? (
                    <SignOutButton className="h-12 w-full justify-center rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white" />
                  ) : (
                    <Link
                      href="/login"
                      onClick={closeMenu}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-sm font-semibold text-white"
                    >
                      <UserRound className="size-4" aria-hidden="true" />
                      Ingresar
                    </Link>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          ) : null}

          <BrandLogo size="header" className="min-w-0 truncate" />
        </div>

        <nav
          className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex lg:gap-2"
          aria-label="Principal"
        >
          <Link href={exploreHref} className={navLinkClass}>
            Explorar
          </Link>
          <Link href="/events" className={navLinkClass}>
            Eventos
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

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Búsqueda y tema: solo desktop; en mobile viven en el drawer */}
          <Link
            href="/events"
            className={cn(
              "hidden size-11 place-items-center rounded-full border border-zinc-200 text-zinc-600 transition md:grid",
              "hover:bg-zinc-100 hover:text-zinc-900",
              "dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white",
            )}
            aria-label="Buscar eventos"
          >
            <Search className="size-4" aria-hidden="true" />
          </Link>

          <ThemeToggle
            className={cn(
              "hidden size-11 place-items-center rounded-full border border-zinc-200 text-zinc-600 md:grid",
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
                "inline-flex h-11 shrink-0 items-center gap-1.5 truncate rounded-full px-3.5 text-sm font-semibold text-white sm:h-10 sm:px-4",
                "bg-gradient-to-r from-violet-600 to-fuchsia-600",
                "shadow-sm transition hover:from-violet-500 hover:to-fuchsia-500",
              )}
            >
              <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Ingresar</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
