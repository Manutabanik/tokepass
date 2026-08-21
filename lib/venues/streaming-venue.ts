export const STREAMING_VENUE_NAME = "Streaming / Online"
export const STREAMING_VENUE_LOCATION = "Online"

export function isStreamingVenue(venue: {
  venueName?: string | null
  venueLocation?: string | null
}) {
  const name = (venue.venueName ?? "").trim().toLowerCase()
  const location = (venue.venueLocation ?? "").trim().toLowerCase()
  return (
    name === STREAMING_VENUE_NAME.toLowerCase() || location === "online"
  )
}
