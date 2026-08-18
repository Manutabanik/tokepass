import type { Metadata } from "next"

import { OrganizerAuthForm } from "@/components/shared/organizer-auth-form"
import { safeInternalNextPath } from "@/lib/auth/next-path"

export const metadata: Metadata = {
  title: "Acceso para organizadores",
}

export default async function OrganizerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams

  return (
    <section className="relative isolate grid min-h-[calc(100vh-4rem)] place-items-center overflow-hidden bg-background px-4 py-16">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.18),transparent_42%)]" />
      <div className="w-full max-w-md">
        <OrganizerAuthForm
          initialError={error}
          nextPath={safeInternalNextPath(next)}
        />
      </div>
    </section>
  )
}
