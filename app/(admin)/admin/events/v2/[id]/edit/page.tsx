import { notFound } from "next/navigation"

import { EventCreatorV2Form } from "../../event-creator-v2-form"
import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { createClient } from "@/lib/supabase/server"
import { parseEventDraftV2 } from "@/lib/validations/event-draft-v2"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function EditEventV2Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("events")
    .select("id, draft_state")
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return (
      <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <h1 className="mb-4 text-xl font-semibold">Event Creator V2</h1>
        <pre className="overflow-auto whitespace-pre-wrap rounded-lg border border-red-500/40 bg-red-50 p-3 text-xs text-red-900">
          {formatSupabaseError(error)}
        </pre>
      </main>
    )
  }

  if (!data) notFound()

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-zinc-100">
        Event Creator V2
      </h1>
      <p className="mb-6 max-w-xl text-sm text-slate-500 dark:text-zinc-400">
        Editando <code>{data.id}</code>. Guardar escribe solo{" "}
        <code>draft_state</code>.
      </p>
      <EventCreatorV2Form
        eventId={data.id}
        initialDraft={parseEventDraftV2(data.draft_state)}
      />
    </main>
  )
}
