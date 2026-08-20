"use server"

import { revalidatePath } from "next/cache"

import {
  DEFAULT_RESALE_FEE_PERCENTAGE,
  normalizeResaleFeePercentage,
} from "@/lib/resale"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import { createPublicClient } from "@/lib/supabase/public"
import { createClient } from "@/lib/supabase/server"

async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new SuperAdminForbiddenError("Debés iniciar sesión.")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "super_admin") {
    throw new SuperAdminForbiddenError()
  }

  return { supabase, actorId: user.id }
}

export async function getResaleFeePercentage(): Promise<number> {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from("platform_settings")
      .select("resale_fee_percentage")
      .eq("id", 1)
      .maybeSingle()

    if (error || data == null) {
      return DEFAULT_RESALE_FEE_PERCENTAGE
    }

    return normalizeResaleFeePercentage(data.resale_fee_percentage)
  } catch {
    return DEFAULT_RESALE_FEE_PERCENTAGE
  }
}

export async function updatePlatformResaleFeePercentage(
  percentage: number,
): Promise<{ success: true; percentage: number } | { success: false; error: string }> {
  const raw = Number(percentage)
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
    return {
      success: false,
      error: "Ingresá un porcentaje entre 0 y 100.",
    }
  }

  const normalized = normalizeResaleFeePercentage(raw)

  try {
    const { supabase, actorId } = await requireSuperAdmin()
    const { data, error } = await supabase
      .from("platform_settings")
      .update({
        resale_fee_percentage: normalized,
        updated_by: actorId,
      })
      .eq("id", 1)
      .select("resale_fee_percentage")
      .maybeSingle()

    if (error || data == null) {
      return {
        success: false,
        error: "No se pudo guardar el porcentaje de reventa.",
      }
    }

    revalidatePath("/superadmin/settings")
    return { success: true, percentage: normalized }
  } catch (error) {
    if (error instanceof SuperAdminForbiddenError) {
      return { success: false, error: error.message }
    }
    return {
      success: false,
      error: "No se pudo guardar el porcentaje de reventa.",
    }
  }
}
