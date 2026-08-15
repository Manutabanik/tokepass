"use client"

let audioCtx: AudioContext | null = null

function context(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) audioCtx = new Ctor()
  return audioCtx
}

export function armPosSaleBeep() {
  const ctx = context()
  if (!ctx) return
  void ctx.resume()
}

export function playPosSaleBeep() {
  const ctx = context()
  if (!ctx) return
  void ctx.resume().then(() => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.09, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.16)
  })
}
