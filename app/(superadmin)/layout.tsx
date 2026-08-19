import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { SuperAdminMobileNav } from "@/components/shared/superadmin-mobile-nav"
import { SuperAdminSidebar } from "@/components/shared/superadmin-sidebar"
import { SignOutButton } from "@/components/shared/sign-out-button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { BrandLogo } from "@/components/shared/brand-logo"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { createClient } from "@/lib/supabase/server"
import { getInitials } from "@/lib/format"

export const metadata: Metadata = {
  title: {
    default: "Panel de control",
    template: "%s · TokePass",
  },
  robots: { index: false, follow: false },
}

export default async function SuperAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login-organizador")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role !== "super_admin") {
    redirect("/")
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <SuperAdminSidebar />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background/85 pt-[max(env(safe-area-inset-top),1rem)] backdrop-blur-xl">
            <div className="flex h-16 items-center justify-between px-5 sm:px-8">
              <div className="flex min-w-0 items-center gap-2">
                <SuperAdminMobileNav
                  userLabel={profile.full_name || "Dueño de la plataforma"}
                  userEmail={profile.email}
                />
                <BrandLogo href="/superadmin" className="md:hidden" />
                <div className="hidden min-w-0 md:block">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    Panel de control
                    <span className="rounded-full border border-sky-500/20 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                      Dueño de la Plataforma
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Panel de Control Central
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <ThemeToggle />
                <div className="hidden text-right sm:block">
                  <p className="max-w-48 truncate text-sm font-medium text-foreground">
                    {profile.full_name || "Dueño de la plataforma"}
                  </p>
                  <p className="max-w-48 truncate text-xs text-muted-foreground">
                    {profile.email}
                  </p>
                </div>
                <Avatar>
                  <AvatarFallback className="bg-gradient-to-br from-sky-500/25 to-indigo-500/25 text-sky-800 dark:text-sky-200">
                    {getInitials(profile.full_name, profile.email)}
                  </AvatarFallback>
                </Avatar>
                <SignOutButton
                  showLabel={false}
                  className="grid size-11 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground sm:size-9"
                />
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1600px] px-5 pt-5 sm:px-8 sm:pt-8 lg:px-10 lg:pt-10 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
