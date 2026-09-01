"use client"

import {
  CalendarDays,
  LoaderCircle,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  getSupportThreadContext,
  listSupportMessages,
  markSupportThreadRead,
  sendSupportMessage,
  type SupportContext,
  type SupportMessageItem,
  type SupportThreadListItem,
} from "@/app/actions/support"
import { EventStatusBadge } from "@/components/superadmin/badges"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { isEventStatus } from "@/lib/events/review-status"

export function SupportInbox({
  threads,
  initialThreadId,
}: {
  threads: SupportThreadListItem[]
  initialThreadId?: string | null
}) {
  const [selectedId, setSelectedId] = useState(
    initialThreadId && threads.some((thread) => thread.id === initialThreadId)
      ? initialThreadId
      : (threads[0]?.id ?? null),
  )
  const [messages, setMessages] = useState<SupportMessageItem[]>([])
  const [context, setContext] = useState<SupportContext | null>(null)
  const [readyId, setReadyId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [pending, startTransition] = useTransition()
  const scroller = useRef<HTMLDivElement>(null)
  const selected = useMemo(
    () => threads.find((thread) => thread.id === selectedId) ?? null,
    [selectedId, threads],
  )
  const loading = selectedId !== null && readyId !== selectedId

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    void Promise.all([
      listSupportMessages(selectedId),
      getSupportThreadContext(selectedId),
      markSupportThreadRead(selectedId),
    ])
      .then(([nextMessages, nextContext]) => {
        if (cancelled) return
        setMessages(nextMessages)
        setContext(nextContext)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "No se pudo abrir el chat.",
          )
        }
      })
      .finally(() => {
        if (!cancelled) setReadyId(selectedId)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [messages.length])

  useEffect(() => {
    if (!selectedId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`support-messages:${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `thread_id=eq.${selectedId}`,
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
  }, [selectedId])

  function send() {
    if (!selectedId || !draft.trim()) return
    const text = draft.trim()
    setDraft("")
    startTransition(async () => {
      const result = await sendSupportMessage(selectedId, text)
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

  if (threads.length === 0) {
    return (
      <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-border bg-muted/30 text-center">
        <div>
          <MessageSquare className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Todavía no hay conversaciones de soporte.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-[70vh] overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[20rem_minmax(0,1fr)_18rem]">
      <aside className="border-b border-border lg:border-b-0 lg:border-r">
        <div className="max-h-[28vh] overflow-y-auto lg:max-h-[70vh]">
          {threads.map((thread) => {
            const active = thread.id === selectedId
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => setSelectedId(thread.id)}
                className={cn(
                  "w-full border-b border-border px-4 py-3 text-left transition",
                  active ? "bg-violet-500/10" : "hover:bg-muted/50",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {thread.organizerName}
                  </p>
                  {thread.unreadForAdmin ? (
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-violet-500" />
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {thread.eventTitle ?? "Consulta general"}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {thread.lastMessagePreview ?? "Sin mensajes"}
                </p>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="flex min-h-[22rem] flex-col">
        <header className="border-b border-border px-4 py-3">
          <p className="font-semibold text-foreground">
            {selected?.organizerName ?? "Chat"}
          </p>
          <p className="text-xs text-muted-foreground">
            {selected?.eventTitle ?? "Consulta general"}
          </p>
        </header>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="grid h-full place-items-center text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-6",
                    message.isAdmin
                      ? "ml-auto bg-violet-600 text-white"
                      : "bg-muted text-foreground",
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
            placeholder="Escribí una respuesta"
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
            Enviar
          </Button>
        </form>
      </section>

      <aside className="hidden border-l border-border p-4 lg:block">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Contexto
        </p>
        <div className="mt-4 space-y-3 text-sm">
          <p className="font-semibold text-foreground">
            {context?.organizerName ?? selected?.organizerName}
          </p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Mail className="size-3.5" />
            {context?.organizerEmail ?? selected?.organizerEmail}
          </p>
          {(context?.organizerPhone ?? selected?.organizerPhone) ? (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="size-3.5" />
              {context?.organizerPhone ?? selected?.organizerPhone}
            </p>
          ) : null}
          {context?.eventTitle ? (
            <div className="rounded-xl border border-border px-3 py-3">
              <p className="font-medium text-foreground">{context.eventTitle}</p>
              {context.eventDate ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" />
                  {formatDateTime(context.eventDate)}
                </p>
              ) : null}
              {context.eventLocation ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {context.eventLocation}
                </p>
              ) : null}
              {isEventStatus(context.eventStatus) ? (
                <div className="mt-3">
                  <EventStatusBadge status={context.eventStatus} />
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Este chat no está atado a un evento.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}
