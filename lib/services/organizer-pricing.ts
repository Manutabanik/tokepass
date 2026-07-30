import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

const FALLBACK_SERVICE_CHARGE_RATE = 0.15

function normalizeServiceChargeRate(value: number | null): number {
  if (!Number.isFinite(value) || value === null) {
    return FALLBACK_SERVICE_CHARGE_RATE
  }

  return Math.min(0.95, Math.max(0, value))
}

export async function getOrganizerServiceChargeRate(
  userId: string,
): Promise<number> {
  const organizerId = userId.trim()
  if (!organizerId) return FALLBACK_SERVICE_CHARGE_RATE

  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("service_charge_rate")
    .eq("id", organizerId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `No se pudo consultar la comisión del organizador: ${error.message}`,
    )
  }

  return normalizeServiceChargeRate(data?.service_charge_rate ?? null)
}
