import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { EventEditorV2 } from "./event-editor-v2"
import { getEventDraftV2 } from "@/app/actions/events-v2"
import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { parseEventDraftV2 } from "@/lib/validations/event-draft-v2"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Editar evento V2",
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getEventDraftV2(id)

  if (!result.success) {
    if (result.code === "UNAUTHENTICATED") {
      redirect(`/login-organizador?next=/admin/events/${id}/edit`)
    }
    if (result.code === "NOT_FOUND") notFound()
    return (
      <main className="p-6">
        <h1 className="mb-4 text-xl font-semibold">Editor V2</h1>
        <pre className="overflow-auto whitespace-pre-wrap rounded-lg border border-red-500/40 bg-red-50 p-3 text-xs text-red-900">
          {result.error || formatSupabaseError(result.error)}
        </pre>
      </main>
    )
  }

  return (
    <EventEditorV2
      eventId={result.eventId}
      initialDraft={parseEventDraftV2(result.draftState)}
    />
  )
}
