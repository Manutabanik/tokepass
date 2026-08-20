"use client"

import {
  AlertTriangle,
  ArrowRightLeft,
  ShoppingBag,
  Smartphone,
  XCircle,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { formatScanClock } from "@/lib/scanner/scan-copy"

export type ScanOverlayState =
  | {
      kind: "valid"
      holderName: string
      passType: string
      sector: string | null
      place: string | null
    }
  | {
      kind: "duplicate"
      scannedAt: string | number | null
      gateName: string | null
      operatorName: string | null
    }
  | {
      kind: "invalid"
    }
  | {
      kind: "test_ticket"
    }
  | {
      kind: "wrong_sector"
      correctGateName: string
    }
  | {
      kind: "main_gate_review"
      reason: "group_no_peers" | "range_mismatch"
    }
  | {
      kind: "transfer_pending"
    }
  | {
      kind: "listed_for_resale"
    }
  | {
      kind: "wrong_schedule"
      message: string
    }
  | {
      kind: "cancelled"
    }
  | {
      kind: "unpaid"
    }
  | {
      kind: "transferred"
    }
  | {
      kind: "expired_qr"
    }

const OVERLAY: Record<
  ScanOverlayState["kind"],
  { bg: string; title: string; Icon?: LucideIcon }
> = {
  valid: { bg: "#10B981", title: "ACCESO PERMITIDO" },
  duplicate: { bg: "#EF4444", title: "ENTRADA YA REGISTRADA" },
  invalid: { bg: "#F59E0B", title: "CODIGO NO RECONOCIDO EN SISTEMA" },
  test_ticket: { bg: "#F59E0B", title: "TICKET DE PRUEBA - ACCESO DENEGADO" },
  wrong_sector: { bg: "#3B82F6", title: "SECTOR INCORRECTO" },
  main_gate_review: { bg: "#F59E0B", title: "REVISION EN PUERTA PRINCIPAL" },
  transfer_pending: { bg: "#F59E0B", title: "TRANSFERENCIA PENDIENTE" },
  listed_for_resale: {
    bg: "#F59E0B",
    title: "ENTRADA EN REVENTA",
    Icon: ShoppingBag,
  },
  wrong_schedule: { bg: "#F59E0B", title: "FUERA DE JORNADA" },
  cancelled: { bg: "#EF4444", title: "ENTRADA CANCELADA", Icon: XCircle },
  unpaid: { bg: "#F97316", title: "PAGO PENDIENTE", Icon: AlertTriangle },
  transferred: {
    bg: "#F97316",
    title: "ENTRADA TRANSFERIDA",
    Icon: ArrowRightLeft,
  },
  expired_qr: {
    bg: "#EF4444",
    title: "CODIGO VENCIDO / CAPTURA DE PANTALLA",
    Icon: Smartphone,
  },
}

export function ScanResultOverlay({ state }: { state: ScanOverlayState }) {
  const skin = OVERLAY[state.kind]
  const Icon = skin.Icon

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center px-6 text-center text-white"
      style={{ backgroundColor: skin.bg }}
      role="alert"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/80">
        Control de acceso
      </p>
      {Icon ? (
        <Icon className="mt-6 size-16 sm:size-20" aria-hidden="true" />
      ) : null}
      <h2 className="mt-3 max-w-4xl text-4xl font-black leading-[0.95] tracking-tight sm:text-6xl">
        {skin.title}
      </h2>

      {state.kind === "valid" ? (
        <div className="mt-8 space-y-2">
          <p className="text-2xl font-black sm:text-3xl">{state.holderName}</p>
          <p className="text-lg font-bold uppercase tracking-[0.14em]">
            {state.passType}
          </p>
          {state.sector || state.place ? (
            <p className="text-base font-semibold text-white/90">
              {[state.sector, state.place].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {state.kind === "duplicate" ? (
        <p className="mt-8 max-w-xl text-lg font-semibold leading-7 text-white/95">
          Esta entrada ingreso a las {formatScanClock(state.scannedAt) || "--:--"}{" "}
          hs
          {state.gateName ? ` en ${state.gateName}` : ""}
          {state.operatorName ? ` por el operador ${state.operatorName}` : ""}.
        </p>
      ) : null}

      {state.kind === "wrong_sector" ? (
        <p className="mt-8 max-w-xl text-2xl font-black leading-tight">
          Dirigirse a {state.correctGateName}
        </p>
      ) : null}

      {state.kind === "main_gate_review" ? (
        <p className="mt-8 max-w-xl text-lg font-semibold leading-7 text-white/95">
          {state.reason === "range_mismatch"
            ? "Esta entrada esta asignada a otra pistola de la gatera. Validar en Puerta Principal."
            : "Entrada grupal o multi-acceso. Sin red local entre pistolas: validar en Puerta Principal."}
        </p>
      ) : null}

      {state.kind === "transfer_pending" ? (
        <p className="mt-8 max-w-xl text-lg font-semibold leading-7 text-white/95">
          Esta entrada esta en cesion. El QR se habilita cuando el destinatario la reclama o se cancela la transferencia.
        </p>
      ) : null}

      {state.kind === "listed_for_resale" ? (
        <p className="mt-8 max-w-xl text-lg font-semibold leading-7 text-white/95">
          Esta entrada esta publicada en el marketplace. El QR se habilita cuando se retire de la venta o se complete la compra.
        </p>
      ) : null}

      {state.kind === "wrong_schedule" ? (
        <p className="mt-8 max-w-xl text-lg font-semibold leading-7 text-white/95">
          {state.message}
        </p>
      ) : null}

      {state.kind === "cancelled" ? (
        <p className="mt-8 max-w-xl text-xl font-black uppercase leading-tight">
          Esta entrada fue anulada. No permitir el ingreso.
        </p>
      ) : null}

      {state.kind === "unpaid" ? (
        <p className="mt-8 max-w-xl text-xl font-black uppercase leading-tight">
          El pago no esta confirmado. No permitir el ingreso.
        </p>
      ) : null}

      {state.kind === "transferred" ? (
        <p className="mt-8 max-w-xl text-xl font-black uppercase leading-tight">
          Debe mostrar el QR nuevo en la app. Este codigo ya no es valido.
        </p>
      ) : null}

      {state.kind === "expired_qr" ? (
        <p className="mt-8 max-w-xl text-xl font-black uppercase leading-tight">
          Pedile que abra la app web TokePass. Una captura de pantalla no sirve.
        </p>
      ) : null}
    </div>
  )
}
