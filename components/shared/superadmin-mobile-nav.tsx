"use client"

import { Menu } from "lucide-react"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { AdminNavTree } from "@/components/shared/admin-nav-tree"
import { BrandLogo } from "@/components/shared/brand-logo"
import { PwaInstallNavButton } from "@/components/pwa/pwa-install-nav-button"
import { SignOutButton } from "@/components/shared/sign-out-button"
import {
  SUPERADMIN_NAV_GROUPS,
  isSuperAdminNavActive,
} from "@/components/shared/superadmin-nav"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export {
  SUPERADMIN_NAV,
  SUPERADMIN_NAV_GROUPS,
} from "@/components/shared/superadmin-nav"

export function SuperAdminMobileNav({
  userLabel,
  userEmail,
}: {
  userLabel: string
  userEmail: string
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-12 min-h-12 min-w-12 text-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Abrir menú"
          />
        }
      >
        <Menu className="size-6" strokeWidth={2.25} />
      </SheetTrigger>
      <SheetContent
        side="left"
        overlayClassName="z-[70]"
        className="z-[70] flex h-dvh flex-col p-0 md:hidden"
      >
        <SheetHeader>
          <BrandLogo href="/superadmin" />
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          <SheetDescription>Panel de control</SheetDescription>
          <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Dueño de la Plataforma
            </p>
            <p className="mt-1 truncate text-sm font-medium text-foreground">
              {userLabel}
            </p>
            <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
          <AdminNavTree
            groups={SUPERADMIN_NAV_GROUPS}
            pathname={pathname}
            accent="sky"
            isActive={isSuperAdminNavActive}
            ariaLabel="Menú móvil"
            onNavigate={() => setOpen(false)}
          />
          <PwaInstallNavButton
            variant="nav"
            className="mt-3 min-h-14 px-3 py-4 text-base"
            onAction={() => setOpen(false)}
          />
        </div>

        <SheetFooter className="gap-3">
          <div className="text-left">
            <p className="truncate text-sm font-medium text-foreground">
              {userLabel}
            </p>
            <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
          </div>
          <SignOutButton
            label="Cerrar Sesión"
            className="min-h-12 h-12 w-full justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
