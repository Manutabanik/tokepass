/** Reloj UTC del servidor. Nunca usar timestamps del payload del cliente. */
export function serverUtcMs(now: Date | number = Date.now()): number {
  if (now instanceof Date) return now.getTime()
  return Number.isFinite(now) ? now : Date.now()
}

export function serverUtcNow(now?: Date | number): Date {
  return new Date(serverUtcMs(now))
}

export function serverUtcIso(now?: Date | number): string {
  return serverUtcNow(now).toISOString()
}
