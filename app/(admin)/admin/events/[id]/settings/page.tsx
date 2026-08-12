import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { isPlatformOwnerRole } from "@/lib/auth/platform-owner"

export const metadata: Metadata = {
  title: "Ajustes comerciales",
  robots: { index: false, follow: false },
}

/**
 * Legacy organizer route. Commercial settings live only under Super Admin.
 */
export default async function EventCommercialSettingsRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login-organizador?next=/superadmin/events/${id}`)
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (isPlatformOwnerRole(profile?.role)) {
    redirect(`/superadmin/events/${id}`)
  }

  redirect(`/admin/events/${id}`)
}
