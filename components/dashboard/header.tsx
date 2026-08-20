"use client"

import { HelpCircle } from "lucide-react"
import { useState } from "react"

import { FaqHelpModal } from "@/components/dashboard/faq-help-modal"
import { OPEN_ORGANIZER_SUPPORT_EVENT } from "@/lib/support-events"

export function DashboardHeaderHelp({
  canChat = false,
}: {
  canChat?: boolean
}) {
  const [open, setOpen] = useState(false)

  function openSupport() {
    if (canChat) {
      window.dispatchEvent(new Event(OPEN_ORGANIZER_SUPPORT_EVENT))
      return
    }
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={openSupport}
        title="Soporte"
        aria-label="Soporte"
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <HelpCircle
          className="h-5 w-5 text-zinc-600 dark:text-zinc-400"
          aria-hidden="true"
        />
        <span>Soporte</span>
      </button>
      {canChat ? null : (
        <FaqHelpModal open={open} onOpenChange={setOpen} canChat={false} />
      )}
    </>
  )
}
