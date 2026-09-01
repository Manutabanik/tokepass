import type { Metadata } from "next"

import { LoginErrorSessionPurge } from "@/components/auth/login-error-session-purge"
import { AuthForms } from "@/components/shared/auth-forms"
import { safeInternalNextPath } from "@/lib/auth/next-path"

export const metadata: Metadata = {
  title: "Ingresar",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams

  return (
    <section className="relative flex min-h-[calc(100vh-80px)] items-center justify-center overflow-hidden bg-background p-4">
      <div
        className="pointer-events-none absolute -left-40 -top-40 size-96 rounded-full bg-purple-600/15 blur-[120px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 size-96 rounded-full bg-emerald-600/10 blur-[120px]"
        aria-hidden="true"
      />
      <LoginErrorSessionPurge error={error} />
      <AuthForms
        initialError={error}
        nextPath={safeInternalNextPath(next)}
      />
    </section>
  )
}
