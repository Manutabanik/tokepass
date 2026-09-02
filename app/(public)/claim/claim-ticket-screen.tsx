import Link from "next/link"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { peekTicketTransferClaimAction } from "@/app/actions/transfer"
import { ClaimTicketView } from "@/components/public/claim-ticket-view"
import { Button } from "@/components/ui/button"
import { loginUrlWithNext } from "@/lib/auth/post-login"
import { formatEventDate } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export async function ClaimTicketScreen({ token }: { token: string }) {
  const rawToken = token.trim()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!rawToken) {
    return (
      <ClaimShell>
        <ClaimError
          title="Enlace incompleto"
          description="Falta el token de reclamo. Pedile a quien te envió la entrada que te reenvíe el link."
        />
      </ClaimShell>
    )
  }

  if (!user) {
    redirect(loginUrlWithNext(`/claim/${rawToken}`))
  }

  const preview = await peekTicketTransferClaimAction(rawToken)

  if (!preview.ok) {
    if (preview.loginUrl) {
      redirect(preview.loginUrl)
    }
    return (
      <ClaimShell>
        <ClaimError title="No se pudo reclamar" description={preview.error} />
      </ClaimShell>
    )
  }

  return (
    <ClaimShell>
      <ClaimTicketView
        token={rawToken}
        eventTitle={preview.eventTitle}
        eventDateLabel={
          preview.eventDate ? formatEventDate(preview.eventDate) : null
        }
        flyerUrl={preview.flyerUrl}
        emailMatches={preview.emailMatches}
        alreadyOwner={preview.alreadyOwner}
        status={preview.status}
      />
    </ClaimShell>
  )
}

function ClaimShell({ children }: { children: ReactNode }) {
  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-lg items-center justify-center overflow-hidden px-4 py-12">
      <div
        className="pointer-events-none absolute -left-40 -top-40 size-96 rounded-full bg-purple-600/15 blur-[120px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 size-96 rounded-full bg-emerald-600/10 blur-[120px]"
        aria-hidden="true"
      />
      <div className="relative w-full">{children}</div>
    </section>
  )
}

function ClaimError({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-[1.75rem] border border-border bg-card/80 p-6 text-center shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8">
      <h1 className="text-xl font-extrabold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Button
        className="mt-6 h-12 w-full rounded-full"
        nativeButton={false}
        render={<Link href="/profile/tickets" />}
      >
        Ir a Mis entradas
      </Button>
    </div>
  )
}
