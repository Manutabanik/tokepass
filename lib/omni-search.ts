export const OMNI_SEARCH_MIN_CHARS = 2
export const OMNI_SEARCH_LIMIT = 6

export type OmniEventHit = {
  id: string
  slug: string
  title: string
  date: string
  location: string
  imageUrl: string | null
}

export type OmniArtistHit = {
  id: string
  name: string
  imageUrl: string | null
  activeEventCount: number
}

export type OmniSearchResult = {
  events: OmniEventHit[]
  artists: OmniArtistHit[]
}
