"use client"

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { FlowBucket } from "@/hooks/use-live-metrics"

type Props = {
  buckets: FlowBucket[]
}

export function LiveOpsFlowChart({ buckets }: Props) {
  if (buckets.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground">
        El flujo horario aparece cuando empiecen los ingresos.
      </div>
    )
  }

  const data = buckets.map((b) => ({
    label: b.label,
    ingresos: b.count,
  }))

  return (
    <div className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height={288} debounce={200}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="liveOpsFlowFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.72 0.17 160)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="oklch(0.72 0.17 160)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-border"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            allowDecimals={false}
            width={36}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              color: "hsl(var(--foreground))",
              fontSize: 12,
            }}
            labelFormatter={(label) => `Franja ${label}`}
            formatter={(value) => [
              typeof value === "number" ? value : Number(value ?? 0),
              "Ingresos",
            ]}
          />
          <Area
            type="monotone"
            dataKey="ingresos"
            stroke="oklch(0.65 0.15 160)"
            fill="url(#liveOpsFlowFill)"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Bar
            dataKey="ingresos"
            fill="oklch(0.7 0.14 220 / 0.35)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
