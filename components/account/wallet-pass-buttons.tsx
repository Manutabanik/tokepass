"use client"

import { Download, Loader2 } from "lucide-react"
import { useMemo, useState } from "react"

import { requestTicketAssetCache } from "@/lib/wallet-cache"
import { resolveWalletSaveTarget, type WalletSaveTarget } from "@/lib/wallet-os"
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

function openTicketPdf(ticketId: string) {
  window.location.assign(`/tickets/${ticketId}/print`)
}

export function WalletPassButtons({
  ticketId,
  flyerUrl,
  disabled = false,
  appleWalletEnabled = false,
  googleWalletEnabled = false,
  alwaysShowPdf = false,
  className,
}: {
  ticketId: string
  flyerUrl?: string | null
  disabled?: boolean
  appleWalletEnabled?: boolean
  googleWalletEnabled?: boolean
  alwaysShowPdf?: boolean
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const target = useMemo<WalletSaveTarget>(
    () =>
      resolveWalletSaveTarget({
        appleWalletEnabled,
        googleWalletEnabled,
      }),
    [appleWalletEnabled, googleWalletEnabled],
  )

  function precache() {
    requestTicketAssetCache([
      flyerUrl,
      `/tickets/${ticketId}/print`,
      "/offline/billetera",
      "/cuenta/entradas",
      `/cuenta/entradas/${ticketId}`,
    ])
  }

  async function addToAppleWallet() {
    if (disabled || busy) return
    setBusy(true)
    precache()
    try {
      const response = await fetch(`/api/tickets/${ticketId}/apple-pass`, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/vnd.apple.pkpass,application/json" },
        redirect: "follow",
      })
      const contentType = response.headers.get("content-type") ?? ""
      if (!response.ok || contentType.includes("application/json")) {
        openTicketPdf(ticketId)
        return
      }
      if (contentType.includes("text/html")) {
        openTicketPdf(ticketId)
        return
      }

      window.location.assign(`/api/tickets/${ticketId}/apple-pass`)
    } catch {
      openTicketPdf(ticketId)
    } finally {
      setBusy(false)
    }
  }

  async function saveToGoogleWallet() {
    if (disabled || busy) return
    setBusy(true)
    precache()
    try {
      const response = await fetch(`/api/tickets/${ticketId}/google-wallet`, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        redirect: "follow",
      })
      const contentType = response.headers.get("content-type") ?? ""
      if (!response.ok || !contentType.includes("application/json")) {
        openTicketPdf(ticketId)
        return
      }
      const body = (await response.json()) as { url?: string }
      if (!body.url) {
        openTicketPdf(ticketId)
        return
      }
      window.location.assign(body.url)
    } catch {
      openTicketPdf(ticketId)
    } finally {
      setBusy(false)
    }
  }

  function downloadPdf() {
    if (disabled || busy) return
    precache()
    openTicketPdf(ticketId)
  }

  return (
    <div className={cn("grid gap-2", className)}>
      {target === "apple" ? (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void addToAppleWallet()}
          aria-label="Agregar a Apple Wallet"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-black px-4 text-[15px] font-semibold tracking-tight text-white ring-1 ring-white/10 transition hover:bg-zinc-950 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <AppleMark className="size-5" />
          )}
          Agregar a Apple Wallet
        </button>
      ) : null}

      {target === "google" ? (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void saveToGoogleWallet()}
          aria-label="Guardar en Google Wallet"
          className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[10px] bg-[#1f1f1f] px-4 text-[15px] font-semibold tracking-tight text-white ring-1 ring-white/10 transition hover:bg-[#2b2b2b] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <GoogleWalletMark className="size-6" />
          )}
          Guardar en Google Wallet
        </button>
      ) : null}

      {target === "pdf" || alwaysShowPdf ? (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={downloadPdf}
          aria-label="Descargar PDF / Comprobante"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 px-4 text-[15px] font-semibold text-foreground transition hover:bg-muted disabled:opacity-60"
        >
          <Download className="size-4" aria-hidden="true" />
          Descargar PDF / Comprobante
        </button>
      ) : null}
    </div>
  )
}
