import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { SuperAdminSidebar } from "@/components/shared/superadmin-sidebar"
import { SignOutButton } from "@/components/shared/sign-out-button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/server"
import { getInitials } from "@/lib/format"

export const metadata: Metadata = {
  title: {
    default: "Panel de control",
    template: "%s · Tokepass",
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
    <div className="dark min-h-screen bg-[#0b0b0f] text-zinc-100">
      <div className="flex min-h-screen">
        <SuperAdminSidebar />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/8 bg-[#0b0b0f]/85 px-5 backdrop-blur-xl sm:px-8">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                Panel de control
                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                  Dueño de la Plataforma
                </span>
              </p>
              <p className="text-xs text-zinc-600">
                Panel de Control Central
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="max-w-48 truncate text-sm font-medium text-white">
                  {profile.full_name || "Dueño de la plataforma"}
                </p>
                <p className="max-w-48 truncate text-xs text-zinc-500">
                  {profile.email}
                </p>
              </div>
              <Avatar>
                <AvatarFallback className="bg-gradient-to-br from-sky-500/25 to-indigo-500/25 text-sky-200">
                  {getInitials(profile.full_name, profile.email)}
                </AvatarFallback>
              </Avatar>
              <SignOutButton
                showLabel={false}
                className="grid size-9 place-items-center rounded-xl border border-white/8 text-zinc-500 transition hover:border-white/15 hover:bg-white/5 hover:text-white"
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
