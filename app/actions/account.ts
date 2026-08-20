"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import {
  bytesToBlob,
  detectRasterImageMagic,
  rasterContentType,
  readFileBytes,
} from "@/lib/media/image-magic"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type BuyerAccountProfile = {
  id: string
  email: string
  fullName: string
  dni: string
  phone: string
  avatarUrl: string | null
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
])

function cleanDni(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11)
}

function cleanPhone(value: string): string {
  return value.replace(/[^\d+\s()-]/g, "").trim().slice(0, 32)
}

function revalidateBuyerProfile() {
  revalidatePath("/cuenta")
  revalidatePath("/cuenta/perfil")
  revalidatePath("/cuenta/entradas")
  revalidatePath("/", "layout")
}

export async function getMyAccountProfile(): Promise<BuyerAccountProfile> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error("auth_required")

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, dni, phone, avatar_url")
    .eq("id", user.id)
    .maybeSingle()

  if (error) {
    return {
      id: user.id,
      email: user.email ?? "",
      fullName: "",
      dni: "",
      phone: "",
      avatarUrl: null,
    }
  }

  return {
    id: user.id,
    email: data?.email ?? user.email ?? "",
    fullName: data?.full_name?.trim() ?? "",
    dni: data?.dni?.trim() ?? "",
    phone: data?.phone?.trim() ?? "",
    avatarUrl: data?.avatar_url?.trim() || null,
  }
}

export async function updateMyAccountProfile(input: {
  fullName: string
  dni: string
  phone: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "Tenés que iniciar sesión." }

  const fullName = input.fullName.trim()
  if (fullName.length < 2) {
    return { success: false, error: "Ingresá tu nombre completo." }
  }
  if (fullName.length > 120) {
    return { success: false, error: "El nombre es demasiado largo." }
  }

  const dni = cleanDni(input.dni)
  if (dni && (dni.length < 7 || dni.length > 11)) {
    return { success: false, error: "El DNI / CUIL no parece válido." }
  }

  const phone = cleanPhone(input.phone)
  if (phone && phone.replace(/\D/g, "").length < 8) {
    return { success: false, error: "El teléfono no parece válido." }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      dni: dni || null,
      phone: phone || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)

  if (error) return { success: false, error: error.message }

  revalidateBuyerProfile()
  return { success: true }
}

export async function uploadMyAvatar(
  formData: FormData,
): Promise<
  | { success: true; url: string }
  | { success: false; error: string }
> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { success: false, error: "Tenés que iniciar sesión." }

    const file = formData.get("avatar")
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "Elegí una imagen para subir." }
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return { success: false, error: "La foto no puede superar los 2 MB." }
    }
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      return { success: false, error: "Usá JPG, PNG o WEBP." }
    }

    const bytes = await readFileBytes(file)
    const kind = detectRasterImageMagic(bytes)
    if (!kind) {
      return { success: false, error: "La foto no es un JPG, PNG o WEBP valido." }
    }
    const contentType = rasterContentType(kind)

    const path = `${user.id}/avatar.webp`

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, bytesToBlob(bytes, contentType), {
        cacheControl: "3600",
        contentType,
        upsert: true,
      })

    if (uploadError) {
      return {
        success: false,
        error: `No pudimos subir la foto: ${uploadError.message}`,
      }
    }

    const { data: publicData } = supabase.storage
      .from("avatars")
      .getPublicUrl(path)

    if (!publicData.publicUrl) {
      await supabase.storage.from("avatars").remove([path])
      return { success: false, error: "No pudimos publicar la foto." }
    }

    const avatarUrl = `${publicData.publicUrl.split("?")[0]}?v=${Date.now()}`

    const { data: previous } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle()

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    if (updateError) {
      await supabase.storage.from("avatars").remove([path])
      return {
        success: false,
        error: `No pudimos guardar la foto: ${updateError.message}`,
      }
    }

    const previousFlyerPath = previous?.avatar_url?.split("/event-flyers/")[1]
    if (previousFlyerPath) {
      await supabase.storage
        .from("event-flyers")
        .remove([previousFlyerPath.split("?")[0] ?? previousFlyerPath])
    }

    revalidateBuyerProfile()
    return { success: true, url: avatarUrl }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No pudimos subir la foto.",
    }
  }
}

export async function requestPasswordResetEmail(): Promise<
  { success: true } | { success: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return { success: false, error: "Tenés que iniciar sesión." }
  }

  const requestHeaders = await headers()
  const origin = requestHeaders.get("origin")
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    origin ||
    "http://localhost:3000"
  ).replace(/\/$/, "")

  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${siteUrl}/auth/callback?next=/cuenta/perfil`,
  })

  if (error) {
    return {
      success: false,
      error:
        error.message.toLowerCase().includes("rate")
          ? "Demasiados intentos. Esperá un momento."
          : "No pudimos enviar el email. Probá de nuevo.",
    }
  }

  return { success: true }
}

async function removeAvatarFolder(userId: string): Promise<void> {
  const admin = createAdminClient()
  const folder = userId.trim()
  if (!folder) return

  const { data } = await admin.storage.from("avatars").list(folder, {
    limit: 100,
  })
  const paths = (data ?? [])
    .map((entry) => entry.name?.trim())
    .filter((name): name is string => Boolean(name))
    .map((name) => `${folder}/${name}`)

  if (paths.length === 0) {
    await admin.storage.from("avatars").remove([`${folder}/avatar.webp`])
    return
  }

  await admin.storage.from("avatars").remove(paths)
}

export async function deleteAccount(): Promise<{
  success: false
  error: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Tenés que iniciar sesión." }
  }

  const { error: anonymizeError } = await supabase.rpc("anonymize_account", {
    p_user_id: user.id,
  })

  if (anonymizeError) {
    return {
      success: false,
      error:
        anonymizeError.message ||
        "No pudimos anonimizar la cuenta. Probá de nuevo.",
    }
  }

  try {
    await removeAvatarFolder(user.id)
  } catch {
    // la baja sigue: el perfil ya no apunta al avatar
  }

  const admin = createAdminClient()
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    const { error: softDeleteError } = await admin.auth.admin.deleteUser(
      user.id,
      true,
    )
    if (softDeleteError) {
      return {
        success: false,
        error:
          "Los datos personales ya se anonimizaron, pero no pudimos cerrar el acceso. Escribinos a soporte.",
      }
    }
  }

  await supabase.auth.signOut()
  revalidateBuyerProfile()
  redirect("/")
}
