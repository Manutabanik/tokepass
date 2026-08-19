"use client"

import {
  CalendarPlus,
  Compass,
  Menu,
  Search,
  Ticket,
  User,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { PwaInstallNavButton } from "@/components/pwa/pwa-install-nav-button"
import { BrandLogo } from "@/components/shared/brand-logo"
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

type PublicMobileNavProps = {
  isAuthenticated: boolean
}

const ITEMS = [
  { href: "/", label: "Inicio", icon: Compass, match: (path: string) => path === "/" },
  {
    href: "/buscar",
    label: "Buscar",
    icon: Search,
    match: (path: string) =>
      path === "/buscar" || path.startsWith("/buscar/"),
  },
  {
    href: "/mis-entradas",
    label: "Mis Entradas",
    icon: Ticket,
    match: (path: string) =>
      path.startsWith("/mis-entradas") ||
      path.startsWith("/cuenta/entradas") ||
      path.startsWith("/profile/tickets"),
    guestHref: "/login?next=/mis-entradas",
  },
  {
    href: "/perfil",
    label: "Perfil",
    icon: User,
    match: (path: string) =>
      path === "/perfil" ||
      path === "/cuenta" ||
      path.startsWith("/cuenta/perfil"),
    guestHref: "/login?next=/perfil",
  },
  {
    href: "/organizar-eventos",
    label: "Organizar Eventos",
    icon: CalendarPlus,
    match: (path: string) =>
      path.startsWith("/organizar-eventos") ||
      path.startsWith("/organizadores") ||
      path.startsWith("/login-organizador") ||
      path.startsWith("/admin"),
  },
] as const

export function PublicMobileNav({ isAuthenticated }: PublicMobileNavProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [menuPath, setMenuPath] = useState(pathname)
  if (pathname !== menuPath) {
    setMenuPath(pathname)
    if (open) setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-foreground lg:hidden"
            aria-label="Abrir menú"
          />
        }
      >
        <Menu className="size-5" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <SheetHeader>
          <BrandLogo href="/" size="md" />
          <SheetTitle className="sr-only">Navegacion</SheetTitle>
          <SheetDescription className="sr-only">
            Menu principal de TokePass
          </SheetDescription>
        </SheetHeader>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Menu movil">
          {ITEMS.map((item) => {
            const href =
              "guestHref" in item && !isAuthenticated ? item.guestHref : item.href
            const active = item.match(pathname)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                  active
                    ? "bg-primary/12 font-semibold text-primary ring-1 ring-inset ring-primary/20"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
          <PwaInstallNavButton
            variant="nav"
            onAction={() => setOpen(false)}
          />
        </nav>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border p-4">
          <p className="text-sm font-medium text-foreground">Apariencia</p>
          <ThemeToggle />
        </div>
      </SheetContent>
    </Sheet>
  )
}
