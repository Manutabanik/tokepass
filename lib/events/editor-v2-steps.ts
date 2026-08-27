import type { FieldErrors, FieldPath } from "react-hook-form"

import {
  eventPublishSchema,
  toEventDraftV2Payload,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

export const EDITOR_V2_STEP_IDS = [1, 2, 3] as const
export type EditorV2StepId = (typeof EDITOR_V2_STEP_IDS)[number]

const STEP_2_ROOTS = new Set([
  "tickets",
  "extras",
  "venueCapacity",
  "seatingMap",
  "seatingMaps",
  "venueMap",
])

const STEP_3_ROOTS = new Set(["settings"])

export type DraftFieldIssue = {
  path: Array<string | number>
  name: string
  message: string
  step: EditorV2StepId
}

export function editorStepForFieldPath(
  path: Array<string | number> | string,
): EditorV2StepId {
  const root = Array.isArray(path)
    ? String(path[0] ?? "")
    : path.split(".")[0] ?? ""
  if (STEP_2_ROOTS.has(root)) return 2
  if (STEP_3_ROOTS.has(root)) return 3
  return 1
}

export function collectDraftPublishIssues(values: EventDraftV2): DraftFieldIssue[] {
  const result = eventPublishSchema.safeParse(toEventDraftV2Payload(values))
  if (result.success) return []
  return result.error.issues.map((issue) => {
    const path = issue.path.map((part) =>
      typeof part === "number" ? part : String(part),
    )
    return {
      path,
      name: path.map(String).join("."),
      message: issue.message,
      step: editorStepForFieldPath(path),
    }
  })
}

export function editorStepsWithIssues(
  issues: readonly DraftFieldIssue[],
): Set<EditorV2StepId> {
  return new Set(issues.map((issue) => issue.step))
}

export function firstDraftPublishIssue(
  issues: readonly DraftFieldIssue[],
): DraftFieldIssue | null {
  return issues[0] ?? null
}

export function flattenFieldErrorNames(
  errors: FieldErrors<EventDraftV2> | FieldErrors,
  prefix = "",
): string[] {
  const names: string[] = []
  for (const [key, value] of Object.entries(errors)) {
    if (!value || typeof value !== "object") continue
    const path = prefix ? `${prefix}.${key}` : key
    const record = value as {
      message?: unknown
      type?: unknown
      ref?: unknown
    } & Record<string, unknown>
    if (typeof record.message === "string" && record.message.trim()) {
      names.push(path)
    }
    const root = record.root as { message?: unknown } | undefined
    if (typeof root?.message === "string" && root.message.trim()) {
      names.push(path)
    }
    const nested: Record<string, unknown> = { ...record }
    delete nested.message
    delete nested.type
    delete nested.ref
    delete nested.root
    if (Object.keys(nested).length > 0) {
      names.push(
        ...flattenFieldErrorNames(nested as FieldErrors, path),
      )
    }
  }
  return names
}

export function editorStepsWithFieldErrors(
  errors: FieldErrors<EventDraftV2> | FieldErrors,
): Set<EditorV2StepId> {
  return new Set(
    flattenFieldErrorNames(errors).map((name) => editorStepForFieldPath(name)),
  )
}

export type EditorTabAlert = "error" | "warn" | null

/** Red = RHF errors. Orange = publish schema still incomplete. */
export function editorTabAlert(
  step: EditorV2StepId,
  input: {
    fieldErrorSteps: ReadonlySet<EditorV2StepId>
    schemaIssueSteps?: ReadonlySet<EditorV2StepId>
  },
): EditorTabAlert {
  if (input.fieldErrorSteps.has(step)) return "error"
  if (input.schemaIssueSteps?.has(step)) return "warn"
  return null
}

export function nextEditorStep(step: EditorV2StepId): EditorV2StepId | null {
  if (step === 1) return 2
  if (step === 2) return 3
  return null
}

export function prevEditorStep(step: EditorV2StepId): EditorV2StepId | null {
  if (step === 3) return 2
  if (step === 2) return 1
  return null
}

export function applyDraftIssuesToForm(
  setError: (
    name: FieldPath<EventDraftV2>,
    error: { type: string; message: string },
  ) => void,
  issues: readonly DraftFieldIssue[],
) {
  for (const issue of issues) {
    const name = (issue.name || "basicInfo.name") as FieldPath<EventDraftV2>
    setError(name, { type: "manual", message: issue.message })
  }
}
