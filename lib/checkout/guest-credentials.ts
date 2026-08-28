export function buildCheckoutGuestAuthInput() {
  const id = crypto.randomUUID().replace(/-/g, "")
  return {
    email: `guest.${id}@tokepass.com.ar`,
    password: `G.${crypto.randomUUID()}${crypto.randomUUID()}`,
  }
}

export function isCheckoutGuestEmail(email: string) {
  return /^guest\.[a-f0-9]{32}@tokepass\.com\.ar$/i.test(email.trim())
}
