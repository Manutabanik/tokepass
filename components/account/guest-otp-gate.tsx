"use client"

import { LoaderCircle, ShieldCheck } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  requestGuestOtpResend,
  verifyGuestTicketOtp,
} from "@/app/actions/guest-ticket-access"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function GuestOtpGate({
  orderId,
  onVerified,
}: {
  orderId: string
  onVerified: () => void
}) {
  const [code, setCode] = useState("")
  const [isPending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const result = await verifyGuestTicketOtp({ orderId, code })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onVerified()
    })
  }

  function resend() {
    startTransition(async () => {
      const result = await requestGuestOtpResend(orderId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Te enviamos un codigo nuevo.")
    })
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-5 text-center">
      <p className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Verificacion de invitado
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Ingresa el codigo de 4 digitos que te enviamos por mail o WhatsApp para
        mostrar el QR.
      </p>
      <Input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={4}
        value={code}
        onChange={(event) =>
          setCode(event.target.value.replace(/\D/g, "").slice(0, 4))
        }
        onKeyDown={(event) => {
          if (event.key === "Enter") submit()
        }}
        placeholder="0000"
        className="mx-auto mt-4 h-14 max-w-[10rem] text-center text-2xl font-black tracking-[0.4em]"
      />
      <Button
        type="button"
        disabled={isPending || code.length !== 4}
        onClick={submit}
        className="mt-4 min-h-12 w-full rounded-2xl"
      >
        {isPending ? <LoaderCircle className="animate-spin" /> : "Mostrar QR"}
      </Button>
      <button
        type="button"
        disabled={isPending}
        onClick={resend}
        className="mt-3 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
      >
        Reenviar codigo
      </button>
    </div>
  )
}
