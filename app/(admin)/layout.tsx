import type { Metadata } from "next"
import { ShieldCheck } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyStaffRoles } from "@/app/actions/event-staff"
import {
  AdminBottomNav,
  ADMIN_BOTTOM_NAV_SPACE,
} from "@/components/shared/admin-bottom-nav"
import { AdminSidebar } from "@/components/shared/admin-sidebar"
import { BrandLogo } from "@/components/shared/brand-logo"
import { SignOutButton } from "@/components/shared/sign-out-button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login-organizador")
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "email, full_name, public_name, avatar_url, role, organizer_approval_status",
    )
    .eq("id", user.id)
    .maybeSingle()

  const legacyProfile =
    profileError || !profile
      ? (
          await supabase
            .from("profiles")
            .select("email, full_name, role, organizer_approval_status")
            .eq("id", user.id)
            .maybeSingle()
        ).data
      : null

  const resolvedProfile = profile
    ? {
        email: profile.email,
        full_name: profile.full_name,
        public_name: profile.public_name ?? null,
        avatar_url: profile.avatar_url ?? null,
        role: profile.role,
        organizer_approval_status: profile.organizer_approval_status,
      }
    : legacyProfile
      ? {
          email: legacyProfile.email,
          full_name: legacyProfile.full_name,
          public_name: null as string | null,
          avatar_url: null as string | null,
          role: legacyProfile.role,
          organizer_approval_status: legacyProfile.organizer_approval_status,
        }
      : null

  if (resolvedProfile?.organizer_approval_status === "pending") {
    redirect("/register-organizador?pending=1")
  }

  if (
    resolvedProfile?.organizer_approval_status === "rejected" ||
    resolvedProfile?.organizer_approval_status === "suspended"
  ) {
    redirect(
      `/register-organizador?status=${resolvedProfile.organizer_approval_status}`,
    )
  }

  const isOrganizer =
    resolvedProfile?.role === "admin" ||
    resolvedProfile?.role === "super_admin"
  const staffRoles = isOrganizer ? [] : await getMyStaffRoles()
  const isStaff = !isOrganizer && staffRoles.length > 0

  if (!resolvedProfile || (!isOrganizer && !isStaff)) {
    redirect("/")
  }

  const displayName =
    resolvedProfile.public_name?.trim() ||
    resolvedProfile.full_name?.trim() ||
    resolvedProfile.email
  const initials = displayName
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  const orgLabel =
    resolvedProfile.public_name?.trim() ||
    resolvedProfile.full_name?.trim() ||
    (isOrganizer ? "Organización Tokepass" : "Staff Tokepass")
  const userLabel =
    resolvedProfile.public_name?.trim() ||
    resolvedProfile.full_name ||
    (isOrganizer ? "Administrador" : "Staff")
  const mode = isOrganizer ? ("organizer" as const) : ("staff" as const)

  return (
    <div className="min-h-screen bg-slate-50 text-zinc-900 dark:bg-[#0c0c0f] dark:text-zinc-100">
      <div className="flex min-h-screen">
        <AdminSidebar mode={mode} staffRoles={staffRoles} />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/85 px-4 backdrop-blur-xl dark:border-white/8 dark:bg-[#0c0c0f]/85 sm:h-16 sm:px-8">
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <BrandLogo />
            </div>
            <div className="hidden lg:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-600">
                {isOrganizer ? "Tu panel" : "Acceso staff"}
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {isOrganizer
                  ? "Gestioná tus ventas y eventos"
                  : "Acceso limitado a puerta / barra / caja"}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <Link
                href="/admin/scanner"
                className="hidden min-h-11 items-center gap-2 rounded-full border border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-400 sm:inline-flex"
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                Escáner
              </Link>
              <div className="hidden text-right sm:block">
                <p className="max-w-48 truncate text-sm font-medium text-zinc-900 dark:text-white">
                  {userLabel}
                </p>
                <p className="max-w-48 truncate text-xs text-zinc-500">
                  {resolvedProfile.email}
                </p>
              </div>
              <Avatar>
                {resolvedProfile.avatar_url ? (
                  <AvatarImage
                    src={resolvedProfile.avatar_url}
                    alt={userLabel}
                  />
                ) : null}
                <AvatarFallback className="bg-violet-500/15 text-violet-700 dark:text-violet-300">
                  {initials || "AD"}
                </AvatarFallback>
              </Avatar>
              <SignOutButton
                showLabel={false}
                className="hidden size-11 place-items-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/8 dark:hover:border-white/15 dark:hover:bg-white/5 dark:hover:text-white sm:grid"
              />
            </div>
          </header>
          <main
            className={cn(
              "mx-auto w-full max-w-[1600px] p-4 sm:p-8 lg:p-10",
              ADMIN_BOTTOM_NAV_SPACE,
            )}
          >
            {children}
          </main>
        </div>
      </div>

      <AdminBottomNav
        mode={mode}
        staffRoles={staffRoles}
        orgLabel={orgLabel}
        userLabel={userLabel}
        userEmail={resolvedProfile.email}
      />
    </div>
  )
}
