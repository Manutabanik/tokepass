"use client"

import { Eye } from "lucide-react"
import { Controller, useFormContext } from "react-hook-form"

import {
  DRAFT_FIELD_CLASS,
  DRAFT_TEXTAREA_CLASS,
  DraftFieldError,
  DraftFieldLabel,
  DraftHint,
} from "./event-editor-v2-ui"
import {
  REFUND_POLICY_OPTIONS,
  parseDraftRefundPolicy,
} from "@/lib/events/refund-policy"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

export function EventEditorV2SettingsStep({
  isPublished = false,
}: {
  isPublished?: boolean
}) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<EventDraftV2>()

  return (
    <div className="space-y-4">
      <Controller
        name="settings.isPublic"
        control={control}
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 px-3 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Eye className="size-4 text-emerald-400" aria-hidden />
                <Label
                  htmlFor="event-v2-is-public"
                  className="text-sm font-medium text-foreground"
                >
                  ¿Sale en el catálogo?
                </Label>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {field.value
                  ? isPublished
                    ? "Sí: está en el catálogo. Si lo apagás, se oculta al guardar."
                    : "Sí: aparece en Tokepass cuando lo subas al catálogo."
                  : isPublished
                    ? "No: solo lo ven quienes tengan el link. Para listarlo de nuevo, publicá."
                    : "No: solo lo ven quienes tengan el link."}
              </p>
            </div>
            <Switch
              id="event-v2-is-public"
              data-field="settings.isPublic"
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              className="mt-0.5 shrink-0 data-checked:bg-emerald-500"
              aria-label="¿Sale en el catálogo?"
            />
          </div>
        )}
      />

      <div className="grid gap-2">
        <DraftFieldLabel htmlFor="event-v2-refund-policy" className="text-sm">
          Política de reintegro
        </DraftFieldLabel>
        <Controller
          name="settings.refundPolicy"
          control={control}
          render={({ field }) => {
            const selected = parseDraftRefundPolicy(field.value)
            return (
              <>
                <select
                  id="event-v2-refund-policy"
                  data-field="settings.refundPolicy"
                  className={DRAFT_FIELD_CLASS}
                  value={selected}
                  onChange={(event) => field.onChange(event.target.value)}
                >
                  {REFUND_POLICY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <DraftHint>
                  {REFUND_POLICY_OPTIONS.find((option) => option.value === selected)
                    ?.hint ?? "Se muestra en la ficha pública y en el checkout."}
                </DraftHint>
              </>
            )
          }}
        />
        <DraftFieldError message={errors.settings?.refundPolicy?.message} />
      </div>

      <div className="grid gap-2">
        <DraftFieldLabel
          htmlFor="event-v2-checkout-message"
          optional
          className="text-sm"
        >
          Mensaje después de pagar
        </DraftFieldLabel>
        <Textarea
          id="event-v2-checkout-message"
          rows={5}
          className={DRAFT_TEXTAREA_CLASS}
          placeholder="Ej. Gracias por tu compra. Revisá el mail para el acceso."
          {...register("settings.checkoutMessage")}
        />
        <DraftHint>Aparece en la pantalla de éxito después del pago.</DraftHint>
        <DraftFieldError message={errors.settings?.checkoutMessage?.message} />
      </div>
    </div>
  )
}
