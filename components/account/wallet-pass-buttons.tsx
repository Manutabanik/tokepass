"use client"

import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { requestTicketAssetCache } from "@/lib/wallet-cache"
import { cn } from "@/lib/utils"

function AppleMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  )
}

function GoogleWalletMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path fill="#34A853" d="M3 7.5c0-.83.67-1.5 1.5-1.5H14c.83 0 1.5.67 1.5 1.5v2.25H3V7.5z" />
      <path fill="#FBBC04" d="M3 10.25h12.5v3.5H3z" />
      <path fill="#4285F4" d="M3 13.75h12.5V16.5c0 .83-.67 1.5-1.5 1.5H4.5A1.5 1.5 0 0 1 3 16.5v-2.75z" />
      <path fill="#EA4335" d="M15.5 9.2l5.04 2.52c.61.3.61 1.16 0 1.47L15.5 15.7V9.2z" />
    </svg>
  )
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: string }
    return body.message?.trim() || fallback
  } catch {
    return fallback
  }
}

export function WalletPassButtons({
  ticketId,
  flyerUrl,
  disabled = false,
  className,
}: {
  ticketId: string
  flyerUrl?: string | null
  disabled?: boolean
  className?: string
}) {
  const [busy, setBusy] = useState<"apple" | "google" | null>(null)

  function precache() {
    requestTicketAssetCache([
      flyerUrl,
      "/offline/billetera",
      "/cuenta/entradas",
      `/cuenta/entradas/${ticketId}`,
    ])
  }

  async function addToAppleWallet() {
    if (disabled || busy) return
    setBusy("apple")
    precache()
    try {
      const response = await fetch(`/api/tickets/${ticketId}/apple-pass`, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/vnd.apple.pkpass,application/json" },
      })
      const contentType = response.headers.get("content-type") ?? ""
      if (!response.ok || contentType.includes("application/json")) {
        toast.error(
          await readErrorMessage(
            response,
            "No se pudo generar el pase de Apple Wallet.",
          ),
        )
        return
      }

      const appleOs = /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent)
      if (appleOs) {
        window.location.assign(`/api/tickets/${ticketId}/apple-pass`)
        return
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = `tokepass-${ticketId.slice(0, 8)}.pkpass`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4_000)
    } catch {
      toast.error("No se pudo generar el pase de Apple Wallet.")
    } finally {
      setBusy(null)
    }
  }

  async function saveToGoogleWallet() {
    if (disabled || busy) return
    setBusy("google")
    precache()
    try {
      const response = await fetch(`/api/tickets/${ticketId}/google-wallet`, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
      if (!response.ok) {
        toast.error(
          await readErrorMessage(
            response,
            "No se pudo generar el pase de Google Wallet.",
          ),
        )
        return
      }
      const body = (await response.json()) as { url?: string }
      if (!body.url) {
        toast.error("No se pudo generar el pase de Google Wallet.")
        return
      }
      window.location.assign(body.url)
    } catch {
      toast.error("No se pudo generar el pase de Google Wallet.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <button
        type="button"
        disabled={disabled || Boolean(busy)}
        onClick={() => void addToAppleWallet()}
        aria-label="Agregar a Apple Wallet"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-black px-4 text-[15px] font-semibold tracking-tight text-white shadow-[0_0_24px_rgba(232,121,249,0.18)] ring-1 ring-white/10 transition hover:bg-zinc-950 disabled:opacity-60"
      >
        {busy === "apple" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <AppleMark className="size-5" />
        )}
        Agregar a Apple Wallet
      </button>
      <button
        type="button"
        disabled={disabled || Boolean(busy)}
        onClick={() => void saveToGoogleWallet()}
        aria-label="Guardar en Google Wallet"
        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[10px] bg-[#1f1f1f] px-4 text-[15px] font-semibold tracking-tight text-white ring-1 ring-white/10 transition hover:bg-[#2b2b2b] disabled:opacity-60"
      >
        {busy === "google" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleWalletMark className="size-6" />
        )}
        Guardar en Google Wallet
      </button>
    </div>
  )
}
