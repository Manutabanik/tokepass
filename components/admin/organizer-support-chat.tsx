"use client"

import { LoaderCircle, Send } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  listSupportMessages,
  markSupportThreadRead,
  peekOrganizerSupportSession,
  sendSupportMessage,
  startHumanSupportChat,
  type SupportMessageItem,
} from "@/app/actions/support"
import {
  listActiveSupportFaqs,
  type SupportFaqItem,
} from "@/app/actions/support-faqs"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { OPEN_ORGANIZER_SUPPORT_EVENT } from "@/lib/support-events"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const WELCOME_MESSAGE =
  "Hola. Antes de hablar con una persona, estas respuestas suelen resolver lo más frecuente."

type ChatMode = "bot" | "human"

type BotTurn = {
  id: string
  question: string
  answer: string
  at: string
}

function eventIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/admin\/events\/([0-9a-f-]{36})/i)
  return match?.[1] ?? null
}

function formatMessageTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function ChatBubble({
  fromSupport,
  children,
  time,
}: {
  fromSupport: boolean
  children: React.ReactNode
  time?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        fromSupport ? "items-start" : "items-end",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 whitespace-pre-wrap",
          fromSupport ? "bg-slate-100 text-slate-900" : "bg-primary text-white",
        )}
      >
        {children}
      </div>
      {time ? (
        <p
          className={cn(
            "text-xs",
            fromSupport ? "text-slate-400" : "text-muted-foreground",
          )}
        >
          {time}
        </p>
      ) : null}
    </div>
  )
}

export function OrganizerSupportChat() {
  const pathname = usePathname()
  const eventId = useMemo(() => eventIdFromPath(pathname), [pathname])
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ChatMode>("bot")
  const [startedInBot, setStartedInBot] = useState(false)
  const [faqs, setFaqs] = useState<SupportFaqItem[]>([])
  const [botTurns, setBotTurns] = useState<BotTurn[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SupportMessageItem[]>([])
  const [draft, setDraft] = useState("")
  const [readyKey, setReadyKey] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const scroller = useRef<HTMLDivElement>(null)
  const requestKey = open ? (eventId ?? "general") : null
  const loading = requestKey !== null && readyKey !== requestKey
  const lastFaqQuestion = botTurns.at(-1)?.question ?? null

  useEffect(() => {
    function openFromHelp() {
      setOpen(true)
    }
    window.addEventListener(OPEN_ORGANIZER_SUPPORT_EVENT, openFromHelp)
    return () => {
      window.removeEventListener(OPEN_ORGANIZER_SUPPORT_EVENT, openFromHelp)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setReadyKey(null)
      })
      return
    }
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setMode("bot")
      setStartedInBot(false)
      setThreadId(null)
      setMessages([])
      setBotTurns([])
      setFaqs([])
      setDraft("")
    })
    void Promise.all([
      listActiveSupportFaqs(),
      peekOrganizerSupportSession(eventId),
    ])
      .then(async ([activeFaqs, session]) => {
        if (cancelled) return
        setFaqs(activeFaqs.filter((faq) => faq.isActive))
        if (!session.hasHumanConversation || !session.threadId) {
          setStartedInBot(true)
          return
        }
        setMode("human")
        setThreadId(session.threadId)
        const [nextMessages] = await Promise.all([
          listSupportMessages(session.threadId),
          markSupportThreadRead(session.threadId),
        ])
        if (cancelled) return
        setMessages(nextMessages)
      })
      .catch(() => {
        if (!cancelled) toast.error("No se pudo abrir el chat.")
      })
      .finally(() => {
        if (!cancelled) setReadyKey(eventId ?? "general")
      })
    return () => {
      cancelled = true
    }
  }, [eventId, open])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [botTurns.length, messages.length, open, mode])

  useEffect(() => {
    if (!threadId || !open || mode !== "human") return
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
  }, [mode, open, threadId])

  function askFaq(faq: SupportFaqItem) {
    if (mode !== "bot" || pending) return
    setBotTurns((current) => [
      ...current,
      {
        id: `${faq.id}-${Date.now()}`,
        question: faq.question,
        answer: faq.answer,
        at: new Date().toISOString(),
      },
    ])
  }

  function escalate() {
    if (mode !== "bot" || pending) return
    startTransition(async () => {
      const result = await startHumanSupportChat(eventId, lastFaqQuestion)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setMode("human")
      setThreadId(result.data.threadId)
      setMessages((current) =>
        current.some((item) => item.id === result.data.message.id)
          ? current
          : [...current, result.data.message],
      )
    })
  }

  function send() {
    if (mode !== "human" || !threadId || !draft.trim()) return
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex h-dvh w-full flex-col p-0 sm:max-w-md"
      >
          <SheetHeader className="pr-12">
            <SheetTitle>Soporte TokePass</SheetTitle>
            <SheetDescription>
              {eventId
                ? "Consulta atada a este evento"
                : "Consulta general del panel"}
            </SheetDescription>
          </SheetHeader>

          <div
            ref={scroller}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 scroll-pb-4"
          >
            {loading ? (
              <div className="grid h-full place-items-center text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {startedInBot ? (
                  <ChatBubble fromSupport>{WELCOME_MESSAGE}</ChatBubble>
                ) : null}

                {botTurns.map((turn, index) => (
                  <div key={turn.id} className="space-y-4">
                    <ChatBubble fromSupport={false} time={formatMessageTime(turn.at)}>
                      {turn.question}
                    </ChatBubble>
                    <div className="space-y-2">
                      <ChatBubble fromSupport time={formatMessageTime(turn.at)}>
                        {turn.answer}
                      </ChatBubble>
                      {mode === "bot" && index === botTurns.length - 1 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={escalate}
                        >
                          Hablar con soporte
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {mode === "bot" && faqs.length > 0 ? (
                  <div className="space-y-2">
                    {faqs.map((faq) => (
                      <button
                        key={faq.id}
                        type="button"
                        disabled={pending}
                        onClick={() => askFaq(faq)}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm leading-5 transition hover:bg-muted disabled:opacity-60"
                      >
                        {faq.question}
                      </button>
                    ))}
                  </div>
                ) : null}

                {mode === "bot" && faqs.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm leading-6 text-muted-foreground">
                      No hay preguntas frecuentes publicadas por ahora.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={escalate}
                    >
                      Hablar con soporte
                    </Button>
                  </div>
                ) : null}

                {messages.map((message) => (
                  <ChatBubble
                    key={message.id}
                    fromSupport={message.isAdmin}
                    time={formatMessageTime(message.createdAt)}
                  >
                    {message.content}
                  </ChatBubble>
                ))}
              </div>
            )}
          </div>

          {mode === "human" ? (
            <SheetFooter className="p-3">
              <form
                className="flex w-full gap-2"
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
                  className="h-11 w-11 shrink-0 rounded-xl p-0"
                  aria-label="Enviar mensaje"
                >
                  {pending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </form>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>
  )
}
