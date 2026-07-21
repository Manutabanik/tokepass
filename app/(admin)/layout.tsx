import { LogOut, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { signOut } from "@/app/actions/auth"
import { AdminSidebar } from "@/components/shared/admin-sidebar"
import { BrandLogo } from "@/components/shared/brand-logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/server"

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", user.id)
    .single()

  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "super_admin")
  ) {
    redirect("/")
  }

  const initials = (profile.full_name ?? profile.email)
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  return (
    <div className="dark min-h-screen bg-[#0c0c0f] text-zinc-100">
      <div className="flex min-h-screen">
        <AdminSidebar />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/8 bg-[#0c0c0f]/85 px-5 backdrop-blur-xl sm:px-8">
            <BrandLogo inverted className="lg:hidden" />
            <div className="hidden lg:block">
              <p className="text-sm font-medium text-zinc-300">
                Command Center
              </p>
              <p className="text-xs text-zinc-600">
                Control operativo en tiempo real
              </p>
            </div>

            <div className="flex items-center gap-3">
              {profile.role === "super_admin" && (
                <Link
                  href="/superadmin"
                  className="hidden items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-300 transition hover:bg-sky-500/15 sm:flex"
                >
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Platform OS
                </Link>
              )}
              <div className="hidden text-right sm:block">
                <p className="max-w-48 truncate text-sm font-medium text-white">
                  {profile.full_name || "Administrador"}
                </p>
                <p className="max-w-48 truncate text-xs text-zinc-500">
                  {profile.email}
                </p>
              </div>
              <Avatar>
                <AvatarFallback className="bg-violet-500/15 text-violet-300">
                  {initials || "AD"}
                </AvatarFallback>
              </Avatar>
              <form action={signOut}>
                <button
                  type="submit"
                  className="grid size-9 place-items-center rounded-xl border border-white/8 text-zinc-500 transition hover:border-white/15 hover:bg-white/5 hover:text-white"
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                </button>
              </form>
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
