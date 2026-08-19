"use client"

import { Check, Loader2, Users, X } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  validateCheckoutPromoterCode,
  type CheckoutPromoterPreview,
} from "@/app/actions/promoters"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function CheckoutPromoterCodeInput({
  eventId,
  initialCode,
  applied,
  locked,
  onApplied,
  onCleared,
  disabled,
}: {
  eventId: string
  initialCode?: string | null
  applied: CheckoutPromoterPreview | null
  locked?: boolean
  onApplied: (promoter: CheckoutPromoterPreview) => void
  onCleared: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(Boolean(initialCode))
  const [code, setCode] = useState(initialCode ?? "")
  const [pending, startTransition] = useTransition()
  const previewedRef = useRef<string | null>(null)

  useEffect(() => {
    const preview = initialCode?.trim()
    if (!preview || applied || disabled) return
    if (previewedRef.current === preview) return
    previewedRef.current = preview
    startTransition(async () => {
      const result = await validateCheckoutPromoterCode(preview, eventId)
      if (result.success) {
        onApplied(result.data)
        setCode(result.data.referralCode)
        setOpen(true)
      }
    })
  }, [applied, disabled, eventId, initialCode, onApplied])

  function apply() {
    startTransition(async () => {
      const result = await validateCheckoutPromoterCode(code, eventId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      onApplied(result.data)
      setCode(result.data.referralCode)
    })
  }

  if (!applied && !open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
      >
        <Users className="size-3.5" aria-hidden />
        ¿Tenés un código de promotor/RRPP?
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-base font-semibold text-foreground">
        Código de promotor
      </p>
      {applied ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
          <p className="min-w-0 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 whitespace-normal">
                Venta atribuida a {applied.name}
              </span>
            </span>
          </p>
          {locked ? null : (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={disabled || pending}
              onClick={() => {
                onCleared()
                setCode("")
              }}
              className="text-emerald-700 hover:bg-emerald-500/20 hover:text-emerald-900 dark:text-emerald-200 dark:hover:text-white"
              aria-label="Quitar código de promotor"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      ) : (
        <div className="flex min-w-0 gap-2">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ANA-01"
            disabled={disabled || pending || locked}
            autoCapitalize="characters"
            className={cn(
              "h-12 min-w-0 flex-1 rounded-xl border border-border bg-secondary/30 px-4 font-mono text-[16px] uppercase text-foreground md:h-14 md:text-base",
              "placeholder:normal-case placeholder:text-muted-foreground",
            )}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                apply()
              }
            }}
          />
          <Button
            type="button"
            disabled={disabled || pending || locked || !code.trim()}
            onClick={apply}
            className="h-12 shrink-0 rounded-xl bg-foreground px-4 text-base font-bold text-background hover:bg-foreground/90 md:h-14"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              "Aplicar"
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
