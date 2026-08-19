import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getMyOrganizerBankProfile } from "@/app/actions/organizer-bank"
import { OrganizerBankForm } from "@/components/admin/organizer-bank-form"

export const metadata: Metadata = {
  title: "Datos de cobro",
  description: "CBU/CUIT para liquidaciones TokePass.",
}

export default async function OrganizerBankSettingsPage() {
  const profile = await getMyOrganizerBankProfile()
  if (!profile) redirect("/login-organizador?next=/dashboard/settings/bank")

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <OrganizerBankForm initial={profile} />
    </div>
  )
}
