"use client"

import {
  Building2,
  Crown,
  LoaderCircle,
  Save,
  Shield,
  ShieldCheck,
  Zap,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  type OrganizationDetails,
  updateOrganizerRiskMatrix,
} from "@/app/actions/superadmin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type {
  OrganizerGuaranteeStatus,
  OrganizerRiskTier,
} from "@/types/database"

const tiers: Array<{
  id: OrganizerRiskTier
  title: string
  description: string
  icon: typeof Shield
  accent: string
}> = [
  {
    id: "TIER_1_CUSTODY",
    title: "Tier 1 · Custodia Tokepass",
    description:
      "El dinero de las ventas permanece en retención hasta 48 hs hábiles post-evento. Ideal para productoras nuevas o sin historial.",
    icon: Shield,
    accent:
      "border-emerald-400/35 bg-emerald-500/10 text-emerald-100 ring-emerald-400/20",
  },
  {
    id: "TIER_2_INSTANT_SPLIT",
    title: "Tier 2 · Split instantáneo",
    description:
      "División inmediata vía Mercado Pago Connect: neto al productor y comisión a Tokepass. Requiere cuenta vinculada.",
    icon: Zap,
    accent:
      "border-sky-400/35 bg-sky-500/10 text-sky-100 ring-sky-400/20",
  },
  {
    id: "TIER_3_ENTERPRISE",
    title: "Tier 3 · Enterprise VIP",
    description:
      "Split instantáneo + tasa preferencial configurable + garantía legal verificada.",
    icon: Crown,
    accent:
      "border-violet-400/35 bg-violet-500/10 text-violet-100 ring-violet-400/20",
  },
]

export function OrganizerRiskMatrixCard({
  organization,
}: {
  organization: OrganizationDetails
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [riskTier, setRiskTier] = useState<OrganizerRiskTier>(
    organization.profile.riskTier,
  )
  const [guaranteeStatus, setGuaranteeStatus] =
    useState<OrganizerGuaranteeStatus>(organization.profile.guaranteeStatus)
  const [feePercent, setFeePercent] = useState(
    organization.profile.serviceChargeRate * 100,
  )
  const [mpUserId, setMpUserId] = useState(organization.profile.mpUserId ?? "")
  const [mpAccessToken, setMpAccessToken] = useState("")
  const [clearMpAccessToken, setClearMpAccessToken] = useState(false)
  const [legalGuarantee, setLegalGuarantee] = useState(
    organization.profile.guaranteeStatus !== "NONE",
  )

  function handleSave() {
    if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 95) {
      toast.error("La comisión debe estar entre 0% y 95%.")
      return
    }

    if (
      (riskTier === "TIER_2_INSTANT_SPLIT" ||
        riskTier === "TIER_3_ENTERPRISE") &&
      !mpUserId.trim() &&
      !mpAccessToken.trim() &&
      !organization.profile.hasMpAccessToken
    ) {
      toast.error(
        "Tier 2/3 requieren Mercado Pago Connect (user id o access token).",
      )
      return
    }

    const nextGuarantee: OrganizerGuaranteeStatus = legalGuarantee
      ? guaranteeStatus === "NONE"
        ? "PROMISSORY_NOTE_SIGNED"
        : guaranteeStatus
      : "NONE"

    startTransition(async () => {
      const result = await updateOrganizerRiskMatrix(organization.profile.id, {
        riskTier,
        guaranteeStatus: nextGuarantee,
        customCommissionRate: feePercent / 100,
        mpUserId: mpUserId.trim() || null,
        mpAccessToken: mpAccessToken.trim() || null,
        clearMpAccessToken,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success("Matriz de riesgo financiero actualizada.")
      setMpAccessToken("")
      setClearMpAccessToken(false)
      router.refresh()
    })
  }

  return (
    <Card className="border border-zinc-800 bg-zinc-900/90 py-0 backdrop-blur-xl">
      <CardHeader className="border-b border-zinc-800 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <ShieldCheck className="size-5 text-emerald-400" />
              Matriz de riesgo y finanzas
            </CardTitle>
            <CardDescription className="mt-1 text-zinc-500">
              Custodia vs split Connect · comisión dinámica · garantía legal.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="border-zinc-700 bg-black/30 font-mono text-[10px] uppercase tracking-wide text-zinc-300"
          >
            {riskTier.replaceAll("_", " ")}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 px-6 py-6">
        <div className="grid gap-3">
          {tiers.map((tier) => {
            const Icon = tier.icon
            const selected = riskTier === tier.id
            return (
              <button
                key={tier.id}
                type="button"
                disabled={isPending}
                onClick={() => setRiskTier(tier.id)}
                className={cn(
                  "rounded-2xl border px-4 py-4 text-left transition ring-1",
                  selected
                    ? tier.accent
                    : "border-zinc-800 bg-black/20 text-zinc-400 ring-transparent hover:border-zinc-700 hover:text-zinc-200",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-9 place-items-center rounded-xl bg-black/30 ring-1 ring-white/10">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{tier.title}</p>
                    <p className="mt-1 text-xs leading-5 opacity-80">
                      {tier.description}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <label
              htmlFor="risk-commission-rate"
              className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
            >
              Tasa de comisión dinámica
            </label>
            <div className="relative">
              <Input
                id="risk-commission-rate"
                type="number"
                min={0}
                max={95}
                step={0.1}
                value={feePercent}
                onChange={(event) => setFeePercent(Number(event.target.value))}
                disabled={isPending}
                className="h-12 border-zinc-700 bg-black/40 pr-12 font-mono text-xl font-bold text-white"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sky-300">
                %
              </span>
            </div>
            <p className="text-[11px] text-zinc-600">
              Persistido en `service_charge_rate` (custom_commission_rate
              canónica del motor All-In).
            </p>
          </div>

          <div className="space-y-3">
            <label
              htmlFor="mp-user-id"
              className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
            >
              Mercado Pago Connect
            </label>
            <Input
              id="mp-user-id"
              value={mpUserId}
              onChange={(event) => setMpUserId(event.target.value)}
              disabled={isPending}
              placeholder="mp_user_id"
              className="h-11 border-zinc-700 bg-black/40 font-mono text-sm text-white"
            />
            <Input
              type="password"
              value={mpAccessToken}
              onChange={(event) => setMpAccessToken(event.target.value)}
              disabled={isPending || clearMpAccessToken}
              placeholder={
                organization.profile.hasMpAccessToken
                  ? "Access token (dejar vacío para conservar)"
                  : "mp_access_token"
              }
              className="h-11 border-zinc-700 bg-black/40 font-mono text-sm text-white"
            />
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={clearMpAccessToken}
                onChange={(event) =>
                  setClearMpAccessToken(event.target.checked)
                }
                disabled={isPending}
                className="size-4 rounded border-zinc-600 bg-zinc-900"
              />
              Revocar access token guardado
              {organization.profile.hasMpAccessToken ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                >
                  Token activo
                </Badge>
              ) : null}
            </label>
          </div>
        </div>

        {riskTier === "TIER_3_ENTERPRISE" ? (
          <div className="rounded-2xl border border-violet-500/25 bg-violet-500/10 px-4 py-4">
            <label className="flex items-start gap-3 text-sm text-violet-100">
              <input
                type="checkbox"
                checked={legalGuarantee}
                onChange={(event) => {
                  setLegalGuarantee(event.target.checked)
                  if (event.target.checked) {
                    setGuaranteeStatus("PROMISSORY_NOTE_SIGNED")
                  } else {
                    setGuaranteeStatus("NONE")
                  }
                }}
                disabled={isPending}
                className="mt-1 size-4 rounded border-violet-400/40 bg-zinc-950"
              />
              <span>
                <span className="font-semibold">
                  Garantía legal / pagaré verificado
                </span>
                <span className="mt-1 block text-xs text-violet-200/80">
                  Habilita respaldo contractual ante cancelaciones Enterprise.
                </span>
              </span>
            </label>
            {legalGuarantee ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["PROMISSORY_NOTE_SIGNED", "Pagaré firmado"],
                    ["INSURANCE_BOND_ACTIVE", "Póliza / fianza activa"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={isPending}
                    onClick={() => setGuaranteeStatus(value)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-xs font-medium",
                      guaranteeStatus === value
                        ? "border-violet-300/40 bg-violet-400/15 text-violet-50"
                        : "border-white/10 bg-black/20 text-violet-200/70",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-black/20 px-3 py-2 text-xs text-zinc-500">
            <Building2 className="size-3.5" aria-hidden="true" />
            Garantía legal disponible en Tier 3 Enterprise.
          </div>
        )}

        <Button
          type="button"
          disabled={isPending}
          onClick={handleSave}
          className="h-11 w-full bg-gradient-to-r from-emerald-600 to-sky-600 text-white hover:from-emerald-500 hover:to-sky-500"
        >
          {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
          Guardar matriz financiera
        </Button>
      </CardContent>
    </Card>
  )
}
