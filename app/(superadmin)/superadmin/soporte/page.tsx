import { MessageSquare } from "lucide-react"
import type { Metadata } from "next"

import { listSupportThreads } from "@/app/actions/support"
import { PageHeading } from "@/components/superadmin/page-heading"
import { SupportInbox } from "@/components/superadmin/support-inbox"

export const metadata: Metadata = {
  title: "Centro de Soporte",
}

export default async function SuperAdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>
}) {
  const { thread } = await searchParams
  const threads = await listSupportThreads()
  const unread = threads.filter((item) => item.unreadForAdmin).length

  return (
    <>
      <PageHeading
        eyebrow="Soporte"
        title="Centro de Soporte"
        description="Respondé a los organizadores con el evento y los datos de contacto a la vista."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-800 ring-1 ring-violet-400/20 dark:text-violet-200">
            <MessageSquare className="size-3.5" />
            {unread} sin responder
          </span>
        }
      />
      <SupportInbox threads={threads} initialThreadId={thread} />
    </>
  )
}
