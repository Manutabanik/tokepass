import type { Metadata } from "next"
import { ShieldCheck } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyStaffRoles } from "@/app/actions/event-staff"
import { AdminMobileNav } from "@/components/shared/admin-mobile-nav"
import { AdminSidebar } from "@/components/shared/admin-sidebar"
import { BrandLogo } from "@/components/shared/brand-logo"
import { SignOutButton } from "@/components/shared/sign-out-button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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

  // P29 aún no aplicada: reintentar sin columnas nuevas.
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
    <div className="dark min-h-screen bg-[#0c0c0f] text-zinc-100">
      <div className="flex min-h-screen">
        <AdminSidebar mode={mode} staffRoles={staffRoles} />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/8 bg-[#0c0c0f]/85 px-5 backdrop-blur-xl sm:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <AdminMobileNav
                mode={mode}
                staffRoles={staffRoles}
                orgLabel={orgLabel}
                userLabel={userLabel}
                userEmail={resolvedProfile.email}
              />
              <BrandLogo inverted />
            </div>
            <div className="hidden lg:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                {isOrganizer ? "Tu Panel" : "Acceso staff"}
              </p>
              <p className="text-sm text-zinc-400">
                {isOrganizer
                  ? "Panel del organizador"
                  : "Acceso limitado a puerta / barra / caja"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/admin/scanner"
                className="hidden items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400 sm:flex"
              >
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Escáner
              </Link>
              <div className="hidden text-right sm:block">
                <p className="max-w-48 truncate text-sm font-medium text-white">
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
                <AvatarFallback className="bg-violet-500/15 text-violet-300">
                  {initials || "AD"}
                </AvatarFallback>
              </Avatar>
              <SignOutButton
                showLabel={false}
                className="hidden size-9 place-items-center rounded-xl border border-white/8 text-zinc-500 transition hover:border-white/15 hover:bg-white/5 hover:text-white sm:grid"
              />
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1600px] p-5 sm:p-8 lg:p-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
