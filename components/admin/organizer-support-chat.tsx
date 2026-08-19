"use client"

import { LoaderCircle, MessageSquare, Send, X } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  getOrCreateOrganizerThread,
  getOrganizerUnreadSupportCount,
  listSupportMessages,
  markSupportThreadRead,
  sendSupportMessage,
  type SupportMessageItem,
} from "@/app/actions/support"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

function eventIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/admin\/events\/([0-9a-f-]{36})/i)
  return match?.[1] ?? null
}

export function OrganizerSupportChat() {
  const pathname = usePathname()
  const eventId = useMemo(() => eventIdFromPath(pathname), [pathname])
  const [open, setOpen] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SupportMessageItem[]>([])
  const [draft, setDraft] = useState("")
  const [unread, setUnread] = useState(0)
  const [readyKey, setReadyKey] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const scroller = useRef<HTMLDivElement>(null)
  const requestKey = open ? (eventId ?? "general") : null
  const loading = requestKey !== null && readyKey !== requestKey

  useEffect(() => {
    void getOrganizerUnreadSupportCount().then(setUnread)
  }, [])

  useEffect(() => {
    if (!requestKey) return
    let cancelled = false
    void getOrCreateOrganizerThread(eventId)
      .then(async (result) => {
        if (!result.success) {
          toast.error(result.error)
          return
        }
        if (cancelled) return
        setThreadId(result.data.threadId)
        const [nextMessages] = await Promise.all([
          listSupportMessages(result.data.threadId),
          markSupportThreadRead(result.data.threadId),
        ])
        if (cancelled) return
        setMessages(nextMessages)
        setUnread(0)
      })
      .finally(() => {
        if (!cancelled) setReadyKey(requestKey)
      })
    return () => {
      cancelled = true
    }
  }, [eventId, requestKey])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [messages.length, open])

  useEffect(() => {
    if (!threadId || !open) return
    const supabase = createClient()
    const channel = supabase
      .channel(`org-support:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            thread_id: string
            sender_id: string
            is_admin: boolean
            content: string
            created_at: string
          }
          setMessages((current) => {
            if (current.some((item) => item.id === row.id)) return current
            return [
              ...current,
              {
                id: row.id,
                threadId: row.thread_id,
                senderId: row.sender_id,
                isAdmin: row.is_admin,
                content: row.content,
                createdAt: row.created_at,
              },
            ]
          })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [open, threadId])

  function send() {
    if (!threadId || !draft.trim()) return
    const text = draft.trim()
    setDraft("")
    startTransition(async () => {
      const result = await sendSupportMessage(threadId, text)
      if (!result.success) {
        setDraft(text)
        toast.error(result.error)
        return
      }
      setMessages((current) =>
        current.some((item) => item.id === result.data.id)
          ? current
          : [...current, result.data],
      )
    })
  }

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-end gap-3 lg:bottom-6 lg:right-6 lg:left-auto">
      {open ? (
        <div className="pointer-events-auto flex h-[min(32rem,70vh)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Soporte TokePass</p>
              <p className="text-xs text-muted-foreground">
                {eventId
                  ? "Consulta atada a este evento"
                  : "Consulta general del panel"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Cerrar soporte"
            >
              <X className="size-4" />
            </button>
          </header>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {loading ? (
              <div className="grid h-full place-items-center text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm leading-6 text-muted-foreground">
                Escribí tu duda. El equipo de TokePass te responde acá, con el
                contexto del evento si estás editándolo.
              </p>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-6",
                      message.isAdmin
                        ? "bg-muted text-foreground"
                        : "ml-auto bg-violet-600 text-white",
                    )}
                  >
                    {message.content}
                  </div>
                ))}
              </div>
            )}
          </div>
          <form
            className="flex gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              send()
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Escribí tu mensaje"
              className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm"
              maxLength={4000}
            />
            <Button
              type="submit"
              disabled={pending || !draft.trim()}
              className="h-11 rounded-xl"
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="pointer-events-auto inline-flex h-12 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-950/20 hover:bg-violet-500"
      >
        <span className="relative">
          <MessageSquare className="size-4" aria-hidden="true" />
          {unread > 0 && !open ? (
            <span className="absolute -right-1.5 -top-1.5 size-2 rounded-full bg-amber-400" />
          ) : null}
        </span>
        Soporte TokePass
      </button>
    </div>
  )
}
