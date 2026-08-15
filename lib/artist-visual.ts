const ARTIST_GRADIENTS = [
  "bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500",
  "bg-gradient-to-tr from-emerald-600 via-teal-500 to-sky-500",
  "bg-gradient-to-tr from-indigo-600 via-violet-500 to-fuchsia-500",
  "bg-gradient-to-tr from-rose-600 via-orange-500 to-amber-400",
  "bg-gradient-to-tr from-cyan-600 via-blue-500 to-indigo-500",
  "bg-gradient-to-tr from-lime-600 via-emerald-500 to-teal-400",
  "bg-gradient-to-tr from-fuchsia-600 via-rose-500 to-orange-400",
  "bg-gradient-to-tr from-slate-700 via-zinc-600 to-emerald-700",
] as const

export function artistDisplayName(name: string | null | undefined): string {
  return name?.trim() || "Artista"
}

export function artistGradientClass(name: string | null | undefined): string {
  const source = artistDisplayName(name)
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash + source.charCodeAt(index) * (index + 1)) % ARTIST_GRADIENTS.length
  }
  return ARTIST_GRADIENTS[hash] ?? ARTIST_GRADIENTS[0]
}
