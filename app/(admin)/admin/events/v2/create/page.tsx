import { EventCreatorV2Form } from "../event-creator-v2-form"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default function CreateEventV2Page() {
  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-zinc-100">
        Event Creator V2
      </h1>
      <p className="mb-6 max-w-xl text-sm text-slate-500 dark:text-zinc-400">
        Clean room. El progreso vive en <code>events.draft_state</code>. No
        toca <code>ticket_tiers</code> ni <code>venues</code>.
      </p>
      <EventCreatorV2Form />
    </main>
  )
}
