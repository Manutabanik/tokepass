import { redirect } from "next/navigation"

import { getMyAccountProfile } from "@/app/actions/account"
import { AccountBottomNav } from "@/components/account/account-bottom-nav"
import { AccountShell } from "@/components/account/account-shell"
import {
  AccountPillsNav,
  AccountSidebar,
} from "@/components/account/account-sidebar"
import { ClaimPendingTransfers } from "@/components/account/claim-pending-transfers"
import { createClient } from "@/lib/supabase/server"

export default async function CuentaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/cuenta")
  }

  const profile = await getMyAccountProfile().catch(() => ({
    id: user.id,
    email: user.email ?? "",
    fullName: "",
    dni: "",
    phone: "",
    avatarUrl: null,
  }))

  return (
    <div className="relative isolate min-h-[100dvh] bg-background text-foreground">
      <ClaimPendingTransfers />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.12),transparent_40%),radial-gradient(circle_at_85%_8%,rgba(139,92,246,0.1),transparent_36%)] dark:bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.12),transparent_40%),radial-gradient(circle_at_85%_8%,rgba(139,92,246,0.1),transparent_36%)]"
        aria-hidden="true"
      />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[280px_1fr] lg:items-start lg:px-8">
        <AccountSidebar
          profile={{
            email: profile.email,
            fullName: profile.fullName,
            avatarUrl: profile.avatarUrl,
          }}
        />
        <div className="min-w-0">
          <AccountPillsNav />
          <AccountShell>{children}</AccountShell>
        </div>
      </div>
      <AccountBottomNav />
    </div>
  )
}
