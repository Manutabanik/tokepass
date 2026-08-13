"use client"

/** Soft ambient wash — keeps the page dark without noisy aurora. */
export function AnimatedBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-zinc-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,_rgba(124,58,237,0.12)_0%,_transparent_50%)]" />
    </div>
  )
}
