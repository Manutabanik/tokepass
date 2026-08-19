import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getGuestListPublic } from "@/app/actions/guest-lists"
import { GuestListClaimForm } from "@/components/public/guest-list-claim-form"
import { createClient } from "@/lib/supabase/server"
import { formatDateTime } from "@/lib/format"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ listId: string }>
}): Promise<Metadata> {
  const { listId } = await params
  const meta = await getGuestListPublic(listId)
  if (!meta) return { title: "Lista no encontrada" }
  return {
    title: `${meta.name} · ${meta.eventTitle}`,
    description: `Anotate en la lista ${meta.name} para ${meta.eventTitle}.`,
  }
}

export default async function GuestListClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>
  searchParams: Promise<{ entry?: string }>
}) {
  const { listId } = await params
  const { entry } = await searchParams
  const meta = await getGuestListPublic(listId)

  if (!meta) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="mx-auto min-h-[calc(100vh-4rem)] w-full max-w-md px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
          Invitación TokePass
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-foreground">
          Te invitaron a {meta.eventTitle}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">{meta.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ingreso válido hasta {formatDateTime(meta.validUntil)}
        </p>
      </div>

      <GuestListClaimForm
        meta={meta}
        initialEntryId={entry ?? null}
        isAuthenticated={Boolean(user)}
      />
    </div>
  )
}
