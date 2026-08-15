"use client"

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
      kind: "wrong_sector"
      correctGateName: string
    }

const OVERLAY: Record<
  ScanOverlayState["kind"],
  { bg: string; title: string }
> = {
  valid: { bg: "#10B981", title: "ACCESO PERMITIDO" },
  duplicate: { bg: "#EF4444", title: "ENTRADA YA REGISTRADA" },
  invalid: { bg: "#F59E0B", title: "CODIGO NO RECONOCIDO EN SISTEMA" },
  wrong_sector: { bg: "#3B82F6", title: "SECTOR INCORRECTO" },
}

export function ScanResultOverlay({ state }: { state: ScanOverlayState }) {
  const skin = OVERLAY[state.kind]

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center px-6 text-center text-white"
      style={{ backgroundColor: skin.bg }}
      role="alert"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/80">
        Control de acceso
      </p>
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
    </div>
  )
}
