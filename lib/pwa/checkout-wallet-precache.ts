/** Sandbox / free success already issued tickets — do not retry getMyTickets. */
export function shouldPrecacheCheckoutWallet(search: string): boolean {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  )
  return params.get("sandbox") !== "1" && params.get("free") !== "1"
}
