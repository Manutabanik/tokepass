"use server"

import { revalidatePath } from "next/cache"

import { parseSupportFaqInput } from "@/lib/support-faqs"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { SupportFaq } from "@/types/database"

export type SupportFaqItem = {
  id: string
  question: string
  answer: string
  isActive: boolean
  order: number
  createdAt: string
  updatedAt: string
}

export type SupportFaqActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

function mapFaq(row: SupportFaq): SupportFaqItem {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    isActive: row.is_active,
    order: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function requireFaqEditor() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    throw new Error("Debes iniciar sesion.")
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle()
  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "super_admin")
  ) {
    throw new Error("No tenes permiso para gestionar preguntas frecuentes.")
  }
  return { supabase: createAdminClient() }
}

function revalidateFaqSurfaces() {
  revalidatePath("/admin/support-faqs")
  revalidatePath("/superadmin/soporte")
}

export async function listSupportFaqs(): Promise<SupportFaqItem[]> {
  const { supabase } = await requireFaqEditor()
  const { data, error } = await supabase
    .from("support_faqs")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(`No se pudieron listar las preguntas: ${error.message}`)
  }
  return (data ?? []).map(mapFaq)
}

export async function listActiveSupportFaqs(): Promise<SupportFaqItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("support_faqs")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) return []
  return (data ?? []).map(mapFaq)
}

async function nextSortOrder(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const { data } = await supabase
    .from("support_faqs")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.sort_order ?? -1) + 1
}

export async function createSupportFaq(input: {
  question: string
  answer: string
  isActive: boolean
  order?: number
}): Promise<SupportFaqActionResult<SupportFaqItem>> {
  try {
    const { supabase } = await requireFaqEditor()
    const parsed = parseSupportFaqInput(input)
    if (!parsed.ok) return { success: false, error: parsed.error }

    const sortOrder =
      input.order == null
        ? await nextSortOrder(supabase)
        : parsed.value.order

    const { data, error } = await supabase
      .from("support_faqs")
      .insert({
        question: parsed.value.question,
        answer: parsed.value.answer,
        is_active: parsed.value.isActive,
        sort_order: sortOrder,
      })
      .select("*")
      .single()

    if (error || !data) {
      return {
        success: false,
        error: error?.message ?? "No se pudo crear la pregunta.",
      }
    }
    revalidateFaqSurfaces()
    return { success: true, data: mapFaq(data) }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo crear la pregunta.",
    }
  }
}

export async function updateSupportFaq(input: {
  id: string
  question: string
  answer: string
  isActive: boolean
  order: number
}): Promise<SupportFaqActionResult<SupportFaqItem>> {
  try {
    const { supabase } = await requireFaqEditor()
    const id = input.id.trim()
    if (!id) return { success: false, error: "Falta el identificador." }
    const parsed = parseSupportFaqInput(input)
    if (!parsed.ok) return { success: false, error: parsed.error }

    const { data, error } = await supabase
      .from("support_faqs")
      .update({
        question: parsed.value.question,
        answer: parsed.value.answer,
        is_active: parsed.value.isActive,
        sort_order: parsed.value.order,
      })
      .eq("id", id)
      .select("*")
      .single()

    if (error || !data) {
      return {
        success: false,
        error: error?.message ?? "No se pudo actualizar la pregunta.",
      }
    }
    revalidateFaqSurfaces()
    return { success: true, data: mapFaq(data) }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la pregunta.",
    }
  }
}

export async function deleteSupportFaq(
  id: string,
): Promise<SupportFaqActionResult<{ id: string }>> {
  try {
    const { supabase } = await requireFaqEditor()
    const faqId = id.trim()
    if (!faqId) return { success: false, error: "Falta el identificador." }

    const { error } = await supabase
      .from("support_faqs")
      .delete()
      .eq("id", faqId)

    if (error) {
      return { success: false, error: error.message }
    }
    revalidateFaqSurfaces()
    return { success: true, data: { id: faqId } }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo eliminar la pregunta.",
    }
  }
}
