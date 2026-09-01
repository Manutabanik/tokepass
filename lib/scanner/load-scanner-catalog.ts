import "server-only"

import { listOperableEvents } from "@/lib/event-ops-access"
import { readValidDoorGuestSession } from "@/lib/scanner/door-guest-session"
import {
  ALL_SCANNER_GATE_ID,
  GA_SCANNER_GATE_ID,
  GENERAL_SCANNER_GATE_ID,
  PARKING_SCANNER_GATE_ID,
  VIP_SCANNER_GATE_ID,
  type ScannerGate,
} from "@/lib/scanner/gate"
import { resolveScannerActor } from "@/lib/scanner/resolve-scanner-access"
import type { ScannerEventOption } from "@/lib/scanner/scanner-catalog-types"
import { ScannerSetupError } from "@/lib/scanner/scanner-setup-error"
import { createClient } from "@/lib/supabase/server"

function prettyScannerGateLabel(name: string, fallbackId: string): string {
  const raw = name.trim() || fallbackId
  const lower = raw.toLowerCase()
  if (/\bvip\b/.test(lower)) {
    return /acceso/i.test(raw) ? raw : "Acceso VIP"
  }
  if (
    (/\bcampo\b/.test(lower) || /\bgeneral\b/.test(lower) || lower === "ga") &&
    !/\bvip\b/.test(lower)
  ) {
    return "Campo General"
  }
  if (lower === "general" || /puerta principal/.test(lower)) {
    return "Puerta Principal"
  }
  return raw
}

function upsertGate(gates: Map<string, ScannerGate>, gate: ScannerGate) {
  if (!gate.id || gates.has(gate.id)) return
  gates.set(gate.id, gate)
}

export async function loadScannerEvents(): Promise<ScannerEventOption[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const rows = await listOperableEvents({ roles: ["door_staff"] })
    return rows.map((event) => ({
      id: event.id,
      title: event.title,
      date: event.date,
      status: event.status,
      qrType: event.qr_type === "static" ? "static" : "dynamic",
    }))
  }

  const guest = await readValidDoorGuestSession()
  if (!guest) {
    throw new ScannerSetupError(
      "auth_required",
      "Sesión expirada. Volvé a iniciar sesión.",
    )
  }
  return [
    {
      id: guest.eventId,
      title: guest.eventTitle,
      date: guest.eventDate,
      status: guest.eventStatus,
      qrType: guest.qrType,
    },
  ]
}

export async function loadScannerOperatorLabel(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    const guest = await readValidDoorGuestSession()
    return guest ? "Staff de puerta" : "Operador"
  }
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle()
  return data?.full_name?.trim() || data?.email?.trim() || "Operador"
}

export async function loadScannerGates(eventId: string): Promise<ScannerGate[]> {
  const defaults: ScannerGate[] = [
    {
      id: ALL_SCANNER_GATE_ID,
      label: "Todas las puertas",
      color: "#a1a1aa",
      kind: "general",
    },
    {
      id: GENERAL_SCANNER_GATE_ID,
      label: "Puerta Principal",
      color: "#10b981",
      kind: "general",
    },
  ]
  if (!eventId) return defaults

  const access = await resolveScannerActor(eventId)
  if (!access.ok) {
    if (access.reason === "auth_required") {
      throw new ScannerSetupError(
        "auth_required",
        "Sesión expirada. Volvé a iniciar sesión.",
      )
    }
    throw new ScannerSetupError(
      "forbidden",
      "No tenés acceso a las gateras de este evento.",
    )
  }

  const supabase = access.db
  const gates = new Map<string, ScannerGate>()
  for (const gate of defaults) upsertGate(gates, gate)

  const [rpc, tiers, units] = await Promise.all([
    supabase.rpc("get_event_scanner_gates", { p_event_id: eventId }),
    supabase
      .from("ticket_tiers")
      .select("id, name, seating_sector_id")
      .eq("event_id", eventId),
    supabase
      .from("event_seating_units")
      .select("sector_id, sector_name, color")
      .eq("event_id", eventId)
      .limit(800),
  ])

  for (const row of rpc.data ?? []) {
    const id = String(row.gate_id ?? "").trim()
    if (!id || id === GENERAL_SCANNER_GATE_ID || id === ALL_SCANNER_GATE_ID) {
      continue
    }
    upsertGate(gates, {
      id,
      label: prettyScannerGateLabel(String(row.label ?? id), id),
      color: String(row.color || "#6366f1"),
      kind:
        row.kind === "sector"
          ? "sector"
          : row.kind === "parking"
            ? "parking"
            : "general",
    })
  }

  for (const unit of units.data ?? []) {
    const id = String(unit.sector_id ?? "").trim()
    if (!id) continue
    upsertGate(gates, {
      id,
      label: prettyScannerGateLabel(String(unit.sector_name ?? id), id),
      color: String(unit.color || "#6366f1"),
      kind: "sector",
    })
  }

  let hasVip = false
  let hasCampo = false
  for (const tier of tiers.data ?? []) {
    const name = String(tier.name ?? "")
    const sectorId = tier.seating_sector_id?.trim()
    if (sectorId) {
      upsertGate(gates, {
        id: sectorId,
        label: prettyScannerGateLabel(name || sectorId, sectorId),
        color: "#6366f1",
        kind: "sector",
      })
    }
    if (/\bvip\b/i.test(name)) hasVip = true
    if (/\bcampo\b|\bgeneral\b/i.test(name) && !/\bvip\b/i.test(name)) {
      hasCampo = true
    }
  }

  if (hasVip) {
    upsertGate(gates, {
      id: VIP_SCANNER_GATE_ID,
      label: "Acceso VIP",
      color: "#8b5cf6",
      kind: "sector",
    })
  }
  if (hasCampo) {
    upsertGate(gates, {
      id: GA_SCANNER_GATE_ID,
      label: "Campo General",
      color: "#22c55e",
      kind: "sector",
    })
  }

  if (!gates.has(PARKING_SCANNER_GATE_ID)) {
    upsertGate(gates, {
      id: PARKING_SCANNER_GATE_ID,
      label: "Barrera de Estacionamiento",
      color: "#f59e0b",
      kind: "parking",
    })
  }

  return [...gates.values()]
}
