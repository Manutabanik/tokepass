import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { readJwtAal } from "@/lib/auth/jwt-aal"

export const AAL2_REQUIRED_ERROR =
  "Confirmá tu segundo factor (MFA) antes de ejecutar un reembolso masivo."

type AssuranceLookup = {
  currentLevel?: string | null
}

function isAal2(value: unknown): value is "aal2" {
  return value === "aal2"
}

/**
 * Exige AAL2 en la sesion del usuario (TOTP/MFA de Supabase Auth).
 * Fail-closed: si no se puede leer el nivel, se rechaza.
 */
export async function assertCurrentSessionAal2(
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const mfa = supabase.auth.mfa
    if (mfa && typeof mfa.getAuthenticatorAssuranceLevel === "function") {
      const { data, error } = await mfa.getAuthenticatorAssuranceLevel()
      if (!error && isAal2((data as AssuranceLookup | null)?.currentLevel)) {
        return { ok: true }
      }
    }
  } catch {
    // Fallback al claim JWT abajo.
  }

  const { data } = await supabase.auth.getSession()
  if (isAal2(readJwtAal(data.session?.access_token))) {
    return { ok: true }
  }

  return { ok: false, error: AAL2_REQUIRED_ERROR }
}
