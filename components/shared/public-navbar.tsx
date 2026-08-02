import { Ticket, UserRound } from "lucide-react"
import Link from "next/link"

import { BrandLogo } from "@/components/shared/brand-logo"
import { SignOutButton } from "@/components/shared/sign-out-button"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export async function PublicNavbar() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full",
        "border-b border-white/10 bg-slate-950/80 backdrop-blur-2xl",
        "shadow-[0_4px_30px_rgba(0,0,0,0.5)] transition-all duration-300",
      )}
    >
      <div className="mx-auto flex h-[4.75rem] max-w-7xl items-center justify-between px-4 sm:h-[5.25rem] lg:px-8">
        <div className="flex min-w-0 items-center">
          <BrandLogo inverted size="header" className="shrink-0" />

          <nav
            className="ml-7 hidden items-center gap-7 md:flex lg:ml-10 lg:gap-8"
            aria-label="Principal"
          >
            <Link
              href="/events"
              className="text-sm font-medium text-white transition-colors hover:text-violet-300"
            >
              Explorar
            </Link>
            <Link
              href="/my-tickets"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              <Ticket className="size-4" aria-hidden="true" />
              Mis Entradas
            </Link>
            <Link
              href="/login-organizador"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-purple-300 transition-colors hover:bg-white/10"
            >
              Organizar Eventos
            </Link>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
          <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 lg:flex">
            <span
              className="size-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
              aria-hidden="true"
            />
            Offline Ready
          </div>

          {user ? (
            <>
              <Link
                href="/my-tickets"
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white sm:px-5",
                  "bg-gradient-to-r from-purple-600 to-indigo-600",
                  "shadow-[0_0_15px_rgba(147,51,234,0.3)]",
                  "transition-all hover:from-purple-500 hover:to-indigo-500 active:scale-95",
                )}
              >
                <UserRound className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Mi Cuenta</span>
                <span className="sm:hidden">Cuenta</span>
              </Link>
              <SignOutButton
                showLabel={false}
                className="hidden rounded-full text-slate-400 hover:bg-white/5 hover:text-white md:inline-flex"
              />
            </>
          ) : (
            <Link
              href="/login"
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white sm:px-5",
                "bg-gradient-to-r from-purple-600 to-indigo-600",
                "shadow-[0_0_15px_rgba(147,51,234,0.3)]",
                "transition-all hover:from-purple-500 hover:to-indigo-500 active:scale-95",
              )}
            >
              <UserRound className="size-4" aria-hidden="true" />
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
