export type UserRole = "customer" | "admin" | "super_admin"
export type OrganizerApprovalStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | "suspended"
export type EventStatus =
  | "draft"
  | "published"
  | "paused"
  | "cancelled"
  | "completed"
  | "archived"
export type QrType = "dynamic" | "static"
export type PaymentProvider =
  | "mercadopago"
  | "payway"
  | "naranjax"
  | "modo"
  | "nave"
  | "stripe"
  | "bank_transfer"
  | "pos_cash"
  | "pos_card"
  | "sandbox"
  | "free"
export type PaymentMethod =
  | "mercadopago"
  | "cash_pos"
  | "card_pos"
  | "transfer_pos"
  | "test_sandbox"
export type TicketStatus =
  | "pending_payment"
  | "valid"
  | "transferred"
  | "used"
  | "cancelled"
  /** @deprecated legacy — migrado a `used` */
  | "scanned"
  /** @deprecated legacy — migrado a `cancelled` */
  | "revoked"
export type ZoneType = "general_admission" | "reserved_seating"
export type SeatStatus = "available" | "locked" | "sold"
export type OrderStatus =
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "refunded"
export type OrganizerRiskTier =
  | "TIER_1_CUSTODY"
  | "TIER_2_INSTANT_SPLIT"
  | "TIER_3_ENTERPRISE"
export type OrganizerGuaranteeStatus =
  | "NONE"
  | "PROMISSORY_NOTE_SIGNED"
  | "INSURANCE_BOND_ACTIVE"
export type EventStaffRole = "door_staff" | "bar_staff" | "cashier"
export type TicketTierPhaseStatus = "scheduled" | "active" | "sold_out"
export type TicketReservationStatus = "held" | "confirmed" | "released"

export type EventStaffAssignment = {
  id: string
  event_id: string
  user_id: string
  role: EventStaffRole
  created_by: string | null
  created_at: string
  is_active: boolean
  expires_at: string | null
  pos_security_pin_hash: string | null
}

export type GuestListEntryStatus = "pending" | "claimed" | "checked_in"
export type ItemRedemptionStatus =
  | "pending"
  | "valid"
  | "redeemed"
  | "cancelled"

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Profile = {
  id: string
  email: string
  full_name: string | null
  /** Nombre público de productora (storefront). */
  public_name: string | null
  /** Bajada corta visible en el detalle del evento. */
  public_bio: string | null
  /** Logo / foto público. */
  avatar_url: string | null
  dni: string | null
  /** Teléfono / WhatsApp (progressive profiling). */
  phone: string | null
  role: UserRole
  /**
   * Comisión Tokepass (custom_commission_rate canónica).
   * Fracción decimal: 0.15 = 15% sobre precio público All-In.
   */
  service_charge_rate: number
  organizer_approval_status: OrganizerApprovalStatus
  risk_tier: OrganizerRiskTier
  guarantee_status: OrganizerGuaranteeStatus
  created_at: string
  updated_at: string
}

export type OrganizerApplicationStatus = "pending" | "approved" | "rejected"

export type OrganizerApplication = {
  id: string
  company_name: string
  cuit_cuil: string
  responsible_dni: string
  cbu_alias: string
  social_media_url: string
  status: OrganizerApplicationStatus
  review_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type OrganizerLead = {
  id: string
  full_name: string
  email: string
  phone: string
  event_name: string
  estimated_attendance: number
  created_at: string
}

export type OrganizerMpConnect = {
  organizer_id: string
  mp_user_id: string | null
  /** Solo service_role. Nunca enviar al browser. */
  access_token: string | null
  status: "disconnected" | "connected" | "revoked" | "error"
  connected_at: string | null
  revoked_at: string | null
  updated_at: string
  created_at: string
}

export type Artist = {
  id: string
  name: string
  image_url: string | null
  spotify_id: string | null
  genres: string[]
  bio: string | null
  top_track_preview_url: string | null
  top_track_name: string | null
  created_at: string
  updated_at: string
}

/** Join event ↔ artist (P73 / event_artists). `sort_order` es el orden de grilla. */
export type EventArtist = {
  id: string
  event_id: string
  artist_id: string
  performance_time: string | null
  stage: string | null
  /** Orden de grilla. Equivale a EventArtist.order. */
  sort_order: number
  /** Headliner destacado en la grilla pública (P74). */
  is_headliner: boolean
  created_at: string
  updated_at: string
}

/** Bloque de agenda (horario + título). El participante es opcional. */
export type AgendaBlock = {
  id: string
  event_id: string
  day_id: string | null
  title: string
  start_time: string
  end_time: string
  /** Orden de grilla. Equivale a AgendaBlock.order. */
  sort_order: number
  agenda_participants?: AgendaParticipant[]
  created_at: string
  updated_at: string
}

/** Participante opcional de un bloque (0..N, p. ej. panel). */
export type AgendaParticipant = {
  id: string
  agenda_block_id: string
  name: string
  role_tag: string
  image_url: string | null
  external_link: string | null
  sort_order: number
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
  flyer_url: string | null
  status: EventStatus
  organizer_id: string
  venue_id: string | null
  max_tickets_per_user: number | null
  qr_type: QrType
  /** public | private | guest_list_only */
  visibility: "public" | "private" | "guest_list_only"
  /** Espejo JSONB de event_schedules (transición). Fuente canónica: tabla relacional. */
  schedule_days: Json
  is_featured: boolean
  featured_tier: "silver" | "gold" | "platinum" | null
  featured_until: string | null
  /** Comisión % Tokepass (ej. 8.00 = 8%). */
  platform_fee_percentage: number
  /** Cargo fijo ARS por entrada paga (split All-In). */
  platform_fixed_fee: number
  /** Tope de capacidad total en tiers a $0. */
  max_free_tickets: number
  /** Auspicio Tokepass: fees a 0 + branding. */
  is_sponsored_by_tokepass: boolean
  /** SHA-256 hex del PIN de supervisor POS (cortesías / anulaciones). */
  pos_supervisor_pin_hash: string | null
  /** Meta Pixel ID (opcional). */
  meta_pixel_id: string | null
  meta_pixel_enabled: boolean
  /** TikTok Pixel ID (opcional). */
  tiktok_pixel_id: string | null
  tiktok_pixel_enabled: boolean
  /** GA4 Measurement ID G-… (opcional). */
  ga4_measurement_id: string | null
  ga4_enabled: boolean
  /** Spot YouTube/Vimeo (solo URL; sin video en Storage). */
  promo_video_url: string | null
  /** Hasta 4 URLs de galería (imágenes ligeras). */
  gallery_urls: string[] | null
  /** Flyer vertical 9:16 para Stories post-compra (opcional). */
  social_share_image_url: string | null
  /** Taxonomía centralizada (Super Admin). */
  category_id: string | null
  /** ATP | +16 | +18 (enum DB: atp, 16, 18). */
  age_restriction: "atp" | "16" | "18"
  /** Cierre de jornada única; multijornada usa schedule_days. */
  ends_at: string | null
  /** URL pública /eventos/{slug}. Estable una vez asignado. */
  slug: string
  /** Plano visual del recinto (editor SVG). */
  venue_map: Json
  /** Si el evento usa el paso de mapa y sectores numerados. */
  has_seating_plan: boolean
  /** Si el evento publica una agenda de bloques de actividad. */
  has_schedule: boolean
  province: string | null
  department: string | null
  /** Tab inicial del picker B2C. auto = el de más stock restante. */
  default_ticket_tab: "auto" | "seated" | "general" | "bundle" | "addon"
  /** Fallback JSON de lineup (P72). La grilla canónica es event_artists. */
  lineup?: Json | null
  /** Relación inversa EventArtist[] (join event_artists). */
  event_artists?: EventArtist[]
  /** Relación inversa AgendaBlock[] (agenda universal). */
  agenda_blocks?: AgendaBlock[]
  created_at: string
  updated_at: string
}

export type EventSchedule = {
  id: string
  event_id: string
  title: string
  start_time: string
  end_time: string
}

export type EventCategory = {
  id: string
  name: string
  slug: string
  icon_name: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type PlatformSponsor = {
  id: string
  name: string
  logo_url: string
  website_url: string | null
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export type EventSponsor = {
  id: string
  event_id: string
  name: string
  logo_url: string
  website_url: string | null
  tier: "main" | "regular"
  display_order: number
  created_at: string
  updated_at: string
}

export type BoostSubscription = {
  id: string
  event_id: string
  organizer_id: string
  tier: "silver" | "gold" | "platinum"
  amount_paid: number
  duration_days: number
  payment_status: "pending" | "paid" | "failed" | "refunded"
  payment_id_mp: string | null
  created_at: string
  updated_at: string
}

export type OrganizationVenueTemplate = {
  id: string
  organizer_id: string
  name: string
  venue_map: Json
  created_at: string
  updated_at: string
}

export type Venue = {
  id: string
  organizer_id: string
  name: string
  location: string
  address: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  capacity: number
  /** Presupuesto físico del recinto (alineado a capacity). */
  max_capacity: number
  zone_blueprint: Json
  seating_layout: Json
  venue_map: Json
  seating_background_url: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export type TicketTier = {
  id: string
  event_id: string
  name: string
  /** Precio final All-In publicado al comprador. */
  price: number
  /** Ingreso neto del organizador por entrada. */
  base_price: number
  /** Comisión unitaria Tokepass absorbida en `price`. */
  platform_fee: number
  capacity: number
  /** Cupo total del SKU; se mantiene alineado a capacity. */
  total_capacity: number
  sold: number
  time_limit: string | null
  bonus_reward: string | null
  zone_id: string | null
  /** NULL = abono / fecha única; si no, FK a event_schedules.id */
  day_id: string | null
  visibility: "public" | "private"
  layout_type: "general" | "table_combo" | "numbered_seat"
  seating_sector_id: string | null
  capacity_per_unit: number
  /** QRs independientes por unidad vendida (mesa/agrupación). */
  admit_count: number
  /** standard | bundle | special */
  category: "standard" | "bundle" | "special"
  /** Valor de referencia para mostrar ahorro (packs). */
  list_price: number | null
  /** seated | general | addon | bundle */
  tier_type: "seated" | "general" | "addon" | "bundle"
  /** Combo: [{ tier_id, quantity }] */
  bundle_items: Json
  /** multi_day_pass | cross_sell_pack | volume_discount */
  bundle_type: "multi_day_pass" | "cross_sell_pack" | "volume_discount" | null
  promo_discount_type: "PORCENTAJE" | "MONTO_FIJO" | "X_POR_Y" | null
  promo_discount_value: number
  promo_required_qty: number
  promo_pay_qty: number
  /** Copia corta para el picker B2C. */
  description: string | null
  /** Badge opcional. bestseller = Más vendida. */
  highlight_badge: "bestseller" | null
  created_at: string
  updated_at: string
}

export type Ticket = {
  id: string
  event_id: string
  tier_id: string
  owner_id: string | null
  qr_code: string
  totp_secret: string
  status: TicketStatus
  order_id: string | null
  seat_id: string | null
  seating_unit_id: string | null
  max_admissions: number
  admissions_used: number
  is_dynamic_qr: boolean
  max_transfers_allowed: number
  transfer_count: number
  transferred_from_id: string | null
  scanned_at: string | null
  validated_at: string | null
  validated_by: string | null
  /** Asistente declarado en checkout (lookup de puerta). */
  holder_name: string | null
  holder_dni: string | null
  holder_email: string | null
  /** Agrupa N QRs de una misma mesa/unidad. */
  group_id: string | null
  group_slot: number | null
  /** Lote de emisión masiva de cortesías. */
  batch_id: string | null
  /** Generada en borrador/preview; inválida en puerta de evento published. */
  is_test: boolean
  ticket_type: "admission" | "parking" | "access_pass"
  /** Fase / lote que vendió esta entrada. */
  phase_id: string | null
  created_at: string
  updated_at: string
}

export type TicketTierPhase = {
  id: string
  tier_id: string
  name: string
  price: number
  capacity_limit: number | null
  sold: number
  start_time: string | null
  end_time: string | null
  status: TicketTierPhaseStatus
  created_at: string
}

export type EventSkuChangelog = {
  id: string
  event_id: string
  tier_id: string | null
  phase_id: string | null
  changed_by: string | null
  field_changed: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

export type TicketReservation = {
  id: string
  event_id: string
  tier_id: string
  phase_id: string | null
  owner_id: string
  order_id: string | null
  quantity: number
  unit_price: number
  status: TicketReservationStatus
  created_at: string
}

export type TicketTransferStatus = "pending" | "accepted" | "cancelled"

export type TicketTransfer = {
  id: string
  sender_id: string
  receiver_email: string
  original_ticket_id: string
  new_ticket_id: string | null
  created_at: string
  status: TicketTransferStatus
  claim_token: string | null
  receiver_id: string | null
  accepted_at: string | null
  cancelled_at: string | null
}

export type TicketResaleListingStatus = "active" | "sold" | "cancelled"
export type PayoutPendingStatus = "pending" | "paid" | "cancelled"
export type PayoutRequestStatus =
  | "pending"
  | "processing"
  | "completed"
  | "rejected"

export type PayoutRequest = {
  id: string
  organizer_id: string
  event_id: string | null
  amount: number
  status: PayoutRequestStatus
  cbu_destination: string
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type TicketResaleListing = {
  id: string
  ticket_id: string
  seller_id: string
  event_id: string
  price: number
  platform_fee_amount: number
  seller_net_amount: number
  status: TicketResaleListingStatus
  buyer_id: string | null
  mp_preference_id: string | null
  mp_payment_id: string | null
  created_at: string
  updated_at: string
}

export type PayoutPending = {
  id: string
  seller_id: string
  listing_id: string
  event_id: string
  gross_amount: number
  platform_fee: number
  net_amount: number
  mp_payment_id: string | null
  status: PayoutPendingStatus
  created_at: string
  updated_at: string
}

export type MpWebhookEvent = {
  payment_id: string
  order_id: string | null
  status: string
  processed_at: string
  raw_summary: Json | null
}

export type PaymentWebhookEvent = {
  id: string
  provider: PaymentProvider
  external_event_id: string
  event_type: string
  payload: Json
  processed_at: string
}

export type EventZone = {
  id: string
  event_id: string
  name: string
  type: ZoneType
  capacity: number
  created_at: string
  updated_at: string
}

export type ZoneTierPricing = {
  id: string
  event_id: string
  zone_id: string | null
  sector_key: string
  ticket_tier_id: string
  price: number
  table_number_start: number | null
  table_number_end: number | null
  created_at: string
  updated_at: string
}

export type ZoneTierPricingInsert = {
  id?: string
  event_id: string
  zone_id?: string | null
  sector_key: string
  ticket_tier_id: string
  price?: number
  table_number_start?: number | null
  table_number_end?: number | null
  created_at?: string
  updated_at?: string
}

export type Seat = {
  id: string
  zone_id: string
  row_label: string
  seat_number: string
  status: SeatStatus
  created_at: string
  updated_at: string
}

export type EventSeatingUnit = {
  id: string
  event_id: string
  venue_id: string | null
  tier_id: string
  sector_id: string
  sector_name: string
  layout_item_id: string
  label: string
  row_id: string | null
  row_number: number | null
  row_label: string | null
  color: string
  layout_type: "table_combo" | "numbered_seat"
  capacity_per_unit: number
  status: "available" | "reserved" | "sold" | "blocked"
  reserved_by: string | null
  reserved_order_id: string | null
  reserved_until: string | null
  sold_order_id: string | null
  created_at: string
  updated_at: string
}

export type Promoter = {
  id: string
  organizer_id: string
  user_id: string | null
  name: string
  /** Fracción decimal: 0.10 = 10% */
  commission_rate: number
  /** percent = sobre subtotal; fixed = monto por entrada */
  commission_type: "percent" | "fixed"
  commission_fixed_amount: number | null
  referral_code: string
  created_at: string
  updated_at: string
}

export type PromoterReferralVisit = {
  id: string
  promoter_id: string
  referral_code: string
  path: string | null
  event_id: string | null
  visitor_key: string | null
  created_at: string
}

export type Addon = {
  id: string
  event_id: string
  name: string
  price: number
  stock: number
  created_at: string
  updated_at: string
}

export type PromoDiscountType = "percentage" | "fixed_amount"

export type PromoCode = {
  id: string
  event_id: string
  code: string
  discount_type: PromoDiscountType
  discount_value: number
  max_uses: number | null
  current_uses: number
  valid_until: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Order = {
  id: string
  buyer_id: string
  /** Costo de tickets */
  subtotal: number
  /** Ganancia plataforma */
  service_charge: number
  /** subtotal + service_charge */
  total_amount: number
  status: OrderStatus
  promoter_id: string | null
  promoter_commission_amount: number | null
  promoter_commission_type: "percent" | "fixed" | null
  promo_code_id: string | null
  discount_amount: number
  mp_preference_id: string | null
  mp_payment_id: string | null
  payment_provider: PaymentProvider
  provider_preference_id: string | null
  provider_transaction_id: string | null
  installment_plan: string | null
  provider_metadata: Json
  payment_method: PaymentMethod
  customer_phone: string | null
  guest_token: string | null
  cashier_shift_id: string | null
  cashier_user_id: string | null
  created_at: string
  updated_at: string
}

export type UserFavorite = {
  id: string
  user_id: string
  event_id: string
  created_at: string
}

export type UserFavoriteInsert = {
  id?: string
  user_id: string
  event_id: string
  created_at?: string
}

export type CashierShift = {
  id: string
  event_id: string
  cashier_id: string
  start_amount: number
  end_amount_expected: number | null
  end_amount_counted: number | null
  cash_sales_total: number
  card_sales_total: number
  transfer_sales_total: number
  tickets_sold: number
  status: "open" | "closed"
  opened_at: string
  closed_at: string | null
  created_at: string
  updated_at: string
}

export type OrganizerSettlement = {
  id: string
  organizer_id: string
  gross_amount: number
  platform_fee: number
  net_amount: number
  status: "pending" | "completed"
  period_label: string | null
  notes: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type PlatformOpsAudit = {
  id: string
  actor_id: string | null
  action: string
  event_id: string | null
  organizer_id: string | null
  reason: string | null
  metadata: Json
  created_at: string
}

export type OrderAddon = {
  id: string
  order_id: string
  addon_id: string
  quantity: number
  unit_price: number
  created_at: string
  updated_at: string
}

export type GuestList = {
  id: string
  event_id: string
  name: string
  max_guests: number
  valid_until: string
  created_at: string
  updated_at: string
}

export type GuestListEntry = {
  id: string
  guest_list_id: string
  full_name: string
  email: string | null
  phone: string | null
  status: GuestListEntryStatus
  ticket_id: string | null
  created_at: string
  updated_at: string
}

export type EventItemCategory =
  | "drinks"
  | "food"
  | "merch"
  | "services"
  | "upgrades"
  | "parking"
  | "access_pass"

export type EventItem = {
  id: string
  event_id: string
  name: string
  description: string | null
  price: number
  stock: number
  is_active: boolean
  image_url: string | null
  category: EventItemCategory
  includes_tier_id: string | null
  includes_tier_qty: number
  created_at: string
  updated_at: string
}

export type TicketTierComboItem = {
  id: string
  tier_id: string
  event_item_id: string
  quantity: number
  created_at: string
}

export type ItemRedemption = {
  id: string
  order_id: string
  item_id: string
  user_id: string
  qr_code_token: string
  status: ItemRedemptionStatus
  redeemed_at: string | null
  redeemed_by: string | null
  created_at: string
  updated_at: string
}

type ProfileInsert = Omit<
  Profile,
  | "role"
  | "created_at"
  | "updated_at"
  | "service_charge_rate"
  | "dni"
  | "phone"
  | "organizer_approval_status"
  | "risk_tier"
  | "guarantee_status"
> & {
  role?: UserRole
  service_charge_rate?: number
  dni?: string | null
  phone?: string | null
  organizer_approval_status?: OrganizerApprovalStatus
  risk_tier?: OrganizerRiskTier
  guarantee_status?: OrganizerGuaranteeStatus
  created_at?: string
  updated_at?: string
}
type EventInsert = Omit<
  Event,
  | "id"
  | "description"
  | "image_url"
  | "flyer_url"
  | "venue_id"
  | "status"
  | "max_tickets_per_user"
  | "qr_type"
  | "visibility"
  | "schedule_days"
  | "is_featured"
  | "featured_tier"
  | "featured_until"
  | "platform_fee_percentage"
  | "platform_fixed_fee"
  | "max_free_tickets"
  | "is_sponsored_by_tokepass"
  | "pos_supervisor_pin_hash"
  | "meta_pixel_id"
  | "meta_pixel_enabled"
  | "tiktok_pixel_id"
  | "tiktok_pixel_enabled"
  | "ga4_measurement_id"
  | "ga4_enabled"
  | "promo_video_url"
  | "gallery_urls"
  | "social_share_image_url"
  | "category_id"
  | "age_restriction"
  | "ends_at"
  | "slug"
  | "venue_map"
  | "province"
  | "department"
  | "default_ticket_tab"
  | "lineup"
  | "event_artists"
  | "agenda_blocks"
  | "has_schedule"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  default_ticket_tab?: Event["default_ticket_tab"]
  has_schedule?: boolean
  lineup?: Json | null
  description?: string | null
  image_url?: string | null
  flyer_url?: string | null
  venue_id?: string | null
  category_id?: string | null
  age_restriction?: Event["age_restriction"]
  ends_at?: string | null
  status?: EventStatus
  max_tickets_per_user?: number | null
  qr_type?: QrType
  visibility?: Event["visibility"]
  schedule_days?: Json
  is_featured?: boolean
  featured_tier?: Event["featured_tier"]
  featured_until?: string | null
  platform_fee_percentage?: number
  platform_fixed_fee?: number
  max_free_tickets?: number
  is_sponsored_by_tokepass?: boolean
  pos_supervisor_pin_hash?: string | null
  meta_pixel_id?: string | null
  meta_pixel_enabled?: boolean
  tiktok_pixel_id?: string | null
  tiktok_pixel_enabled?: boolean
  ga4_measurement_id?: string | null
  ga4_enabled?: boolean
  promo_video_url?: string | null
  gallery_urls?: string[] | null
  social_share_image_url?: string | null
  slug?: string
  venue_map?: Json
  province?: string | null
  department?: string | null
  created_at?: string
  updated_at?: string
}
type VenueInsert = Omit<
  Venue,
  | "id"
  | "seating_layout"
  | "venue_map"
  | "seating_background_url"
  | "is_archived"
  | "max_capacity"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  seating_layout?: Json
  venue_map?: Json
  seating_background_url?: string | null
  is_archived?: boolean
  max_capacity?: number
  created_at?: string
  updated_at?: string
}
type TicketTierInsert = Omit<
  TicketTier,
  | "id"
  | "sold"
  | "base_price"
  | "platform_fee"
  | "time_limit"
  | "bonus_reward"
  | "zone_id"
  | "day_id"
  | "visibility"
  | "layout_type"
  | "seating_sector_id"
  | "capacity_per_unit"
  | "admit_count"
  | "category"
  | "list_price"
  | "tier_type"
  | "bundle_items"
  | "bundle_type"
  | "promo_discount_type"
  | "promo_discount_value"
  | "promo_required_qty"
  | "promo_pay_qty"
  | "description"
  | "highlight_badge"
  | "total_capacity"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  sold?: number
  total_capacity?: number
  description?: string | null
  highlight_badge?: TicketTier["highlight_badge"]
  base_price?: number
  platform_fee?: number
  time_limit?: string | null
  bonus_reward?: string | null
  zone_id?: string | null
  day_id?: string | null
  visibility?: TicketTier["visibility"]
  layout_type?: TicketTier["layout_type"]
  seating_sector_id?: string | null
  capacity_per_unit?: number
  admit_count?: number
  category?: TicketTier["category"]
  list_price?: number | null
  tier_type?: TicketTier["tier_type"]
  bundle_items?: Json
  bundle_type?: TicketTier["bundle_type"]
  promo_discount_type?: TicketTier["promo_discount_type"]
  promo_discount_value?: number
  promo_required_qty?: number
  promo_pay_qty?: number
  created_at?: string
  updated_at?: string
}
type TicketInsert = Omit<
  Ticket,
  | "id"
  | "status"
  | "order_id"
  | "seat_id"
  | "seating_unit_id"
  | "max_admissions"
  | "admissions_used"
  | "is_dynamic_qr"
  | "totp_secret"
  | "max_transfers_allowed"
  | "transfer_count"
  | "transferred_from_id"
  | "scanned_at"
  | "validated_at"
  | "validated_by"
  | "holder_name"
  | "holder_dni"
  | "holder_email"
  | "group_id"
  | "group_slot"
  | "batch_id"
  | "is_test"
  | "ticket_type"
  | "phase_id"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  status?: TicketStatus
  order_id?: string | null
  seat_id?: string | null
  seating_unit_id?: string | null
  max_admissions?: number
  admissions_used?: number
  is_dynamic_qr?: boolean
  totp_secret?: string
  max_transfers_allowed?: number
  transfer_count?: number
  transferred_from_id?: string | null
  scanned_at?: string | null
  validated_at?: string | null
  validated_by?: string | null
  holder_name?: string | null
  holder_dni?: string | null
  holder_email?: string | null
  group_id?: string | null
  group_slot?: number | null
  batch_id?: string | null
  is_test?: boolean
  ticket_type?: "admission" | "parking" | "access_pass"
  phase_id?: string | null
  created_at?: string
  updated_at?: string
}
type EventZoneInsert = Omit<EventZone, "id" | "created_at" | "updated_at"> & {
  id?: string
  created_at?: string
  updated_at?: string
}
type SeatInsert = Omit<
  Seat,
  "id" | "status" | "created_at" | "updated_at"
> & {
  id?: string
  status?: SeatStatus
  created_at?: string
  updated_at?: string
}
type EventSeatingUnitInsert = Omit<
  EventSeatingUnit,
  | "id"
  | "status"
  | "reserved_by"
  | "reserved_order_id"
  | "reserved_until"
  | "sold_order_id"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  status?: EventSeatingUnit["status"]
  reserved_by?: string | null
  reserved_order_id?: string | null
  reserved_until?: string | null
  sold_order_id?: string | null
  created_at?: string
  updated_at?: string
}
type PromoterInsert = Omit<
  Promoter,
  | "id"
  | "created_at"
  | "updated_at"
  | "commission_type"
  | "commission_fixed_amount"
> & {
  id?: string
  created_at?: string
  updated_at?: string
  commission_type?: "percent" | "fixed"
  commission_fixed_amount?: number | null
}
type PromoterReferralVisitInsert = Omit<
  PromoterReferralVisit,
  "id" | "path" | "event_id" | "visitor_key" | "created_at"
> & {
  id?: string
  path?: string | null
  event_id?: string | null
  visitor_key?: string | null
  created_at?: string
}
type OrderInsert = Omit<
  Order,
  | "id"
  | "status"
  | "subtotal"
  | "service_charge"
  | "promoter_id"
  | "promoter_commission_amount"
  | "promoter_commission_type"
  | "promo_code_id"
  | "discount_amount"
  | "mp_preference_id"
  | "mp_payment_id"
  | "payment_provider"
  | "provider_preference_id"
  | "provider_transaction_id"
  | "installment_plan"
  | "provider_metadata"
  | "payment_method"
  | "customer_phone"
  | "guest_token"
  | "cashier_shift_id"
  | "cashier_user_id"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  status?: OrderStatus
  subtotal?: number
  service_charge?: number
  promoter_id?: string | null
  promoter_commission_amount?: number | null
  promoter_commission_type?: "percent" | "fixed" | null
  promo_code_id?: string | null
  discount_amount?: number
  mp_preference_id?: string | null
  mp_payment_id?: string | null
  payment_provider?: PaymentProvider
  provider_preference_id?: string | null
  provider_transaction_id?: string | null
  installment_plan?: string | null
  provider_metadata?: Json
  payment_method?: PaymentMethod
  customer_phone?: string | null
  guest_token?: string | null
  cashier_shift_id?: string | null
  cashier_user_id?: string | null
  created_at?: string
  updated_at?: string
}
type PromoCodeInsert = Omit<
  PromoCode,
  "id" | "current_uses" | "is_active" | "created_at" | "updated_at"
> & {
  id?: string
  current_uses?: number
  is_active?: boolean
  max_uses?: number | null
  valid_until?: string | null
  created_at?: string
  updated_at?: string
}
type OrganizerSettlementInsert = Omit<
  OrganizerSettlement,
  | "id"
  | "status"
  | "period_label"
  | "notes"
  | "completed_at"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  status?: "pending" | "completed"
  period_label?: string | null
  notes?: string | null
  completed_at?: string | null
  created_at?: string
  updated_at?: string
}

type GuestListInsert = Omit<GuestList, "id" | "created_at" | "updated_at"> & {
  id?: string
  created_at?: string
  updated_at?: string
}

type GuestListEntryInsert = Omit<
  GuestListEntry,
  "id" | "status" | "ticket_id" | "email" | "phone" | "created_at" | "updated_at"
> & {
  id?: string
  status?: GuestListEntryStatus
  ticket_id?: string | null
  email?: string | null
  phone?: string | null
  created_at?: string
  updated_at?: string
}

type EventItemInsert = Omit<
  EventItem,
  | "id"
  | "description"
  | "is_active"
  | "image_url"
  | "category"
  | "includes_tier_id"
  | "includes_tier_qty"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  description?: string | null
  is_active?: boolean
  image_url?: string | null
  category?: EventItemCategory
  includes_tier_id?: string | null
  includes_tier_qty?: number
  created_at?: string
  updated_at?: string
}

type ItemRedemptionInsert = Omit<
  ItemRedemption,
  | "id"
  | "status"
  | "redeemed_at"
  | "redeemed_by"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  status?: ItemRedemptionStatus
  redeemed_at?: string | null
  redeemed_by?: string | null
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
      organizer_applications: {
        Row: OrganizerApplication
        Insert: {
          id: string
          company_name: string
          cuit_cuil: string
          responsible_dni: string
          cbu_alias: string
          social_media_url: string
          status?: OrganizerApplicationStatus
          review_notes?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          company_name: string
          cuit_cuil: string
          responsible_dni: string
          cbu_alias: string
          social_media_url: string
          status: OrganizerApplicationStatus
          review_notes: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          updated_at: string
        }>
        Relationships: []
      }
      organizer_leads: {
        Row: OrganizerLead
        Insert: {
          id?: string
          full_name: string
          email: string
          phone: string
          event_name: string
          estimated_attendance: number
          created_at?: string
        }
        Update: Partial<{
          full_name: string
          email: string
          phone: string
          event_name: string
          estimated_attendance: number
        }>
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
          {
            foreignKeyName: "events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_artists_event_id_fkey"
            columns: ["id"]
            isOneToOne: false
            referencedRelation: "event_artists"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "agenda_blocks_event_id_fkey"
            columns: ["id"]
            isOneToOne: false
            referencedRelation: "agenda_blocks"
            referencedColumns: ["event_id"]
          },
        ]
      }
      event_schedules: {
        Row: EventSchedule
        Insert: {
          id?: string
          event_id: string
          title?: string
          start_time: string
          end_time: string
        }
        Update: Partial<{
          event_id: string
          title: string
          start_time: string
          end_time: string
        }>
        Relationships: [
          {
            foreignKeyName: "event_schedules_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_categories: {
        Row: EventCategory
        Insert: {
          id?: string
          name: string
          slug: string
          icon_name?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          name: string
          slug: string
          icon_name: string | null
          is_active: boolean
          sort_order: number
          updated_at: string
        }>
        Relationships: []
      }
      platform_sponsors: {
        Row: PlatformSponsor
        Insert: {
          id?: string
          name: string
          logo_url: string
          website_url?: string | null
          is_active?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          name: string
          logo_url: string
          website_url: string | null
          is_active: boolean
          display_order: number
          updated_at: string
        }>
        Relationships: []
      }
      event_sponsors: {
        Row: EventSponsor
        Insert: {
          id?: string
          event_id: string
          name: string
          logo_url: string
          website_url?: string | null
          tier?: EventSponsor["tier"]
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          name: string
          logo_url: string
          website_url: string | null
          tier: EventSponsor["tier"]
          display_order: number
          updated_at: string
        }>
        Relationships: [
          {
            foreignKeyName: "event_sponsors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      artists: {
        Row: Artist
        Insert: {
          id?: string
          name: string
          image_url?: string | null
          spotify_id?: string | null
          genres?: string[]
          bio?: string | null
          top_track_preview_url?: string | null
          top_track_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          name: string
          image_url: string | null
          spotify_id: string | null
          genres: string[]
          bio: string | null
          top_track_preview_url: string | null
          top_track_name: string | null
          updated_at: string
        }>
        Relationships: []
      }
      event_artists: {
        Row: EventArtist
        Insert: {
          id?: string
          event_id: string
          artist_id: string
          performance_time?: string | null
          stage?: string | null
          sort_order?: number
          is_headliner?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          event_id: string
          artist_id: string
          performance_time: string | null
          stage: string | null
          sort_order: number
          is_headliner: boolean
          updated_at: string
        }>
        Relationships: [
          {
            foreignKeyName: "event_artists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_blocks: {
        Row: AgendaBlock
        Insert: {
          id?: string
          event_id: string
          day_id?: string | null
          title: string
          start_time: string
          end_time: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          event_id: string
          day_id: string | null
          title: string
          start_time: string
          end_time: string
          sort_order: number
          updated_at: string
        }>
        Relationships: [
          {
            foreignKeyName: "agenda_blocks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_blocks_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "event_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_participants: {
        Row: AgendaParticipant
        Insert: {
          id?: string
          agenda_block_id: string
          name: string
          role_tag?: string
          image_url?: string | null
          external_link?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          agenda_block_id: string
          name: string
          role_tag: string
          image_url: string | null
          external_link: string | null
          sort_order: number
          updated_at: string
        }>
        Relationships: [
          {
            foreignKeyName: "agenda_participants_agenda_block_id_fkey"
            columns: ["agenda_block_id"]
            isOneToOne: false
            referencedRelation: "agenda_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      boost_subscriptions: {
        Row: BoostSubscription
        Insert: {
          id?: string
          event_id: string
          organizer_id: string
          tier: BoostSubscription["tier"]
          amount_paid: number
          duration_days: number
          payment_status?: BoostSubscription["payment_status"]
          payment_id_mp?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<BoostSubscription>
        Relationships: []
      }
      organization_venue_templates: {
        Row: OrganizationVenueTemplate
        Insert: {
          id?: string
          organizer_id: string
          name: string
          venue_map: Json
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          name: string
          venue_map: Json
          updated_at: string
        }>
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "ticket_tiers_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "event_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_tier_phases: {
        Row: TicketTierPhase
        Insert: Omit<
          TicketTierPhase,
          "id" | "sold" | "status" | "created_at"
        > & {
          id?: string
          sold?: number
          status?: TicketTierPhaseStatus
          created_at?: string
        }
        Update: Partial<TicketTierPhase>
        Relationships: []
      }
      event_sku_changelog: {
        Row: EventSkuChangelog
        Insert: Omit<EventSkuChangelog, "id" | "created_at"> & {
          id?: string
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      ticket_reservations: {
        Row: TicketReservation
        Insert: Omit<TicketReservation, "id" | "status" | "created_at"> & {
          id?: string
          status?: TicketReservationStatus
          created_at?: string
        }
        Update: Partial<Omit<TicketReservation, "id" | "created_at">>
        Relationships: []
      }
      tickets: {
        Row: Ticket
        Insert: TicketInsert
        Update: Partial<TicketInsert>
        Relationships: [
          {
            foreignKeyName: "tickets_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_zones: {
        Row: EventZone
        Insert: EventZoneInsert
        Update: Partial<EventZoneInsert>
        Relationships: []
      }
      zone_tier_pricing: {
        Row: ZoneTierPricing
        Insert: ZoneTierPricingInsert
        Update: Partial<ZoneTierPricingInsert>
        Relationships: []
      }
      seats: {
        Row: Seat
        Insert: SeatInsert
        Update: Partial<SeatInsert>
        Relationships: []
      }
      event_seating_units: {
        Row: EventSeatingUnit
        Insert: EventSeatingUnitInsert
        Update: Partial<EventSeatingUnitInsert>
        Relationships: []
      }
      promoters: {
        Row: Promoter
        Insert: PromoterInsert
        Update: Partial<PromoterInsert>
        Relationships: []
      }
      promoter_referral_visits: {
        Row: PromoterReferralVisit
        Insert: PromoterReferralVisitInsert
        Update: Partial<PromoterReferralVisitInsert>
        Relationships: []
      }
      promo_codes: {
        Row: PromoCode
        Insert: PromoCodeInsert
        Update: Partial<PromoCodeInsert>
        Relationships: []
      }
      orders: {
        Row: Order
        Insert: OrderInsert
        Update: Partial<OrderInsert>
        Relationships: []
      }
      cashier_shifts: {
        Row: CashierShift
        Insert: {
          id?: string
          event_id: string
          cashier_id: string
          start_amount?: number
          end_amount_expected?: number | null
          end_amount_counted?: number | null
          cash_sales_total?: number
          card_sales_total?: number
          transfer_sales_total?: number
          tickets_sold?: number
          status?: "open" | "closed"
          opened_at?: string
          closed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<CashierShift>
        Relationships: []
      }
      organizer_settlements: {
        Row: OrganizerSettlement
        Insert: OrganizerSettlementInsert
        Update: Partial<OrganizerSettlementInsert>
        Relationships: []
      }
      platform_ops_audit: {
        Row: PlatformOpsAudit
        Insert: {
          id?: string
          actor_id?: string | null
          action: string
          event_id?: string | null
          organizer_id?: string | null
          reason?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: Partial<PlatformOpsAudit>
        Relationships: []
      }
      checkout_security_events: {
        Row: {
          id: string
          order_id: string | null
          event_id: string | null
          buyer_id: string | null
          ip: string | null
          user_agent: string | null
          device_hash: string | null
          dwell_ms: number | null
          captcha_provider: string | null
          captcha_score: number | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id?: string | null
          event_id?: string | null
          buyer_id?: string | null
          ip?: string | null
          user_agent?: string | null
          device_hash?: string | null
          dwell_ms?: number | null
          captcha_provider?: string | null
          captcha_score?: number | null
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      guest_access_challenges: {
        Row: {
          id: string
          order_id: string
          email: string
          phone: string | null
          otp_hash: string
          magic_jti: string
          otp_attempts: number
          verified_at: string | null
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          email: string
          phone?: string | null
          otp_hash: string
          magic_jti: string
          otp_attempts?: number
          verified_at?: string | null
          expires_at: string
          created_at?: string
        }
        Update: {
          otp_attempts?: number
          verified_at?: string | null
          otp_hash?: string
          expires_at?: string
          magic_jti?: string
        }
        Relationships: []
      }
      organizer_mp_connect: {
        Row: OrganizerMpConnect
        Insert: {
          organizer_id: string
          mp_user_id?: string | null
          access_token?: string | null
          status?: OrganizerMpConnect["status"]
          connected_at?: string | null
          revoked_at?: string | null
          updated_at?: string
          created_at?: string
        }
        Update: Partial<OrganizerMpConnect>
        Relationships: []
      }
      guest_lists: {
        Row: GuestList
        Insert: GuestListInsert
        Update: Partial<GuestListInsert>
        Relationships: []
      }
      guest_list_entries: {
        Row: GuestListEntry
        Insert: GuestListEntryInsert
        Update: Partial<GuestListEntryInsert>
        Relationships: []
      }
      event_staff_assignments: {
        Row: EventStaffAssignment
        Insert: {
          id?: string
          event_id: string
          user_id: string
          role: EventStaffRole
          created_by?: string | null
          created_at?: string
          is_active?: boolean
          expires_at?: string | null
          pos_security_pin_hash?: string | null
        }
        Update: Partial<EventStaffAssignment>
        Relationships: []
      }
      event_items: {
        Row: EventItem
        Insert: EventItemInsert
        Update: Partial<EventItemInsert>
        Relationships: []
      }
      ticket_tier_combo_items: {
        Row: TicketTierComboItem
        Insert: {
          id?: string
          tier_id: string
          event_item_id: string
          quantity?: number
          created_at?: string
        }
        Update: Partial<TicketTierComboItem>
        Relationships: []
      }
      item_redemptions: {
        Row: ItemRedemption
        Insert: ItemRedemptionInsert
        Update: Partial<ItemRedemptionInsert>
        Relationships: []
      }
      ticket_transfers: {
        Row: TicketTransfer
        Insert: Omit<
          TicketTransfer,
          | "id"
          | "new_ticket_id"
          | "created_at"
          | "status"
          | "claim_token"
          | "receiver_id"
          | "accepted_at"
          | "cancelled_at"
        > & {
          id?: string
          new_ticket_id?: string | null
          created_at?: string
          status?: TicketTransferStatus
          claim_token?: string | null
          receiver_id?: string | null
          accepted_at?: string | null
          cancelled_at?: string | null
        }
        Update: Partial<TicketTransfer>
        Relationships: []
      }
      user_favorites: {
        Row: UserFavorite
        Insert: UserFavoriteInsert
        Update: Partial<UserFavoriteInsert>
        Relationships: []
      }
      ticket_resale_listings: {
        Row: TicketResaleListing
        Insert: {
          id?: string
          ticket_id: string
          seller_id: string
          event_id: string
          price: number
          platform_fee_amount?: number
          seller_net_amount?: number
          status?: TicketResaleListingStatus
          buyer_id?: string | null
          mp_preference_id?: string | null
          mp_payment_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<TicketResaleListing>
        Relationships: []
      }
      payouts_pending: {
        Row: PayoutPending
        Insert: {
          id?: string
          seller_id: string
          listing_id: string
          event_id: string
          gross_amount: number
          platform_fee?: number
          net_amount: number
          mp_payment_id?: string | null
          status?: PayoutPendingStatus
          created_at?: string
          updated_at?: string
        }
        Update: Partial<PayoutPending>
        Relationships: []
      }
      payout_requests: {
        Row: PayoutRequest
        Insert: {
          id?: string
          organizer_id: string
          event_id?: string | null
          amount: number
          status?: PayoutRequestStatus
          cbu_destination: string
          admin_notes?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          event_id: string | null
          amount: number
          status: PayoutRequestStatus
          cbu_destination: string
          admin_notes: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          updated_at: string
        }>
        Relationships: []
      }
      mp_webhook_events: {
        Row: MpWebhookEvent
        Insert: {
          payment_id: string
          order_id?: string | null
          status: string
          processed_at?: string
          raw_summary?: Json | null
        }
        Update: Partial<MpWebhookEvent>
        Relationships: []
      }
      payment_webhook_events: {
        Row: PaymentWebhookEvent
        Insert: {
          id?: string
          provider: PaymentProvider
          external_event_id: string
          event_type: string
          payload: Json
          processed_at?: string
        }
        Update: Partial<PaymentWebhookEvent>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      get_public_organizer_profile: {
        Args: {
          p_organizer_id: string
        }
        Returns: {
          public_name: string | null
          public_bio: string | null
          avatar_url: string | null
          full_name: string | null
        }[]
      }
      expire_buyer_pending_event_orders: {
        Args: {
          p_owner_id: string
          p_event_id: string
        }
        Returns: number
      }
      count_user_event_tickets_for_limit: {
        Args: {
          p_event_id: string
          p_owner_id: string
        }
        Returns: number
      }
      resolve_zone_tier_unit_price: {
        Args: {
          p_event_id: string
          p_ticket_tier_id: string
          p_sector_key?: string | null
          p_table_number?: number | null
          p_zone_id?: string | null
        }
        Returns: number
      }
      reserve_hybrid_cart_tx: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_items: Json
          p_promoter_id?: string | null
        }
        Returns: {
          order_id: string
          ticket_id: string
          subtotal: number
          service_charge: number
          total_amount: number
        }[]
      }
      reserve_unified_cart_tx: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_items: Json
          p_promoter_id?: string | null
        }
        Returns: {
          order_id: string
          ticket_id: string
          subtotal: number
          service_charge: number
          total_amount: number
        }[]
      }
      reserve_tickets_atomic: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_tier_id: string
          p_quantity: number
          p_phase_id?: string | null
        }
        Returns: {
          reservation_id: string
          order_id: string
          phase_id: string | null
          ticket_id: string
          unit_price: number
          quantity: number
        }[]
      }
      assert_cascade_stock_available: {
        Args: {
          p_event_id: string
          p_tier_id: string
          p_quantity: number
          p_phase_id?: string | null
        }
        Returns: {
          venue_id: string | null
          phase_id: string | null
          unit_price: number
          venue_remaining: number | null
          tier_remaining: number
          phase_remaining: number
        }[]
      }
      reserve_tickets_tx: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_items: Json
          p_promoter_id?: string | null
        }
        Returns: {
          order_id: string
          ticket_id: string
          subtotal: number
          service_charge: number
          total_amount: number
        }[]
      }
      reserve_seating_unit_tx: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_tier_id: string
          p_seating_unit_id: string
          p_promoter_id?: string | null
        }
        Returns: {
          order_id: string
          ticket_id: string
          seating_unit_id: string
          reserved_until: string
          subtotal: number
          service_charge: number
          total_amount: number
        }[]
      }
      materialize_event_seating_units: {
        Args: {
          p_event_id: string
        }
        Returns: number
      }
      seating_unit_is_owner_cart_hold: {
        Args: {
          p_status: string
          p_reserved_by: string
          p_reserved_until: string
          p_reserved_order_id: string | null
          p_owner_id: string
        }
        Returns: boolean
      }
      hold_seating_unit_for_cart: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_seating_unit_id: string
        }
        Returns: {
          seating_unit_id: string
          reserved_until: string
        }[]
      }
      release_seating_unit_cart_hold: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_seating_unit_id: string
        }
        Returns: boolean
      }
      get_seating_unit_cart_hold: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_seating_unit_id: string
        }
        Returns: {
          seating_unit_id: string
          reserved_until: string
        }[]
      }
      checkout_hold_until: {
        Args: Record<string, never>
        Returns: string
      }
      hold_ga_tickets_for_cart: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_items: Json
        }
        Returns: {
          reserved_until: string
        }[]
      }
      release_ga_cart_holds: {
        Args: {
          p_event_id: string
          p_owner_id: string
        }
        Returns: number
      }
      get_ga_cart_hold: {
        Args: {
          p_event_id: string
          p_owner_id: string
        }
        Returns: {
          reserved_until: string
          quantity: number
        }[]
      }
      claim_ga_cart_holds_for_checkout: {
        Args: {
          p_event_id: string
          p_owner_id: string
        }
        Returns: number
      }
      claim_and_reserve_ga_cart_tx: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_items: Json
          p_promoter_id?: string | null
        }
        Returns: {
          order_id: string
          ticket_id: string
          subtotal: number
          service_charge: number
          total_amount: number
        }[]
      }
      list_cart_holds: {
        Args: {
          p_event_id: string
          p_owner_id: string
        }
        Returns: {
          hold_kind: string
          tier_id: string
          quantity: number
          seating_unit_id: string | null
          layout_item_id: string | null
          label: string | null
          reserved_until: string
        }[]
      }
      all_in_platform_fee_for_event: {
        Args: {
          p_event_id: string
          p_public: number
        }
        Returns: number
      }
      expire_ga_cart_holds: {
        Args: Record<string, never>
        Returns: number
      }
      heal_ticket_tier_phases: {
        Args: {
          p_event_id?: string | null
        }
        Returns: number
      }
      purge_expired_checkout_holds: {
        Args: {
          p_event_id?: string | null
        }
        Returns: number
      }
      get_event_tier_live_stock: {
        Args: {
          p_event_id: string
        }
        Returns: {
          tier_id: string
          capacity: number
          sold: number
          available: number
          venue_remaining: number | null
        }[]
      }
      event_schedules_as_jsonb: {
        Args: {
          p_event_id: string
        }
        Returns: Json
      }
      claim_seating_unit_for_checkout: {
        Args: {
          p_unit_id: string
          p_event_id: string
          p_tier_id: string
          p_owner_id: string
          p_order_id: string
          p_hold_until: string
        }
        Returns: string
      }
      expire_seating_cart_holds: {
        Args: Record<string, never>
        Returns: number
      }
      get_event_seating_availability: {
        Args: {
          p_event_id: string
        }
        Returns: {
          id: string
          tier_id: string
          sector_id: string
          sector_name: string
          layout_item_id: string
          label: string
          row_id: string | null
          row_number: number | null
          row_label: string | null
          color: string
          layout_type: "table_combo" | "numbered_seat"
          capacity_per_unit: number
          status: "available" | "reserved" | "sold" | "blocked"
          reserved_until: string | null
        }[]
      }
      get_event_seating_sector_summary: {
        Args: {
          p_event_id: string
        }
        Returns: {
          sector_id: string
          sector_name: string
          color: string
          layout_type: string
          capacity_per_unit: number
          tier_id: string
          available: number
          reserved: number
          sold: number
          blocked: number
          total: number
        }[]
      }
      get_event_seating_units_by_sector: {
        Args: {
          p_event_id: string
          p_sector_id: string
        }
        Returns: {
          id: string
          tier_id: string
          sector_id: string
          sector_name: string
          layout_item_id: string
          label: string
          row_id: string | null
          row_number: number | null
          row_label: string | null
          color: string
          layout_type: string
          capacity_per_unit: number
          status: string
          reserved_until: string | null
        }[]
      }
      get_event_seating_unit: {
        Args: {
          p_event_id: string
          p_unit_id: string
        }
        Returns: {
          id: string
          tier_id: string
          sector_id: string
          sector_name: string
          layout_item_id: string
          label: string
          status: string
          reserved_until: string | null
        }[]
      }
      get_event_scanner_gates: {
        Args: {
          p_event_id: string
        }
        Returns: {
          gate_id: string
          label: string
          color: string
          kind: string
        }[]
      }
      get_live_dashboard_stats: {
        Args: {
          p_event_id: string
        }
        Returns: Json
      }
      scan_ticket_admission: {
        Args: {
          p_ticket_id: string
          p_validated_by: string
        }
        Returns: Json
      }
      configure_event_seating_tiers: {
        Args: {
          p_event_id: string
          p_configs: Json
        }
        Returns: undefined
      }
      expire_seating_orders: {
        Args: Record<string, never>
        Returns: number
      }
      get_event_service_charge_rate: {
        Args: {
          p_event_id: string
        }
        Returns: number
      }
      get_event_platform_fixed_fee: {
        Args: {
          p_event_id: string
        }
        Returns: number
      }
      all_in_public_price: {
        Args: {
          p_base: number
          p_rate?: number
        }
        Returns: number
      }
      all_in_platform_fee: {
        Args: {
          p_base: number
          p_rate?: number
        }
        Returns: number
      }
      create_complete_event_tx: {
        Args: {
          payload: Json
          p_organizer_id: string
        }
        Returns: string
      }
      create_complete_event_with_seating_tx: {
        Args: {
          payload: Json
          p_organizer_id: string
        }
        Returns: string
      }
      update_complete_event_tx: {
        Args: {
          p_event_id: string
          payload: Json
        }
        Returns: string
      }
      update_complete_event_with_seating_tx: {
        Args: {
          p_event_id: string
          payload: Json
        }
        Returns: string
      }
      get_organizer_metrics: {
        Args: {
          p_organizer_id: string
        }
        Returns: Json
      }
      organizer_paid_ledger: {
        Args: {
          p_organizer_id: string
        }
        Returns: Array<{
          gross_revenue: number
          tokepass_service_charge: number
          organizer_net_payout: number
          mp_gross: number
          pos_gross: number
          mp_fees: number
          pos_fees: number
        }>
      }
      get_organizer_governance_metrics: {
        Args: {
          p_organizer_id: string
        }
        Returns: Array<{
          total_events: number
          published_events: number
          tickets_sold: number
          historical_gmv: number
        }>
      }
      get_platform_global_metrics: {
        Args: Record<string, never>
        Returns: Array<{
          total_gmv: number
          platform_revenue: number
          total_tickets: number
          active_organizers: number
        }>
      }
      get_platform_organizations_summary: {
        Args: Record<string, never>
        Returns: Array<{
          organizer_id: string
          organizer_name: string
          organizer_email: string
          organizer_role: string
          approval_status: string
          service_charge_rate: number
          joined_at: string
          total_events: number
          published_events: number
          tickets_sold: number
          gross_revenue: number
        }>
      }
      update_organizer_governance_tx: {
        Args: {
          p_organizer_id: string
          p_actor_id: string
          p_status?: string | null
          p_service_charge_rate?: number | null
        }
        Returns: undefined
      }
      update_organizer_risk_matrix_tx: {
        Args: {
          p_organizer_id: string
          p_actor_id: string
          p_risk_tier?: string | null
          p_guarantee_status?: string | null
          p_service_charge_rate?: number | null
          p_mp_user_id?: string | null
          p_mp_access_token?: string | null
          p_clear_mp_access_token?: boolean
        }
        Returns: undefined
      }
      execute_mass_event_refund_tx: {
        Args: {
          p_event_id: string
          p_actor_id: string
          p_reason: string
        }
        Returns: Array<{
          order_id: string
          mp_payment_id: string | null
          total_amount: number
          risk_tier: string
          organizer_id: string
          tickets_cancelled: number
        }>
      }
      purge_event_test_tickets: {
        Args: {
          p_event_id: string
        }
        Returns: number
      }
      get_organizer_finance_summary: {
        Args: {
          p_organizer_id: string
        }
        Returns: Json
      }
      is_approved_organizer: {
        Args: {
          p_user_id?: string
        }
        Returns: boolean
      }
      release_reserved_tickets: {
        Args: {
          p_ticket_ids: string[]
        }
        Returns: undefined
      }
      activate_order_tickets: {
        Args: {
          p_order_id: string
        }
        Returns: number
      }
      finalize_paid_order: {
        Args: {
          p_order_id: string
          p_mp_payment_id?: string
          p_provider?: string
          p_transaction_id?: string
          p_metadata?: Json
        }
        Returns: Json
      }
      claim_and_finalize_paid_order: {
        Args: {
          p_order_id: string
          p_provider: string
          p_transaction_id: string
          p_event_type?: string
          p_payload?: Json
        }
        Returns: Json
      }
      release_leftover_cart_holds_for_order: {
        Args: {
          p_order_id: string
        }
        Returns: number
      }
      mark_order_test_sandbox: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      get_event_public_access_gate: {
        Args: { p_event_id: string }
        Returns: {
          event_id: string
          title: string
          status: EventStatus
        }[]
      }
      cancel_paid_order_tickets: {
        Args: {
          p_order_id: string
        }
        Returns: number
      }
      is_ticket_admission_eligible: {
        Args: {
          p_ticket_id: string
        }
        Returns: boolean
      }
      expire_abandoned_order: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      expire_abandoned_orders: {
        Args: { p_older_than?: string }
        Returns: number
      }
      consume_rate_limit: {
        Args: {
          p_bucket_key: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      is_rate_limited: {
        Args: {
          p_bucket_key: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      count_guest_identity_tickets: {
        Args: {
          p_event_id: string
          p_holder_dni: string
          p_holder_email: string
        }
        Returns: number
      }
      user_has_event_staff_role: {
        Args: {
          p_event_id: string
          p_user_id: string
          p_role: EventStaffRole
        }
        Returns: boolean
      }
      user_is_event_organizer_or_staff: {
        Args: {
          p_event_id: string
          p_user_id: string
          p_roles?: EventStaffRole[] | null
        }
        Returns: boolean
      }
      resolve_promoter_for_checkout: {
        Args: {
          p_referral_code: string
          p_event_id: string
        }
        Returns: string | null
      }
      validate_promo_code: {
        Args: {
          p_event_id: string
          p_code: string
          p_cart_subtotal?: number
        }
        Returns: Array<{
          ok: boolean
          promo_code_id: string | null
          code: string | null
          discount_type: PromoDiscountType | null
          discount_value: number | null
          discount_amount: number
          message: string
        }>
      }
      apply_promo_code_to_order: {
        Args: {
          p_order_id: string
          p_owner_id: string
          p_promo_code_id: string
        }
        Returns: Array<{
          ok: boolean
          discount_amount: number
          total_amount: number
          message: string
        }>
      }
      release_order_promo_code: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      claim_promoter_by_code: {
        Args: {
          p_code: string
        }
        Returns: string
      }
      ensure_freepass_tier: {
        Args: { p_event_id: string }
        Returns: string
      }
      register_guest_list_entry: {
        Args: {
          p_list_id: string
          p_full_name: string
          p_email?: string | null
          p_phone?: string | null
          p_client_key?: string | null
        }
        Returns: string
      }
      check_in_guest: {
        Args: { p_ticket_id: string }
        Returns: undefined
      }
      claim_guest_list_entry: {
        Args: {
          p_entry_id: string
          p_owner_id: string
        }
        Returns: string
      }
      get_guest_list_public: {
        Args: { p_list_id: string }
        Returns: {
          id: string
          name: string
          max_guests: number
          used_guests: number
          remaining: number
          valid_until: string
          event_id: string
          event_title: string
          event_date: string
        }[]
      }
      mark_guest_entry_checked_in: {
        Args: { p_ticket_id: string }
        Returns: undefined
      }
      attach_event_items_to_order: {
        Args: {
          p_order_id: string
          p_owner_id: string
          p_items: Json
        }
        Returns: number
      }
      create_store_order_tx: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_items: Json
        }
        Returns: string
      }
      release_order_event_items: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      activate_order_item_redemptions: {
        Args: { p_order_id: string }
        Returns: number
      }
      activate_paid_boost: {
        Args: {
          p_subscription_id: string
          p_payment_id: string
          p_featured_until: string
        }
        Returns: Json
      }
      request_organizer_settlement: {
        Args: {
          p_period_label?: string | null
          p_notes?: string | null
        }
        Returns: string
      }
      request_organizer_payout: {
        Args: {
          p_amount: number
          p_cbu_destination: string
          p_event_id?: string | null
        }
        Returns: string
      }
      complete_organizer_payout: {
        Args: { p_payout_id: string }
        Returns: undefined
      }
      reject_organizer_payout: {
        Args: {
          p_payout_id: string
          p_admin_notes?: string | null
        }
        Returns: undefined
      }
      complete_organizer_settlement: {
        Args: { p_settlement_id: string }
        Returns: undefined
      }
      get_platform_orders_ledger: {
        Args: {
          p_organizer_id?: string | null
          p_event_id?: string | null
          p_status?: string | null
          p_limit?: number
        }
        Returns: {
          order_id: string
          created_at: string
          status: string
          payment_method: string
          mp_payment_id: string | null
          event_id: string | null
          event_title: string
          organizer_id: string | null
          organizer_name: string
          buyer_id: string
          buyer_name: string
          buyer_email: string
          gross_amount: number
          platform_fee_amount: number
          organizer_net_amount: number
          fee_rate: number
        }[]
      }
      get_platform_orders_ledger_totals: {
        Args: {
          p_organizer_id?: string | null
          p_event_id?: string | null
          p_status?: string | null
        }
        Returns: {
          gross: number
          platform_fee: number
          organizer_net: number
          order_count: number
          paid_count: number
        }[]
      }
      redeem_item: {
        Args: {
          p_qr_token: string
          p_staff_user_id: string
        }
        Returns: {
          redemption_id: string
          item_name: string
          item_description: string | null
          item_image_url: string | null
          item_category: string | null
          redeemed_at: string | null
          already_redeemed: boolean
          previous_redeemed_at: string | null
        }[]
      }
      execute_safe_transfer: {
        Args: {
          p_ticket_id: string
          p_receiver_email: string
          p_acting_seller_id?: string | null
        }
        Returns: {
          transfer_id: string
          new_ticket_id: string
          event_title: string
          receiver_email: string
          receiver_user_id: string | null
        }[]
      }
      ticket_has_pending_transfer: {
        Args: { p_ticket_id: string }
        Returns: boolean
      }
      initiate_ticket_transfer: {
        Args: {
          p_ticket_id: string
          p_receiver_email: string
        }
        Returns: {
          transfer_id: string
          claim_token: string
          event_title: string
          receiver_email: string
        }[]
      }
      cancel_ticket_transfer: {
        Args: { p_transfer_id: string }
        Returns: boolean
      }
      peek_ticket_transfer_claim: {
        Args: { p_token: string }
        Returns: {
          transfer_id: string
          status: TicketTransferStatus
          event_title: string
          event_date: string | null
          flyer_url: string | null
          receiver_email: string
          email_matches: boolean
          already_owner: boolean
        }[]
      }
      claim_ticket_transfer_by_token: {
        Args: { p_token: string }
        Returns: {
          transfer_id: string
          ticket_id: string
          event_title: string
        }[]
      }
      complete_ticket_resale_purchase: {
        Args: {
          p_listing_id: string
          p_buyer_user_id: string
          p_mp_payment_id: string
        }
        Returns: Json
      }
      claim_pending_ticket_transfers: {
        Args: { p_user_id: string }
        Returns: number
      }
      create_pos_sale_tx: {
        Args: {
          p_event_id: string
          p_tier_id: string
          p_quantity: number
          p_payment_method: string
          p_staff_id: string
          p_customer_phone?: string | null
          p_customer_dni?: string | null
          p_customer_name?: string | null
          p_shift_id?: string | null
          p_supervisor_pin?: string | null
        }
        Returns: {
          order_id: string
          ticket_id: string
          totp_secret: string
          qr_code: string
          unit_price: number
          total_amount: number
        }[]
      }
      process_pos_checkout_tx: {
        Args: {
          p_event_id: string
          p_tier_id: string
          p_quantity: number
          p_payment_method: string
          p_cashier_user_id: string
          p_customer_phone?: string | null
          p_customer_dni?: string | null
          p_customer_name?: string | null
          p_shift_id?: string | null
          p_supervisor_pin?: string | null
          p_seating_unit_id?: string | null
          p_seating_layout_item_id?: string | null
        }
        Returns: {
          order_id: string
          ticket_id: string
          totp_secret: string
          qr_code: string
          unit_price: number
          total_amount: number
        }[]
      }
      user_can_operate_pos: {
        Args: {
          p_event_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      set_pos_supervisor_pin: {
        Args: { p_event_id: string; p_pin: string }
        Returns: boolean
      }
      verify_pos_supervisor_pin: {
        Args: { p_event_id: string; p_pin: string }
        Returns: boolean
      }
      pos_cashier_has_pin: {
        Args: { p_event_id: string }
        Returns: boolean
      }
      set_pos_cashier_pin: {
        Args: { p_assignment_id: string; p_pin: string }
        Returns: boolean
      }
      verify_pos_cashier_pin: {
        Args: { p_event_id: string; p_pin: string }
        Returns: boolean
      }
      bootstrap_pos_cashier_pin: {
        Args: { p_event_id: string; p_new_pin: string; p_admin_pin: string }
        Returns: boolean
      }
      void_pos_order: {
        Args: { p_order_id: string; p_supervisor_pin: string }
        Returns: {
          id: string
          buyer_id: string
          subtotal: number
          service_charge: number
          total_amount: number
          status: string
          payment_method: string
          cashier_shift_id: string | null
        }
      }
      open_cashier_shift: {
        Args: {
          p_event_id: string
          p_start_amount?: number
        }
        Returns: {
          id: string
          event_id: string
          cashier_id: string
          start_amount: number
          end_amount_expected: number | null
          end_amount_counted: number | null
          cash_sales_total: number
          card_sales_total: number
          transfer_sales_total: number
          tickets_sold: number
          status: string
          opened_at: string
          closed_at: string | null
        }
      }
      close_cashier_shift: {
        Args: {
          p_shift_id: string
          p_counted_amount?: number | null
        }
        Returns: {
          id: string
          event_id: string
          cashier_id: string
          start_amount: number
          end_amount_expected: number | null
          end_amount_counted: number | null
          cash_sales_total: number
          card_sales_total: number
          transfer_sales_total: number
          tickets_sold: number
          status: string
          opened_at: string
          closed_at: string | null
        }
      }
      fulfill_tier_combo_items: {
        Args: {
          p_order_id: string
          p_tier_id: string
          p_owner_id: string
          p_status?: string
        }
        Returns: number
      }
      issue_complimentary_batch_tx: {
        Args: {
          p_event_id: string
          p_staff_id: string
          p_tier_id: string
          p_mode: string
          p_guests?: Json
          p_unnamed_count?: number
        }
        Returns: Json
      }
    }
    Enums: {
      user_role: UserRole
      organizer_approval_status: OrganizerApprovalStatus
      organizer_risk_tier: OrganizerRiskTier
      organizer_guarantee_status: OrganizerGuaranteeStatus
      event_status: EventStatus
      ticket_status: TicketStatus
      zone_type: ZoneType
      seat_status: SeatStatus
      order_status: OrderStatus
      ticket_resale_listing_status: TicketResaleListingStatus
      ticket_transfer_status: TicketTransferStatus
      payout_pending_status: PayoutPendingStatus
      payout_request_status: PayoutRequestStatus
    }
    CompositeTypes: Record<string, never>
  }
}
