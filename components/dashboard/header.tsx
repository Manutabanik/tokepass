"use client"

import { HelpCircle } from "lucide-react"
import { useState } from "react"

import { FaqHelpModal } from "@/components/dashboard/faq-help-modal"

export function DashboardHeaderHelp({
  canChat = false,
}: {
  canChat?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ayuda y FAQ"
        aria-label="Ayuda y FAQ"
        className="grid size-11 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <HelpCircle className="h-5 w-5" aria-hidden="true" />
      </button>
      <FaqHelpModal open={open} onOpenChange={setOpen} canChat={canChat} />
    </>
  )
}
