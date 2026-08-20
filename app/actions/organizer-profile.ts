"use server"

import { revalidatePath } from "next/cache"

import {
  bytesToBlob,
  detectRasterImageMagic,
  rasterContentType,
  readFileBytes,
} from "@/lib/media/image-magic"
import { createClient } from "@/lib/supabase/server"

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export type OrganizerPublicProfile = {
  fullName: string
  publicName: string
  publicBio: string
  avatarUrl: string | null
  email: string
}

async function requireOrganizer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("auth_required")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "super_admin")
  ) {
    throw new Error("forbidden")
  }

  return { supabase, userId: user.id }
}

export async function getMyOrganizerProfile(): Promise<OrganizerPublicProfile | null> {
  try {
    const { supabase, userId } = await requireOrganizer()
    const { data, error } = await supabase
      .from("profiles")
      .select("email, full_name, public_name, public_bio, avatar_url")
      .eq("id", userId)
      .maybeSingle()

    if (error || !data) return null

    return {
      email: data.email,
      fullName: data.full_name?.trim() ?? "",
      publicName: data.public_name?.trim() ?? "",
      publicBio: data.public_bio?.trim() ?? "",
      avatarUrl: data.avatar_url?.trim() || null,
    }
  } catch {
    return null
  }
}

export async function updateOrganizerProfile(input: {
  publicName: string
  publicBio: string
  fullName?: string
}): Promise<ActionResult> {
  try {
    const { supabase, userId } = await requireOrganizer()
    const publicName = input.publicName.trim()
    const publicBio = input.publicBio.trim()
    const fullName = input.fullName?.trim()

    if (publicName.length < 2) {
      return {
        success: false,
        error: "Ingresá un nombre público de al menos 2 caracteres.",
      }
    }
    if (publicName.length > 80) {
      return { success: false, error: "El nombre público es demasiado largo." }
    }
    if (publicBio.length > 160) {
      return {
        success: false,
        error: "La bajada puede tener hasta 160 caracteres.",
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        public_name: publicName,
        public_bio: publicBio.length > 0 ? publicBio : null,
        ...(fullName && fullName.length >= 2 ? { full_name: fullName } : {}),
      })
      .eq("id", userId)

    if (error) {
      return {
        success: false,
        error: `No pudimos guardar tu perfil: ${error.message}`,
      }
    }

    revalidatePath("/admin")
    revalidatePath("/admin/profile")
    revalidatePath("/events", "layout")
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No pudimos guardar tu perfil.",
    }
  }
}

export async function uploadOrganizerAvatar(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  try {
    const { supabase, userId } = await requireOrganizer()
    const file = formData.get("avatar")
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "Elegí una imagen para subir." }
    }
    if (file.size > 3 * 1024 * 1024) {
      return { success: false, error: "La imagen no puede superar los 3 MB." }
    }
    if (!["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(file.type)) {
      return {
        success: false,
        error: "Usá JPG, PNG o WebP.",
      }
    }

    const bytes = await readFileBytes(file)
    const kind = detectRasterImageMagic(bytes)
    if (!kind) {
      return { success: false, error: "La foto no es un JPG, PNG o WEBP valido." }
    }
    const contentType = rasterContentType(kind)

    const path = `${userId}/avatar.webp`
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, bytesToBlob(bytes, contentType), {
        cacheControl: "3600",
        contentType,
        upsert: true,
      })

    if (error) {
      return {
        success: false,
        error: `No pudimos subir la foto: ${error.message}`,
      }
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path)
    if (!data.publicUrl) {
      await supabase.storage.from("avatars").remove([path])
      return { success: false, error: "No pudimos publicar la foto." }
    }

    const avatarUrl = `${data.publicUrl.split("?")[0]}?v=${Date.now()}`

    const { data: previous } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .maybeSingle()

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", userId)

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

    revalidatePath("/admin")
    revalidatePath("/admin/profile")
    revalidatePath("/events", "layout")
    return { success: true, data: { url: avatarUrl } }
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
