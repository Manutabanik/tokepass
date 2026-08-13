"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import type { EventCategoryOption } from "@/lib/category-icons"
import type { EventCategory } from "@/types/database"

async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new SuperAdminForbiddenError("Debés iniciar sesión.")
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError || profile?.role !== "super_admin") {
    throw new SuperAdminForbiddenError()
  }

  return { admin: createAdminClient(), actorId: user.id }
}

function slugify(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

/** Lectura pública: categorías activas para B2C y wizard organizador. */
export async function getActiveEventCategories(): Promise<EventCategoryOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("event_categories")
    .select("id, name, slug, icon_name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })

  if (error) {
    throw new Error(`No se pudieron cargar categorías: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    iconName: row.icon_name,
  }))
}

/** Super Admin: listado completo (activas + inactivas). */
export async function listEventCategoriesAdmin(): Promise<EventCategory[]> {
  const { admin } = await requireSuperAdmin()
  const { data, error } = await admin
    .from("event_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })

  if (error) {
    throw new Error(`No se pudieron listar categorías: ${error.message}`)
  }

  return (data ?? []) as EventCategory[]
}

export type CategoryMutationResult =
  | { success: true; category: EventCategory }
  | { success: false; error: string }

export async function createEventCategory(input: {
  name: string
  slug?: string
  iconName?: string | null
  sortOrder?: number
}): Promise<CategoryMutationResult> {
  try {
    const { admin } = await requireSuperAdmin()
    const name = input.name.trim()
    if (name.length < 2) {
      return { success: false, error: "El nombre debe tener al menos 2 caracteres." }
    }

    const slug = slugify(input.slug?.trim() || name)
    if (!slug) {
      return { success: false, error: "El slug no es válido." }
    }

    const iconName = input.iconName?.trim() || null

    const { data, error } = await admin
      .from("event_categories")
      .insert({
        name,
        slug,
        icon_name: iconName,
        sort_order: input.sortOrder ?? 100,
        is_active: true,
      })
      .select("*")
      .single()

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Ya existe una categoría con ese slug." }
      }
      return { success: false, error: error.message }
    }

    revalidatePath("/superadmin/categories")
    revalidatePath("/")
    revalidatePath("/events")
    revalidatePath("/admin/events/create")

    return { success: true, category: data as EventCategory }
  } catch (error) {
    if (error instanceof SuperAdminForbiddenError) {
      return { success: false, error: error.message }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al crear categoría.",
    }
  }
}

export async function updateEventCategory(input: {
  id: string
  name: string
  slug: string
  iconName?: string | null
  isActive: boolean
  sortOrder?: number
}): Promise<CategoryMutationResult> {
  try {
    const { admin } = await requireSuperAdmin()
    const name = input.name.trim()
    const slug = slugify(input.slug)
    if (name.length < 2) {
      return { success: false, error: "El nombre debe tener al menos 2 caracteres." }
    }
    if (!slug) {
      return { success: false, error: "El slug no es válido." }
    }

    const { data, error } = await admin
      .from("event_categories")
      .update({
        name,
        slug,
        icon_name: input.iconName?.trim() || null,
        is_active: input.isActive,
        sort_order: input.sortOrder,
      })
      .eq("id", input.id)
      .select("*")
      .single()

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Ya existe una categoría con ese slug." }
      }
      return { success: false, error: error.message }
    }

    revalidatePath("/superadmin/categories")
    revalidatePath("/")
    revalidatePath("/events")
    revalidatePath("/admin/events/create")

    return { success: true, category: data as EventCategory }
  } catch (error) {
    if (error instanceof SuperAdminForbiddenError) {
      return { success: false, error: error.message }
    }
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al actualizar categoría.",
    }
  }
}

export async function setEventCategoryActive(
  id: string,
  isActive: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { admin } = await requireSuperAdmin()
    const { error } = await admin
      .from("event_categories")
      .update({ is_active: isActive })
      .eq("id", id)

    if (error) return { success: false, error: error.message }

    revalidatePath("/superadmin/categories")
    revalidatePath("/")
    revalidatePath("/events")
    return { success: true }
  } catch (error) {
    if (error instanceof SuperAdminForbiddenError) {
      return { success: false, error: error.message }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo actualizar.",
    }
  }
}
