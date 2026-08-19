"use client"

import { Menu } from "@base-ui/react/menu"
import {
  Bell,
  Download,
  Heart,
  LogOut,
  Receipt,
  ShoppingBag,
  Smartphone,
  Ticket,
  UserRound,
} from "lucide-react"
import { useTransition } from "react"

import { signOut } from "@/app/actions/auth"
import { NotificationDot } from "@/components/account/notification-dot"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { usePwaInstall } from "@/hooks/use-pwa-install"
import { useUserNotifications } from "@/hooks/use-user-notifications"
import { clearClientSessionArtifacts } from "@/lib/session-cleanup"
import { cn } from "@/lib/utils"

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
  const { hasUnread } = useUserNotifications()
  const { canShowInstallCta, isIos, promptInstall } = usePwaInstall()
  const InstallIcon = isIos ? Smartphone : Download

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

  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          "relative inline-flex size-11 items-center justify-center rounded-full outline-none",
          "ring-1 ring-border transition hover:bg-muted",
          "focus-visible:ring-2 focus-visible:ring-emerald-400",
          "hidden md:inline-flex",
        )}
        aria-label={
          hasUnread
            ? `Menú de ${label}. Tenés notificaciones sin leer`
            : `Menú de ${label}`
        }
      >
        <Avatar size="default" className="size-10 bg-emerald-500/15">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-gradient-to-br from-emerald-500/30 to-teal-500/20 text-sm font-bold text-emerald-900 dark:text-emerald-100">
            {initials}
          </AvatarFallback>
        </Avatar>
        <NotificationDot show={hasUnread} />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50">
          <Menu.Popup
            className={cn(
              "min-w-64 origin-[var(--transform-origin)] rounded-2xl border p-1.5 shadow-xl outline-none",
              "border-border bg-popover text-popover-foreground",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
              "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            )}
          >
            <div className="border-b border-border px-3 py-2.5">
              <p className="truncate text-sm font-semibold">{label}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {email || "Tu cuenta TokePass"}
              </p>
            </div>

            <Menu.LinkItem
              href="/cuenta/notificaciones"
              closeOnClick
              className={menuItemClass}
            >
              <span className="relative inline-flex">
                <Bell className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                <NotificationDot
                  show={hasUnread}
                  className="-right-1 -top-1 size-2 ring-1"
                />
              </span>
              Notificaciones
            </Menu.LinkItem>
            <Menu.LinkItem
              href="/cuenta/entradas"
              closeOnClick
              className={menuItemClass}
            >
              <Ticket className="size-4 shrink-0 opacity-70" aria-hidden="true" />
              Mi Billetera
            </Menu.LinkItem>
            <Menu.LinkItem
              href="/cuenta/entradas?tab=extras"
              closeOnClick
              className={menuItemClass}
            >
              <ShoppingBag
                className="size-4 shrink-0 opacity-70"
                aria-hidden="true"
              />
              Mis Extras / Consumiciones
            </Menu.LinkItem>
            <Menu.LinkItem
              href="/cuenta/compras"
              closeOnClick
              className={menuItemClass}
            >
              <Receipt className="size-4 shrink-0 opacity-70" aria-hidden="true" />
              Mis compras
            </Menu.LinkItem>
            <Menu.LinkItem
              href="/cuenta/favoritos"
              closeOnClick
              className={menuItemClass}
            >
              <Heart className="size-4 shrink-0 opacity-70" aria-hidden="true" />
              Favoritos
            </Menu.LinkItem>
            <Menu.LinkItem
              href="/cuenta/perfil"
              closeOnClick
              className={menuItemClass}
            >
              <UserRound
                className="size-4 shrink-0 opacity-70"
                aria-hidden="true"
              />
              Mi Perfil y Datos
            </Menu.LinkItem>

            {canShowInstallCta ? (
              <Menu.Item
                onClick={() => void promptInstall()}
                className={menuItemClass}
              >
                <InstallIcon
                  className="size-4 shrink-0 opacity-70"
                  aria-hidden="true"
                />
                Instalar App
              </Menu.Item>
            ) : null}

            <div className="my-1 h-px bg-border" />

            <Menu.Item
              disabled={pending}
              onClick={handleSignOut}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none",
                "text-rose-700 data-highlighted:bg-rose-500/10",
                "dark:text-rose-300",
              )}
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              Cerrar sesión
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

const menuItemClass = cn(
  "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium outline-none no-underline",
  "text-foreground data-highlighted:bg-muted",
)
