import { redirect } from "next/navigation"

import { AccountBottomNav } from "@/components/account/account-bottom-nav"
import { AccountDesktopNav } from "@/components/account/account-desktop-nav"
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

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] bg-background text-foreground">
      <ClaimPendingTransfers />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.12),transparent_40%),radial-gradient(circle_at_85%_8%,rgba(139,92,246,0.1),transparent_36%)] dark:bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.12),transparent_40%),radial-gradient(circle_at_85%_8%,rgba(139,92,246,0.1),transparent_36%)]"
        aria-hidden="true"
      />
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 md:pt-8">
        <AccountDesktopNav />
        <div className="pb-24 md:pb-10">{children}</div>
      </div>
      <AccountBottomNav />
    </div>
  )
}
