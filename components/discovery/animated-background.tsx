"use client"

/**
 * Festival Aurora — canvas nocturno con grilla y 3 orbes respirando (CSS only).
 */
export function AnimatedBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[#030712]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,_rgba(124,58,237,0.14)_0%,_transparent_55%)]" />

      <div className="tokepass-aurora tokepass-aurora-violet absolute -left-[18%] top-[-14%] size-[min(75vw,540px)] rounded-full bg-[#7c3aed]/40 blur-[140px]" />
      <div className="tokepass-aurora tokepass-aurora-magenta absolute left-1/2 top-[28%] size-[min(70vw,500px)] -translate-x-1/2 rounded-full bg-[#db2777]/35 blur-[140px]" />
      <div className="tokepass-aurora tokepass-aurora-cyan absolute bottom-[-12%] right-[-8%] size-[min(72vw,520px)] rounded-full bg-[#0284c7]/40 blur-[140px]" />

      <div className="tokepass-night-grid absolute inset-0 opacity-[0.05]" />
    </div>
  )
}
