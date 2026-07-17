import type { Metadata } from "next"

import { OrganizerAuthForm } from "@/components/shared/organizer-auth-form"

export const metadata: Metadata = {
  title: "Acceso para organizadores",
}

export default async function OrganizerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <section className="relative isolate grid min-h-[calc(100vh-4rem)] place-items-center overflow-hidden bg-[#09090b] px-4 py-16">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.18),transparent_42%)]" />
      <div className="w-full max-w-md">
        <OrganizerAuthForm mode="login" initialError={error} />
      </div>
    </section>
  )
}
