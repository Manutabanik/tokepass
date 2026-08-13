"use client"

/** Ambient stage lighting for discovery — tuned for dark + light. */
export function AnimatedBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      {/* Base */}
      <div className="absolute inset-0 bg-[#f4f2f8] dark:bg-[#030712]" />

      {/* Soft grid */}
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(124,58,237,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(124,58,237,0.07) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 75%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-0 dark:opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(167,139,250,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(167,139,250,0.12) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 90% 80% at 50% 55%, black 10%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 80% at 50% 55%, black 10%, transparent 70%)",
        }}
      />

      {/* Left violet wash — lighter on mobile CPUs */}
      <div className="absolute -left-32 top-0 hidden h-[520px] w-[520px] rounded-full bg-violet-400/25 blur-[100px] md:block dark:bg-violet-600/35 dark:blur-[120px]" />
      {/* Center cyan/indigo bloom behind headline */}
      <div className="absolute left-1/2 top-24 hidden h-[380px] w-[640px] -translate-x-1/2 rounded-full bg-fuchsia-300/20 blur-[90px] md:block dark:bg-indigo-500/25 dark:blur-[110px]" />
      {/* Soft bottom fade */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#f4f2f8] to-transparent dark:from-[#030712]" />
    </div>
  )
}
