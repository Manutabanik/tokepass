"use client"

import { Armchair, Check, HelpCircle, LayoutGrid, MousePointer, PenTool, Ticket } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const STEPS = [
  {
    title: "Paso 1: Elegir o cargar plantilla",
    body: "Elegí un modelo listo (Teatro, Anfiteatro, Peña) o empezá con el lienzo en blanco. El botón Plantillas está arriba a la derecha. Si el evento es un festival, cargá una foto satelital o aérea como fondo.",
    icon: Ticket,
  },
  {
    title: "Paso 2: Teatros y peñas — dibujar butacas",
    body: "Arrastrá mesas, tablones o butacas desde la izquierda hasta el salón. Clic izquierdo selecciona. Clic derecho duplica, gira o borra. Ideal para 50 a 800 lugares con plano exacto.",
    icon: Armchair,
  },
  {
    title: "Paso 3: Festivales — trazar zonas paramétricas",
    body: "Usá Trazar zona (pluma) y dibujá un polígono sobre la foto. En propiedades definí filas, mesas por fila y personas por mesa. El inventario de miles de lugares se genera solo, sin dibujar cada mesa.",
    icon: PenTool,
  },
  {
    title: "Paso 4: Precios y publicación",
    body: "Asigná precio por sector o zona. Vista Previa del Comprador muestra el mapa de butacas o la tira de zonas, según lo que configuraste. Guardá; el stock real se materializa al publicar.",
    icon: LayoutGrid,
  },
] as const

export function VenueSetupGuide({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        size={compact ? "icon" : "default"}
        className="shrink-0 border-primary/30 bg-card"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Cómo configurar tu mapa"
      >
        <HelpCircle className={cn("h-4 w-4 text-emerald-400", !compact && "mr-2")} />
        {compact ? null : "¿Cómo configurar tu mapa?"}
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(100vw-2rem,24rem)] rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MousePointer className="size-4 text-emerald-500" />
            Guía rápida del recinto
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            El mismo lienzo sirve para 100 personas o para 20.000. Elegí el
            modo que coincida con tu evento.
          </p>
          <ol className="mt-3 space-y-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold leading-snug">
                    <step.icon className="size-3.5 shrink-0 text-emerald-500" />
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
            Teatros: dibujá cada butaca. Festivales: trazá zonas. El comprador
            ve el mapa o la tira de zonas según corresponda.
          </p>
        </div>
      ) : null}
    </div>
  )
}
