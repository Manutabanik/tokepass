"use server"

import { revalidatePath } from "next/cache"

import { prepareSponsorLogo } from "@/lib/media/sponsor-logo"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import {
  MAX_SPONSOR_LOGO_BYTES,
  SPONSOR_LOGO_TYPES,
  mapSponsorRow,
  normalizeSponsorWebsite,
  storagePathFromSponsorUrl,
  type PublicSponsor,
} from "@/lib/sponsors"
import { createPublicClient } from "@/lib/supabase/public"
import { createClient } from "@/lib/supabase/server"
import type { PlatformSponsor } from "@/types/database"

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

  return { supabase }
}

export async function getActivePlatformSponsors(): Promise<PublicSponsor[]> {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from("platform_sponsors")
    .select("id, name, logo_url, website_url")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true })

  if (error) return []
  return (data ?? []).map(mapSponsorRow)
}

export async function listPlatformSponsorsAdmin(): Promise<PlatformSponsor[]> {
  const { supabase } = await requireSuperAdmin()
  const { data, error } = await supabase
    .from("platform_sponsors")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true })

  if (error) {
    throw new Error(`No se pudieron listar sponsors: ${error.message}`)
  }

  return (data ?? []) as PlatformSponsor[]
}

type MutationResult =
  | { success: true; sponsor: PlatformSponsor }
  | { success: false; error: string }

function revalidateSponsorSurfaces() {
  revalidatePath("/")
  revalidatePath("/superadmin/settings")
  revalidatePath("/superadmin/settings/sponsors")
}

export async function createPlatformSponsor(formData: FormData): Promise<MutationResult> {
  try {
    const { supabase } = await requireSuperAdmin()
    const name = String(formData.get("name") ?? "").trim()
    const websiteUrl = normalizeSponsorWebsite(String(formData.get("websiteUrl") ?? ""))
    const displayOrder = Number(formData.get("displayOrder") ?? 100)
    const file = formData.get("logo")

    if (name.length < 2) {
      return { success: false, error: "El nombre debe tener al menos 2 caracteres." }
    }
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "Subí un logo PNG, SVG, JPG o WEBP." }
    }
    if (!SPONSOR_LOGO_TYPES.has(file.type) && !file.name.toLowerCase().endsWith(".svg")) {
      return { success: false, error: "Solo PNG, SVG, JPG o WEBP." }
    }
    if (file.size > MAX_SPONSOR_LOGO_BYTES) {
      return { success: false, error: "El logo no puede superar 2 MB." }
    }

    const prepared = await prepareSponsorLogo(file)
    if ("error" in prepared) {
      return { success: false, error: prepared.error }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("platform_sponsors")
      .insert({
        name,
        logo_url: "pending",
        website_url: websiteUrl,
        display_order: Number.isFinite(displayOrder) ? displayOrder : 100,
        is_active: true,
      })
      .select("*")
      .single()

    if (insertError || !inserted) {
      return { success: false, error: insertError?.message ?? "No se pudo crear el sponsor." }
    }

    const path = `platform/${inserted.id}/logo.${prepared.extension}`
    const { error: uploadError } = await supabase.storage.from("sponsors").upload(path, prepared.blob, {
      upsert: true,
      contentType: prepared.contentType,
      cacheControl: "3600",
    })

    if (uploadError) {
      await supabase.from("platform_sponsors").delete().eq("id", inserted.id)
      return { success: false, error: `No se pudo subir el logo: ${uploadError.message}` }
    }

    const { data: publicUrl } = supabase.storage.from("sponsors").getPublicUrl(path)
    const { data: saved, error: updateError } = await supabase
      .from("platform_sponsors")
      .update({ logo_url: publicUrl.publicUrl })
      .eq("id", inserted.id)
      .select("*")
      .single()

    if (updateError || !saved) {
      return { success: false, error: updateError?.message ?? "No se guardó la URL del logo." }
    }

    revalidateSponsorSurfaces()
    return { success: true, sponsor: saved as PlatformSponsor }
  } catch (error) {
    if (error instanceof SuperAdminForbiddenError) {
      return { success: false, error: error.message }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al crear el sponsor.",
    }
  }
}

export async function updatePlatformSponsor(formData: FormData): Promise<MutationResult> {
  try {
    const { supabase } = await requireSuperAdmin()
    const id = String(formData.get("id") ?? "").trim()
    const name = String(formData.get("name") ?? "").trim()
    const websiteUrl = normalizeSponsorWebsite(String(formData.get("websiteUrl") ?? ""))
    const displayOrder = Number(formData.get("displayOrder") ?? 100)
    const isActive = String(formData.get("isActive") ?? "true") === "true"
    const file = formData.get("logo")

    if (!id) return { success: false, error: "Falta el sponsor." }
    if (name.length < 2) {
      return { success: false, error: "El nombre debe tener al menos 2 caracteres." }
    }

    const patch: {
      name: string
      website_url: string | null
      display_order: number
      is_active: boolean
      logo_url?: string
    } = {
      name,
      website_url: websiteUrl,
      display_order: Number.isFinite(displayOrder) ? displayOrder : 100,
      is_active: isActive,
    }

    if (file instanceof File && file.size > 0) {
      if (!SPONSOR_LOGO_TYPES.has(file.type) && !file.name.toLowerCase().endsWith(".svg")) {
        return { success: false, error: "Solo PNG, SVG, JPG o WEBP." }
      }
      if (file.size > MAX_SPONSOR_LOGO_BYTES) {
        return { success: false, error: "El logo no puede superar 2 MB." }
      }
      const prepared = await prepareSponsorLogo(file)
      if ("error" in prepared) {
        return { success: false, error: prepared.error }
      }
      const path = `platform/${id}/logo.${prepared.extension}`
      const { error: uploadError } = await supabase.storage.from("sponsors").upload(path, prepared.blob, {
        upsert: true,
        contentType: prepared.contentType,
        cacheControl: "3600",
      })
      if (uploadError) {
        return { success: false, error: `No se pudo subir el logo: ${uploadError.message}` }
      }
      const { data: publicUrl } = supabase.storage.from("sponsors").getPublicUrl(path)
      patch.logo_url = `${publicUrl.publicUrl}?v=${Date.now()}`
    }

    const { data, error } = await supabase
      .from("platform_sponsors")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single()

    if (error || !data) {
      return { success: false, error: error?.message ?? "No se pudo actualizar." }
    }

    revalidateSponsorSurfaces()
    return { success: true, sponsor: data as PlatformSponsor }
  } catch (error) {
    if (error instanceof SuperAdminForbiddenError) {
      return { success: false, error: error.message }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al actualizar el sponsor.",
    }
  }
}

export async function deletePlatformSponsor(id: string): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase } = await requireSuperAdmin()
    const { data: row } = await supabase
      .from("platform_sponsors")
      .select("logo_url")
      .eq("id", id)
      .maybeSingle()

    const { error } = await supabase.from("platform_sponsors").delete().eq("id", id)
    if (error) return { success: false, error: error.message }

    const path = row?.logo_url ? storagePathFromSponsorUrl(row.logo_url) : null
    if (path) {
      await supabase.storage.from("sponsors").remove([path.split("?")[0] ?? path])
    }

    revalidateSponsorSurfaces()
    return { success: true }
  } catch (error) {
    if (error instanceof SuperAdminForbiddenError) {
      return { success: false, error: error.message }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo eliminar.",
    }
  }
}
