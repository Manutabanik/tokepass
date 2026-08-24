/** Flags del paso 3. `false` es el único valor que apaga el medio. */
export function eventAcceptsMercadoPago(value: unknown): boolean {
  return value !== false
}

export function eventAcceptsPosPayments(value: unknown): boolean {
  return value !== false
}
