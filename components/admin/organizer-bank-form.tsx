"use client"

import { Landmark, LoaderCircle, Save, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  saveOrganizerBankProfile,
  type OrganizerBankFormState,
} from "@/app/actions/organizer-bank"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BANK_VERIFICATION_LABEL } from "@/lib/finance/event-payouts"

export function OrganizerBankForm({
  initial,
}: {
  initial: OrganizerBankFormState
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fullNameOrCompany, setFullNameOrCompany] = useState(
    initial.fullNameOrCompany,
  )
  const [taxId, setTaxId] = useState(initial.taxId)
  const [destination, setDestination] = useState(initial.destination)
  const [bankName, setBankName] = useState(initial.bankName)

  function onSave() {
    startTransition(async () => {
      const result = await saveOrganizerBankProfile({
        fullNameOrCompany,
        taxId,
        destination,
        bankName,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Datos de cobro enviados a revisión")
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">
          Liquidaciones
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-foreground">
          Datos de cobro
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          TokePass transfiere el saldo neto de cada evento a esta cuenta, una
          vez validada la titularidad.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="rounded-full border-border bg-muted px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
        >
          {BANK_VERIFICATION_LABEL[initial.verificationStatus]}
        </Badge>
        {initial.reviewNotes ? (
          <p className="text-xs text-muted-foreground">{initial.reviewNotes}</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground sm:p-6">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="bank-holder">Titular / razón social</Label>
            <Input
              id="bank-holder"
              value={fullNameOrCompany}
              onChange={(event) => setFullNameOrCompany(event.target.value)}
              placeholder="Como figura en el banco"
              autoComplete="organization"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bank-tax">CUIT / CUIL</Label>
            <Input
              id="bank-tax"
              value={taxId}
              onChange={(event) => setTaxId(event.target.value)}
              inputMode="numeric"
              placeholder="11 dígitos"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bank-destination">CBU / CVU o alias</Label>
            <Input
              id="bank-destination"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="22 dígitos o alias"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bank-name">Banco o billetera (opcional)</Label>
            <Input
              id="bank-name"
              value={bankName}
              onChange={(event) => setBankName(event.target.value)}
              placeholder="Banco Nación, Mercado Pago…"
            />
          </div>
        </div>

        <Button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="mt-6 min-h-12 w-full rounded-xl sm:w-auto"
        >
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Guardar datos de cobro
        </Button>
      </div>

      <aside className="rounded-2xl border border-violet-500/25 bg-violet-500/8 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-700 ring-1 ring-violet-500/25 dark:text-violet-300">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Landmark className="size-4" aria-hidden="true" />
              Seguridad en la liquidación de fondos
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Por normativas de prevención de fraude y protección al comprador,
              TokePass liquida las recaudaciones exclusivamente a cuentas
              bancarias cuya titularidad coincida con el CUIT/DNI registrado.
              Las liquidaciones se liberan tras la finalización del evento.
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}
