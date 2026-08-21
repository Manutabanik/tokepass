"use client"

import { ticketPdfPath, type TicketPdfSize } from "@/lib/pdf/ticket-pdf-model"

/**
 * Impresion POS: PDF vectorial del servidor, o HTML termico de respaldo.
 */

const PRINT_DONE = "TOKEPASS_PRINT_DONE"

function waitForPrintDone(timeoutMs = 12_000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.removeEventListener("message", onMessage)
      window.clearTimeout(timer)
      resolve()
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === PRINT_DONE) finish()
    }
    window.addEventListener("message", onMessage)
    const timer = window.setTimeout(finish, timeoutMs)
  })
}

export async function printTicketsViaHiddenIframe(
  ticketIds: string[],
): Promise<void> {
  await printAdmissionTicketPdfs(ticketIds)
}

export async function printAdmissionTicketPdfs(
  ticketIds: string[],
  size: TicketPdfSize = "80mm",
): Promise<void> {
  const unique = [...new Set(ticketIds.filter(Boolean))]
  if (unique.length === 0 || typeof window === "undefined") return

  const url = ticketPdfPath(unique[0]!, { size, ids: unique })
  const response = await fetch(url, { credentials: "same-origin" })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string
    } | null
    throw new Error(body?.message || "No se pudo generar el ticket PDF")
  }
  const blob = await response.blob()
  await printPdfBlob(blob)
}

async function printPdfBlob(blob: Blob): Promise<void> {
  const objectUrl = URL.createObjectURL(blob)
  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.title = "Impresion PDF TokePass"
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;"

  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      window.setTimeout(() => {
        iframe.remove()
        URL.revokeObjectURL(objectUrl)
      }, 2500)
      resolve()
    }
    iframe.onload = () => {
      window.setTimeout(() => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
          finish()
        } catch (error) {
          iframe.remove()
          URL.revokeObjectURL(objectUrl)
          reject(error)
        }
      }, 400)
    }
    iframe.onerror = () => {
      iframe.remove()
      URL.revokeObjectURL(objectUrl)
      reject(new Error("No se pudo abrir el PDF"))
    }
    iframe.src = objectUrl
    document.body.appendChild(iframe)
  })
}

export async function printOneTicketViaHiddenIframe(
  ticketId: string,
): Promise<void> {
  if (typeof window === "undefined" || !ticketId) return

  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.title = "Impresión térmica TokePass"
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;"
  iframe.src = `/tickets/${ticketId}/print?autoprint=1`

  document.body.appendChild(iframe)
  try {
    await waitForPrintDone()
  } finally {
    iframe.remove()
  }
}

export async function printUrlViaHiddenIframe(url: string): Promise<void> {
  if (typeof window === "undefined" || !url) return

  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.title = "Impresión térmica TokePass"
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;"
  iframe.src = url.includes("?") ? `${url}&autoprint=1` : `${url}?autoprint=1`

  document.body.appendChild(iframe)
  try {
    await waitForPrintDone()
  } finally {
    iframe.remove()
  }
}

export function printThermalNodeNow(): void {
  if (typeof window === "undefined") return
  document.body.classList.add("pos-thermal-printing")
  const cleanup = () => {
    document.body.classList.remove("pos-thermal-printing")
    window.removeEventListener("afterprint", cleanup)
  }
  window.addEventListener("afterprint", cleanup)
  window.print()
  window.setTimeout(cleanup, 1500)
}

export { PRINT_DONE as TOKEPASS_PRINT_DONE_MESSAGE }
