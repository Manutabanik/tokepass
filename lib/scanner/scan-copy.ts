export function formatScanClock(isoOrMs: string | number | null | undefined): string {
  if (isoOrMs == null) return ""
  try {
    const date =
      typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs)
    if (Number.isNaN(date.getTime())) return ""
    return date.toLocaleTimeString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  } catch {
    return ""
  }
}

export function permitidoCopy(input: {
  ownerName: string
  sector: string | null
}): string {
  const name = input.ownerName.trim() || "Titular"
  const sector = input.sector?.trim()
  return sector ? `PERMITIDO - ${name} (${sector})` : `PERMITIDO - ${name}`
}

export function denegadoYaIngresoCopy(
  when: string | number | null | undefined,
): string {
  const clock = formatScanClock(when)
  return clock ? `DENEGADO - Ya ingresó a las ${clock}` : "DENEGADO - Ya ingresó"
}

export function playGateTone(kind: "success" | "error" | "warning") {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const context = new AudioContextCtor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.type =
      kind === "success" ? "square" : kind === "warning" ? "triangle" : "sawtooth"
    oscillator.frequency.value =
      kind === "success" ? 1320 : kind === "warning" ? 420 : 165
    gain.gain.value = 0.08
    const now = context.currentTime
    oscillator.start(now)
    if (kind === "success") {
      oscillator.frequency.setValueAtTime(1760, now + 0.06)
      oscillator.stop(now + 0.12)
    } else if (kind === "warning") {
      oscillator.frequency.setValueAtTime(520, now + 0.1)
      oscillator.stop(now + 0.22)
    } else {
      oscillator.stop(now + 0.28)
    }
  } catch {
    // Audio opcional
  }
}

export function vibrateGate(kind: "success" | "error" | "warning") {
  try {
    if (!navigator.vibrate) return
    if (kind === "success") navigator.vibrate([20, 16, 20])
    else if (kind === "warning") navigator.vibrate([80, 30, 80])
    else navigator.vibrate([140, 40, 140])
  } catch {
    // optional
  }
}
