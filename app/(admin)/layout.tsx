import type { Metadata } from "next"
import { ShieldCheck } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyStaffRoles } from "@/app/actions/event-staff"
import { AdminBottomNav } from "@/components/shared/admin-bottom-nav"
import { AdminMain } from "@/components/shared/admin-main"
import { AdminSidebar } from "@/components/shared/admin-sidebar"
import { BrandLogo } from "@/components/shared/brand-logo"
import { SignOutButton } from "@/components/shared/sign-out-button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { OrganizerSupportChat } from "@/components/admin/organizer-support-chat"
import { createClient } from "@/lib/supabase/server"

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
    (isOrganizer ? "Organización TokePass" : "Staff TokePass")
  const userLabel =
    resolvedProfile.public_name?.trim() ||
    resolvedProfile.full_name ||
    (isOrganizer ? "Administrador" : "Staff")
  const mode = isOrganizer ? ("organizer" as const) : ("staff" as const)

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <AdminSidebar mode={mode} staffRoles={staffRoles} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background/85 pt-[max(env(safe-area-inset-top),1rem)] backdrop-blur-xl">
            <div className="flex h-16 items-center justify-between px-4 sm:px-8">
              <div className="flex min-w-0 items-center gap-2 lg:hidden">
                <BrandLogo />
              </div>
              <div className="hidden lg:block">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {isOrganizer ? "Tu panel" : "Acceso staff"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isOrganizer
                    ? "Gestioná tus ventas y eventos"
                    : "Acceso limitado a puerta / barra / caja"}
                </p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <ThemeToggle />
                <Link
                  href="/admin/scanner"
                  className="hidden min-h-11 items-center justify-center gap-2 rounded-full border border-border px-3 py-2 text-xs text-muted-foreground sm:inline-flex"
                >
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Escáner
                </Link>
                <div className="hidden text-right sm:block">
                  <p className="max-w-48 truncate text-sm font-medium text-foreground">
                    {userLabel}
                  </p>
                  <p className="max-w-48 truncate text-xs text-muted-foreground">
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
                  className="hidden size-11 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground sm:grid"
                />
              </div>
            </div>
          </header>
          <AdminMain>{children}</AdminMain>
        </div>
      </div>

      <AdminBottomNav
        mode={mode}
        staffRoles={staffRoles}
        orgLabel={orgLabel}
        userLabel={userLabel}
        userEmail={resolvedProfile.email}
      />
      {isOrganizer ? <OrganizerSupportChat /> : null}
    </div>
  )
}
