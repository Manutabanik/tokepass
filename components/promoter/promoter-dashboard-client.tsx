"use client"

import { Check, Copy, Link2, LoaderCircle } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  claimPromoterByCode,
  type PromoterMetrics,
} from "@/app/actions/promoters"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatCurrency, formatPercent } from "@/lib/format"

function buildShareUrl(eventId: string | null, referralCode: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://tokepass.app"
  if (eventId) {
    return `${origin}/events/${eventId}?ref=${encodeURIComponent(referralCode)}`
  }
  return `${origin}/events?ref=${encodeURIComponent(referralCode)}`
}

export function PromoterDashboardClient({
  metrics,
}: {
  metrics: PromoterMetrics | null
}) {
  const [claimCode, setClaimCode] = useState("")
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  const shareUrl = useMemo(() => {
    if (!metrics) return ""
    return buildShareUrl(metrics.featuredEventId, metrics.referralCode)
  }, [metrics])

  async function handleCopy() {
    if (!shareUrl || !metrics) return

    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success("Link copiado", {
        description: `Tu código ${metrics.referralCode} ya está en el portapapeles.`,
      })
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("No se pudo copiar. Copiá el link manualmente.")
    }
  }

  function handleClaim(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await claimPromoterByCode(claimCode)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Código vinculado", {
        description: result.referralCode,
      })
      window.location.reload()
    })
  }

  if (!metrics) {
    return (
      <div className="mx-auto w-full max-w-md space-y-6 px-4 py-10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-400">
            Promotores y RRPP
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">
            Activá tu panel
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Pedile al organizador tu código y vinculalo a esta cuenta.
          </p>
        </div>

        <form
          onSubmit={handleClaim}
          className="space-y-3 rounded-[1.75rem] border border-zinc-800 bg-zinc-950 p-5"
        >
          <Input
            value={claimCode}
            onChange={(event) => setClaimCode(event.target.value.toUpperCase())}
            placeholder="TOMAS-VIP"
            className="h-12 border-zinc-700 bg-black text-center text-lg font-bold tracking-widest text-white"
            required
          />
          <Button
            type="submit"
            disabled={isPending}
            className="h-12 w-full rounded-2xl bg-emerald-500 text-base font-bold text-zinc-950 hover:bg-emerald-400"
          >
            {isPending ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              "Vincular código"
            )}
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-4 pb-12 pt-8">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-400">
          Mini dashboard
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">
          Hola, {metrics.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Comisión {formatPercent(metrics.commissionRate * 100, 0)} sobre ventas
          pagadas.
        </p>
      </header>

      <section className="overflow-hidden rounded-[1.75rem] border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 via-zinc-950 to-zinc-950 p-5 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300/80">
          Tu código
        </p>
        <p className="mt-2 text-4xl font-black tracking-[-0.03em] text-white">
          {metrics.referralCode}
        </p>
        <p className="mt-3 break-all text-xs leading-5 text-zinc-400">
          {shareUrl || "Cargando link…"}
        </p>
        <Button
          type="button"
          onClick={handleCopy}
          className="mt-5 h-14 w-full rounded-2xl bg-white text-base font-bold text-zinc-950 hover:bg-zinc-100"
        >
          {copied ? (
            <>
              <Check className="size-5 text-emerald-600" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="size-5" />
              Copiar link de ventas
            </>
          )}
        </Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
          <Link2 className="size-3.5" aria-hidden="true" />
          Incluye ?ref={metrics.referralCode}
        </p>
      </section>

      <div className="grid gap-4">
        <Card className="border-zinc-800 bg-zinc-950 py-0 shadow-none">
          <CardHeader className="px-5 pb-2 pt-5">
            <CardDescription className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Ventas totales
            </CardDescription>
            <CardTitle className="text-5xl font-black tracking-[-0.05em] text-white">
              {metrics.ticketsSold}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <p className="text-sm text-zinc-500">Entradas atribuidas a tu link</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/25 bg-zinc-950 py-0 shadow-[0_0_30px_rgba(16,185,129,0.12)]">
          <CardHeader className="px-5 pb-2 pt-5">
            <CardDescription className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
              Tu comisión estimada
            </CardDescription>
            <CardTitle className="text-5xl font-black tracking-[-0.05em] text-emerald-400">
              {formatCurrency(metrics.estimatedCommission)}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <p className="text-sm text-zinc-500">
              Sobre {formatCurrency(metrics.revenueGenerated)} en GMV pagado
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
