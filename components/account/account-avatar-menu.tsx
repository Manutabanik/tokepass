"use client"

import {
  Bell,
  Heart,
  LogOut,
  Settings,
  Ticket,
} from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"

import { signOut } from "@/app/actions/auth"
import { NotificationDot } from "@/components/account/notification-dot"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useUserNotifications } from "@/hooks/use-user-notifications"
import { clearClientSessionArtifacts } from "@/lib/session-cleanup"
import { cn } from "@/lib/utils"

const PROFILE_LINKS = [
  {
    href: "/cuenta/entradas",
    label: "Mis Entradas",
    icon: Ticket,
    emphasize: true,
  },
  {
    href: "/cuenta/favoritos",
    label: "Mis Favoritos",
    icon: Heart,
    emphasize: false,
  },
] as const

const ACCOUNT_LINKS = [
  {
    href: "/cuenta/notificaciones",
    label: "Notificaciones",
    icon: Bell,
    notify: true,
  },
  {
    href: "/cuenta/perfil",
    label: "Configuración de la cuenta",
    icon: Settings,
    notify: false,
  },
] as const

export function AccountAvatarMenu({
  initials,
  label,
  email,
  avatarUrl,
}: {
  initials: string
  label: string
  email: string
  avatarUrl?: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [sheetOpen, setSheetOpen] = useState(false)
  const { hasUnread } = useUserNotifications()

  function handleSignOut() {
    startTransition(async () => {
      try {
        await clearClientSessionArtifacts()
      } catch {
        // continuar logout
      }
      await signOut()
    })
  }

  const triggerLabel = hasUnread
    ? `Menú de ${label}. Tenés notificaciones sin leer`
    : `Menú de ${label}`

  const avatar = (
    <span className="relative inline-flex size-11 items-center justify-center">
      <Avatar size="default" className="size-10 bg-emerald-500/15">
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt="" className="object-cover" />
        ) : null}
        <AvatarFallback className="bg-gradient-to-br from-emerald-500/30 to-teal-500/20 text-sm font-bold text-emerald-900 dark:text-emerald-100">
          {initials}
        </AvatarFallback>
      </Avatar>
      <NotificationDot show={hasUnread} />
    </span>
  )

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger
          className={cn(
            "inline-flex size-11 items-center justify-center rounded-full outline-none",
            "ring-1 ring-border transition hover:bg-muted",
            "focus-visible:ring-2 focus-visible:ring-emerald-400",
            "md:hidden",
          )}
          aria-label={triggerLabel}
        >
          {avatar}
        </SheetTrigger>
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl p-0">
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="truncate text-base">{label}</SheetTitle>
            <SheetDescription className="truncate text-xs">
              {email || "Tu cuenta TokePass"}
            </SheetDescription>
          </SheetHeader>
          <nav className="flex flex-col p-2" aria-label="Centro de control">
            {PROFILE_LINKS.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSheetOpen(false)}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm no-underline",
                    item.emphasize
                      ? "font-bold text-foreground"
                      : "font-medium text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                  {item.label}
                </Link>
              )
            })}
            <div className="my-1 h-px bg-border" />
            {ACCOUNT_LINKS.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSheetOpen(false)}
                  className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground no-underline"
                >
                  <span className="relative inline-flex">
                    <Icon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                    {item.notify ? (
                      <NotificationDot
                        show={hasUnread}
                        className="-right-1 -top-1 size-2 ring-1"
                      />
                    ) : null}
                  </span>
                  {item.label}
                </Link>
              )
            })}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              disabled={pending}
              onClick={handleSignOut}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-700 disabled:opacity-60 dark:text-rose-300"
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              Cerrar Sesión
            </button>
          </nav>
        </SheetContent>
      </Sheet>

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "hidden size-11 items-center justify-center rounded-full outline-none md:inline-flex",
            "ring-1 ring-border transition hover:bg-muted",
            "focus-visible:ring-2 focus-visible:ring-emerald-400",
          )}
          aria-label={triggerLabel}
        >
          {avatar}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64 p-1.5">
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{label}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {email || "Tu cuenta TokePass"}
            </p>
          </div>
          {PROFILE_LINKS.map((item) => {
            const Icon = item.icon
            return (
              <DropdownMenuLinkItem
                key={item.href}
                href={item.href}
                className={cn(item.emphasize && "font-bold")}
              >
                <Icon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                {item.label}
              </DropdownMenuLinkItem>
            )
          })}
          <DropdownMenuSeparator />
          {ACCOUNT_LINKS.map((item) => {
            const Icon = item.icon
            return (
              <DropdownMenuLinkItem key={item.href} href={item.href}>
                <span className="relative inline-flex">
                  <Icon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                  {item.notify ? (
                    <NotificationDot
                      show={hasUnread}
                      className="-right-1 -top-1 size-2 ring-1"
                    />
                  ) : null}
                </span>
                {item.label}
              </DropdownMenuLinkItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={pending}
            onClick={handleSignOut}
            className="font-semibold text-rose-700 data-highlighted:bg-rose-500/10 dark:text-rose-300"
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            Cerrar Sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
