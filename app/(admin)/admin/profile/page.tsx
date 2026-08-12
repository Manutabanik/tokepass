import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getMyOrganizerProfile } from "@/app/actions/organizer-profile"
import { OrganizerProfileForm } from "@/components/admin/organizer-profile-form"

export const metadata: Metadata = {
  title: "Mi perfil de organizador",
}

export default async function OrganizerProfilePage() {
  const profile = await getMyOrganizerProfile()
  if (!profile) redirect("/admin")

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <OrganizerProfileForm initial={profile} />
    </div>
  )
}
