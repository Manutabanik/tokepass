export type UserRole = "customer" | "admin" | "super_admin"
export type EventStatus = "draft" | "published" | "cancelled" | "completed"
export type TicketStatus = "valid" | "scanned" | "revoked"
export type ZoneType = "general_admission" | "reserved_seating"
export type SeatStatus = "available" | "locked" | "sold"

export type Profile = {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export type Event = {
  id: string
  title: string
  description: string | null
  date: string
  location: string
  image_url: string | null
  status: EventStatus
  organizer_id: string
  venue_id: string | null
  created_at: string
  updated_at: string
}

export type Venue = {
  id: string
  organizer_id: string
  name: string
  location: string
  capacity: number
  created_at: string
  updated_at: string
}

export type TicketTier = {
  id: string
  event_id: string
  name: string
  price: number
  capacity: number
  sold: number
  time_limit: string | null
  bonus_reward: string | null
  zone_id: string | null
  created_at: string
  updated_at: string
}

export type Ticket = {
  id: string
  event_id: string
  tier_id: string
  owner_id: string
  qr_code: string
  status: TicketStatus
  order_id: string | null
  seat_id: string | null
  is_dynamic_qr: boolean
  created_at: string
  updated_at: string
}

type ProfileInsert = Omit<Profile, "role" | "created_at" | "updated_at"> & {
  role?: UserRole
  created_at?: string
  updated_at?: string
}
type EventInsert = Omit<
  Event,
  | "id"
  | "description"
  | "image_url"
  | "venue_id"
  | "status"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  description?: string | null
  image_url?: string | null
  venue_id?: string | null
  status?: EventStatus
  created_at?: string
  updated_at?: string
}
type VenueInsert = Omit<Venue, "id" | "created_at" | "updated_at"> & {
  id?: string
  created_at?: string
  updated_at?: string
}
type TicketTierInsert = Omit<
  TicketTier,
  | "id"
  | "sold"
  | "time_limit"
  | "bonus_reward"
  | "zone_id"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  sold?: number
  time_limit?: string | null
  bonus_reward?: string | null
  zone_id?: string | null
  created_at?: string
  updated_at?: string
}
type TicketInsert = Omit<
  Ticket,
  | "id"
  | "status"
  | "order_id"
  | "seat_id"
  | "is_dynamic_qr"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  status?: TicketStatus
  order_id?: string | null
  seat_id?: string | null
  is_dynamic_qr?: boolean
  created_at?: string
  updated_at?: string
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: ProfileInsert
        Update: Partial<ProfileInsert>
        Relationships: []
      }
      events: {
        Row: Event
        Insert: EventInsert
        Update: Partial<EventInsert>
        Relationships: [
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: Venue
        Insert: VenueInsert
        Update: Partial<VenueInsert>
        Relationships: []
      }
      ticket_tiers: {
        Row: TicketTier
        Insert: TicketTierInsert
        Update: Partial<TicketTierInsert>
        Relationships: []
      }
      tickets: {
        Row: Ticket
        Insert: TicketInsert
        Update: Partial<TicketInsert>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      reserve_tickets: {
        Args: {
          p_tier_id: string
          p_owner_id: string
          p_quantity: number
        }
        Returns: { ticket_id: string }[]
      }
    }
    Enums: {
      user_role: UserRole
      event_status: EventStatus
      ticket_status: TicketStatus
      zone_type: ZoneType
      seat_status: SeatStatus
    }
    CompositeTypes: Record<string, never>
  }
}
