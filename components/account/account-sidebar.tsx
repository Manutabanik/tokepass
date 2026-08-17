"use client"

import {
  Bell,
  Heart,
  Home,
  LogOut,
  Receipt,
  Ticket,
  UserRound,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTransition } from "react"

import { signOut } from "@/app/actions/auth"
import { NotificationDot } from "@/components/account/notification-dot"
import { Button } from "@/components/ui/button"
import { useUserNotifications } from "@/hooks/use-user-notifications"
import { getInitials } from "@/lib/format"
import { clearClientSessionArtifacts } from "@/lib/session-cleanup"
import { cn } from "@/lib/utils"

export const ACCOUNT_NAV_LINKS = [
  { href: "/cuenta", label: "Inicio", icon: Home, exact: true },
  { href: "/cuenta/entradas", label: "Entradas", icon: Ticket, exact: false },
  { href: "/cuenta/compras", label: "Compras", icon: Receipt, exact: false },
  { href: "/cuenta/favoritos", label: "Favoritos", icon: Heart, exact: false },
  {
    href: "/cuenta/notificaciones",
    label: "Avisos",
    icon: Bell,
    exact: false,
  },
  { href: "/cuenta/perfil", label: "Perfil", icon: UserRound, exact: false },
] as const

export type AccountNavProfile = {
  email: string
  fullName: string
  avatarUrl: string | null
}

function isActivePath(
  pathname: string,
  href: string,
  exact: boolean,
): boolean {
  if (href === "/cuenta/entradas" && pathname.startsWith("/profile/tickets")) {
    return true
  }
  return exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`)
}

function useNavDots() {
  const { unreadByTab, hasUnread } = useUserNotifications()

  return function showDot(href: string) {
    if (href === "/cuenta/entradas") return unreadByTab.entradas
    if (href === "/cuenta/compras") return unreadByTab.compras
    if (href === "/cuenta/perfil") return unreadByTab.perfil
    if (href === "/cuenta/notificaciones") return hasUnread
    return false
  }
}

/** Pills horizontales: tablet. En phone usa bottom nav; en lg+ el sidebar. */
export function AccountPillsNav() {
  const pathname = usePathname()
  const showDot = useNavDots()

  return (
    <nav
      className="mb-6 hidden flex-wrap gap-2 md:flex md:justify-center lg:hidden"
      aria-label="Secciones de Mi cuenta"
    >
      {ACCOUNT_NAV_LINKS.map(({ href, label, icon: Icon, exact }) => {
        const active = isActivePath(pathname, href, exact)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition",
              active
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                : "border-border text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
            <NotificationDot
              show={showDot(href)}
              className="right-1.5 top-1.5 size-2 ring-1 ring-background"
            />
          </Link>
        )
      })}
    </nav>
  )
}

export function AccountSidebar({ profile }: { profile: AccountNavProfile }) {
  const pathname = usePathname()
  const showDot = useNavDots()
  const [isPending, startTransition] = useTransition()
  const displayName = profile.fullName || profile.email.split("@")[0] || "Vos"

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
    <aside className="hidden lg:sticky lg:top-24 lg:flex lg:h-fit lg:flex-col lg:gap-6">
      <div className="rounded-2xl border border-border/50 bg-card/80 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-emerald-500/15 text-base font-bold text-emerald-700 ring-1 ring-emerald-400/25 dark:text-emerald-300">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              getInitials(profile.fullName, profile.email)
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">
              {displayName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile.email}
            </p>
          </div>
        </div>
      </div>

      <nav
        className="flex flex-col gap-1"
        aria-label="Secciones de Mi cuenta"
      >
        {ACCOUNT_NAV_LINKS.map(({ href, label, icon: Icon, exact }) => {
          const active = isActivePath(pathname, href, exact)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                active
                  ? "bg-emerald-500/10 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
              <NotificationDot
                show={showDot(href)}
                className="right-3 top-1/2 size-2 -translate-y-1/2 ring-1 ring-background"
              />
            </Link>
          )
        })}
      </nav>

      <Button
        type="button"
        variant="ghost"
        disabled={isPending}
        onClick={handleSignOut}
        className="mt-auto h-auto w-full justify-start gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <LogOut className="size-4 shrink-0" aria-hidden="true" />
        Cerrar sesión
      </Button>
    </aside>
  )
}
