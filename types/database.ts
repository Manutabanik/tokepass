export type UserRole = "customer" | "admin" | "super_admin"
export type OrganizerApprovalStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | "suspended"
export type EventStatus =
  | "draft"
  | "pending_approval"
  | "needs_revision"
  | "rejected"
  | "published"
  | "paused"
  | "cancelled"
  | "completed"
  | "archived"
export type QrType = "dynamic" | "static"
export type EventDeliveryMode = "PRESENCIAL" | "ONLINE"
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
  | "refunded"
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
  | "refund_processing"
export type RefundRequestStatus = "pending" | "approved" | "rejected"
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
export type TicketIssuanceChannel =
  | "online"
  | "pos"
  | "batch_print"
  | "complimentary"
  | "accreditation"
export type TicketPrintMedium =
  | "press_sheet"
  | "thermal_80"
  | "thermal_58"
  | "badge"
  | "wristband"
export type TicketPrintBatchMode =
  | "unnamed"
  | "named"
  | "seated"
  | "accreditation"
export type TicketPrintBatchChannel =
  | "batch_print"
  | "complimentary"
  | "accreditation"
export type TicketPrintBatchStatus = "draft" | "ready" | "void"

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

export type EventDoorAccessPin = {
  id: string
  event_id: string
  pin_hash: string
  pin_lookup: string
  expires_at: string
  created_by: string | null
  created_at: string
  revoked_at: string | null
  last_redeemed_at: string | null
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
  /** Razón social / nombre fiscal del organizador. */
  legal_name: string | null
  /** CUIT argentino (11 dígitos). */
  tax_id: string | null
  /** Teléfono / WhatsApp (progressive profiling). */
  phone: string | null
  role: UserRole
  /**
   * Comisión TokePass (custom_commission_rate canónica).
   * Fracción decimal: 0.15 = 15% sobre precio público All-In.
   */
  service_charge_rate: number
  organizer_approval_status: OrganizerApprovalStatus
  risk_tier: OrganizerRiskTier
  guarantee_status: OrganizerGuaranteeStatus
  /** UUID del dispositivo que inició sesión por última vez (Living QR). */
  active_device_id: string | null
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
  location: string | null
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
  featured_tier:
    | "silver"
    | "gold"
    | "platinum"
    | "flash_3d"
    | "pro_7d"
    | "vip_total"
    | null
  featured_until: string | null
  storefront_views?: number
  /** Comisión % TokePass (ej. 15.00 = 15%). */
  platform_fee_percentage: number
  /** Cargo fijo ARS por entrada paga (split All-In). */
  platform_fixed_fee: number
  /**
   * true = el organizador absorbe el cargo TokePass.
   * false (default) = el comprador lo paga.
   */
  absorb_fees: boolean
  /** Tope de capacidad total en tiers a $0. */
  max_free_tickets: number
  /** Auspicio TokePass: fees a 0 + branding. */
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
  /** Texto libre de restricciones y edad. */
  restrictions: string | null
  /** Texto libre de qué llevar / qué no llevar. */
  what_to_bring: string | null
  /** Flyer vertical 9:16 para Stories post-compra (opcional). */
  social_share_image_url: string | null
  /** PRESENCIAL = puerta/QR. ONLINE = transmisión virtual. */
  delivery_mode: EventDeliveryMode
  /** URL de acceso post-compra (Zoom/Meet/LMS). */
  access_link: string | null
  /** Mensaje del organizador en la pantalla de éxito. */
  checkout_message?: string | null
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
  /** Paso 3: cobro online Mercado Pago. */
  accepts_mercado_pago: boolean
  /** Paso 3: cobro en boletería / POS / transferencia. */
  accepts_pos_payments: boolean
  /** Paso 3: política de devolución. */
  refund_policy: "organizer" | "no_refunds" | "until_24h"
  created_at: string
  updated_at: string
  /** Enlace de preview del borrador (?preview_key=). No exponer en EventDetails público. */
  preview_key: string
  /** Nota de auditoría (cambios pedidos). */
  review_note: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  /** Soft delete. El panel nunca hace DELETE físico. */
  is_deleted: boolean
  deleted_at: string | null
  /** Event Creator V2: progreso crudo del wizard. No es catálogo público. */
  draft_state?: Json | null
}

export type SupportThreadStatus = "open" | "resolved" | "pending_admin"

export type SupportThread = {
  id: string
  organizer_id: string
  event_id: string | null
  status: SupportThreadStatus
  last_message_preview: string | null
  last_message_is_admin: boolean
  last_admin_read_at: string | null
  last_organizer_read_at: string | null
  created_at: string
  updated_at: string
}

export type SupportMessage = {
  id: string
  thread_id: string
  sender_id: string
  is_admin: boolean
  content: string
  created_at: string
}

export type SupportFaqCategory = "ventas" | "cobros" | "accesos" | "equipos"

export type SupportFaq = {
  id: string
  question: string
  answer: string
  category: SupportFaqCategory
  is_active: boolean
  sort_order: number
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

/** Instancia de mapa V2 por jornada. event_date_id = event_schedules.id. */
export type SeatingMap = {
  id: string
  event_id: string
  event_date_id: string | null
  map_config: Json
  pricing: Json
  seating_layout: Json
  created_at: string
  updated_at: string
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

export type PlatformSettings = {
  id: number
  resale_fee_percentage: number
  updated_at: string
  updated_by: string | null
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
  tier:
    | "silver"
    | "gold"
    | "platinum"
    | "flash_3d"
    | "pro_7d"
    | "vip_total"
  amount_paid: number
  duration_days: number
  payment_status: "pending" | "paid" | "failed" | "refunded"
  payment_id_mp: string | null
  starts_at: string | null
  ends_at: string | null
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
  /** Precio ingresado por el organizador (`ticketPrice`). El cobro al comprador es `customerTotal`. */
  price: number
  /** Ingreso neto del organizador por entrada. */
  base_price: number
  /** Comisión unitaria TokePass absorbida en `price`. */
  platform_fee: number
  capacity: number
  /** Cupo de venta digital (web/POS/cortesía). Alineado a capacity. */
  digital_capacity: number
  /** Cupo de papel (`batch_print`). Independiente del cupo digital. */
  physical_capacity: number
  /** Cupo total del SKU; se mantiene alineado a capacity. */
  total_capacity: number
  sold: number
  /** Unidades de papel emitidas. No incrementa `sold`. */
  physical_issued: number
  time_limit: string | null
  bonus_reward: string | null
  zone_id: string | null
  /** NULL = abono / fecha única; si no, FK a event_schedules.id */
  day_id: string | null
  visibility: "public" | "private"
  layout_type: "general" | "table_combo" | "numbered_seat"
  /**
   * sector_id opcional del SKU. NULL = inventario comercial flotante
   * (Master Manifest): la entrada vive con su propio max_capacity.
   */
  seating_sector_id: string | null
  /** Inicio de venta del lote. NULL = inmediato. */
  sale_starts_at: string | null
  /** Fin de venta del lote. NULL = hasta la fecha del evento. */
  sale_ends_at: string | null
  capacity_per_unit: number
  /** QRs independientes por unidad vendida (mesa/agrupación). */
  admit_count: number
  /** standard | bundle | special */
  category: "standard" | "bundle" | "special"
  /** Valor de referencia para mostrar ahorro (packs). */
  list_price: number | null
  /** seated | general | addon | bundle */
  tier_type: "seated" | "general" | "addon" | "bundle"
  /** Clasificación de checkout: standard | combo | extra */
  ticket_type: "standard" | "combo" | "extra"
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
  /** Unidades mínimas de este SKU por transacción. */
  min_purchase_limit: number
  /** Tope de unidades de este SKU por transacción. NULL = fallback del evento. */
  max_purchase_limit: number | null
  /** Derivado: price === 0. */
  is_free?: boolean
  /** Derivado: visibility !== private. */
  is_active?: boolean
  created_at: string
  updated_at: string
}

export type Ticket = {
  id: string
  event_id: string
  tier_id: string
  owner_id: string | null
  qr_code: string | null
  totp_secret: string | null
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
  /** Canal de emisión: online, POS, imprenta, cortesía o acreditación. */
  issuance_channel: TicketIssuanceChannel
  /** Lote de Print Studio (distinto del batch_id huérfano de cortesías). */
  print_batch_id: string | null
  /** Folio humano, ej. A-00001. */
  serial_label: string | null
  serial_seq: number | null
  /** Rol de acreditación (Técnica, Prensa, VIP, Producción). */
  staff_role: string | null
  /** Empresa / medio de la acreditación. */
  staff_company: string | null
  /** Generada en borrador/preview; inválida en puerta de evento published. */
  is_test: boolean
  ticket_type: "admission" | "parking" | "access_pass"
  /** Fase / lote que vendió esta entrada. */
  phase_id: string | null
  /** Jornada emitida al explotar un combo. */
  event_date_id: string | null
  /** SKU combo padre cuando este QR es una parte explotada. */
  source_combo_tier_id: string | null
  created_at: string
  updated_at: string
}

export type ComboItem = {
  id: string
  combo_tier_id: string
  schedule_id: string
  child_tier_id: string | null
  quantity: number
  created_at: string
}

export type TicketTemplate = {
  id: string
  organizer_id: string
  name: string
  medium: TicketPrintMedium
  page_width_mm: number
  page_height_mm: number
  dpi: number
  layout_json: Json
  assets_json: Json
  is_archived: boolean
  created_at: string
  updated_at: string
}

export type TicketPrintBatch = {
  id: string
  event_id: string
  organizer_id: string
  template_id: string | null
  tier_id: string | null
  name: string
  mode: TicketPrintBatchMode
  channel: TicketPrintBatchChannel
  series_code: string
  seq_start: number
  seq_end: number
  status: TicketPrintBatchStatus
  issued_count: number
  artifact_csv_url: string | null
  artifact_pdf_url: string | null
  created_by: string | null
  created_at: string
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

export type SecurityAuditLog = {
  id: string
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  ip: string | null
  user_agent: string | null
  details: Json
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
  open_claim: boolean
  expires_at: string | null
}

export type TicketActionConsent = {
  id: string
  user_id: string
  ticket_id: string
  action: "transfer" | "resale"
  terms_version: string
  accepted_at: string
  transfer_id: string | null
  listing_id: string | null
}

export type TicketResaleListingStatus =
  | "active"
  | "reserved"
  | "sold"
  | "cancelled"
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

export type OrganizerBankVerificationStatus =
  | "unverified"
  | "pending_review"
  | "verified"
  | "rejected"

export type OrganizerBankProfile = {
  id: string
  user_id: string
  full_name_or_company: string
  tax_id: string
  bank_cbu_cvu: string | null
  bank_alias: string | null
  bank_name: string | null
  verification_status: OrganizerBankVerificationStatus
  review_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type EventPayoutStatus =
  | "hold"
  | "pending_approval"
  | "processing"
  | "completed"
  | "cancelled"

export type EventPayout = {
  id: string
  event_id: string
  organizer_id: string
  gross_amount: number
  service_fee_amount: number
  net_amount: number
  payout_status: EventPayoutStatus
  scheduled_payout_date: string | null
  hold_reason: string | null
  transferred_at: string | null
  reviewed_by: string | null
  bank_holder_snapshot: string | null
  bank_tax_id_snapshot: string | null
  bank_cbu_snapshot: string | null
  bank_alias_snapshot: string | null
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
  reserved_until: string | null
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
  processed_at: string | null
  status: "pending" | "processing" | "processed" | "failed" | "dead"
  attempts: number
  last_error: string | null
  available_at: string
  received_at: string
}

export type NotificationOutboxType =
  | "order_paid"
  | "ticket_transfer"
  | "pos_issue"

export type NotificationOutboxChannel = "email" | "whatsapp"

export type NotificationOutboxStatus =
  | "pending"
  | "processing"
  | "processed"
  | "failed"
  | "dead"

export type BuyerDenylist = {
  id: string
  dni_hash: string | null
  email_norm: string | null
  reason: string
  source_order_id: string | null
  created_at: string
}

export type NotificationOutbox = {
  id: string
  order_id: string | null
  type: NotificationOutboxType
  channel: NotificationOutboxChannel
  payload: Json
  status: NotificationOutboxStatus
  attempts: number
  last_error: string | null
  available_at: string
  created_at: string
  processed_at: string | null
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
  event_date_id: string | null
  created_at: string
  updated_at: string
}

export type SeatHold = {
  id: string
  event_id: string
  event_date_id: string | null
  event_date_key: string
  layout_item_id: string
  seating_unit_id: string | null
  user_session_id: string
  owner_id: string | null
  expires_at: string
  status: "active" | "pending_payment"
  frozen_at: string | null
  order_id: string | null
  created_at: string
}

export type EventGaCartHold = {
  id: string
  event_id: string
  tier_id: string
  owner_id: string
  quantity: number
  reserved_until: string
  created_at: string
  user_session_id: string
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
  /** RRPP dueño del cupón. Si está set, el checkout atribuye la venta a este promotor. */
  promoter_id: string | null
  created_at: string
  updated_at: string
}

export type PromoterSettlement = {
  id: string
  organizer_id: string
  promoter_id: string
  amount: number
  settled_at: string
  created_by: string | null
  notes: string | null
  created_at: string
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
  /** Orden de prueba (preview). Los tickets asociados no valen en puerta. */
  is_test: boolean
  /** Se setea al abrir la pasarela. Congela el TTL de seat_holds. */
  payment_started_at: string | null
  /** production = dinero real. test = sandbox / evento no publicado. */
  environment: "production" | "test"
  legal_consent_required: boolean
  terms_accepted: boolean
  terms_accepted_at: string | null
  legal_terms_version: string | null
  organizer_legal_name_snapshot: string | null
  organizer_tax_id_snapshot: string | null
}

export type RefundRequest = {
  id: string
  order_id: string
  user_id: string | null
  reason: string | null
  status: RefundRequestStatus
  created_at: string
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

export type UserProducerFollow = {
  user_id: string
  producer_id: string
  created_at: string
}

export type UserProducerFollowInsert = {
  user_id: string
  producer_id: string
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
  used_guests: number
  promoter_id: string | null
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
  | "legal_name"
  | "tax_id"
  | "phone"
  | "organizer_approval_status"
  | "risk_tier"
  | "guarantee_status"
  | "active_device_id"
> & {
  role?: UserRole
  service_charge_rate?: number
  dni?: string | null
  legal_name?: string | null
  tax_id?: string | null
  phone?: string | null
  organizer_approval_status?: OrganizerApprovalStatus
  risk_tier?: OrganizerRiskTier
  guarantee_status?: OrganizerGuaranteeStatus
  active_device_id?: string | null
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
  | "location"
  | "delivery_mode"
  | "access_link"
  | "checkout_message"
  | "accepts_mercado_pago"
  | "accepts_pos_payments"
  | "refund_policy"
  | "status"
  | "max_tickets_per_user"
  | "qr_type"
  | "visibility"
  | "schedule_days"
  | "is_featured"
  | "featured_tier"
  | "featured_until"
  | "storefront_views"
  | "platform_fee_percentage"
  | "platform_fixed_fee"
  | "absorb_fees"
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
  | "restrictions"
  | "what_to_bring"
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
  | "preview_key"
  | "review_note"
  | "reviewed_at"
  | "reviewed_by"
  | "is_deleted"
  | "deleted_at"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  location?: string | null
  delivery_mode?: EventDeliveryMode
  access_link?: string | null
  checkout_message?: string | null
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
  storefront_views?: number
  platform_fee_percentage?: number
  platform_fixed_fee?: number
  absorb_fees?: boolean
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
  restrictions?: string | null
  what_to_bring?: string | null
  social_share_image_url?: string | null
  slug?: string
  venue_map?: Json
  province?: string | null
  department?: string | null
  preview_key?: string
  review_note?: string | null
  reviewed_at?: string | null
  reviewed_by?: string | null
  is_deleted?: boolean
  deleted_at?: string | null
  created_at?: string
  updated_at?: string
  draft_state?: Json | null
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
  | "sale_starts_at"
  | "sale_ends_at"
  | "capacity_per_unit"
  | "admit_count"
  | "category"
  | "list_price"
  | "tier_type"
  | "ticket_type"
  | "bundle_items"
  | "bundle_type"
  | "promo_discount_type"
  | "promo_discount_value"
  | "promo_required_qty"
  | "promo_pay_qty"
  | "description"
  | "highlight_badge"
  | "min_purchase_limit"
  | "max_purchase_limit"
  | "total_capacity"
  | "digital_capacity"
  | "physical_capacity"
  | "physical_issued"
  | "is_free"
  | "is_active"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  sold?: number
  digital_capacity?: number
  physical_capacity?: number
  physical_issued?: number
  total_capacity?: number
  description?: string | null
  highlight_badge?: TicketTier["highlight_badge"]
  min_purchase_limit?: number
  max_purchase_limit?: number | null
  base_price?: number
  platform_fee?: number
  time_limit?: string | null
  bonus_reward?: string | null
  zone_id?: string | null
  day_id?: string | null
  visibility?: TicketTier["visibility"]
  layout_type?: TicketTier["layout_type"]
  seating_sector_id?: string | null
  sale_starts_at?: string | null
  sale_ends_at?: string | null
  capacity_per_unit?: number
  admit_count?: number
  category?: TicketTier["category"]
  list_price?: number | null
  tier_type?: TicketTier["tier_type"]
  ticket_type?: TicketTier["ticket_type"]
  bundle_items?: Json
  bundle_type?: TicketTier["bundle_type"]
  promo_discount_type?: TicketTier["promo_discount_type"]
  promo_discount_value?: number
  promo_required_qty?: number
  promo_pay_qty?: number
  is_free?: boolean
  is_active?: boolean
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
  | "qr_code"
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
  | "issuance_channel"
  | "print_batch_id"
  | "serial_label"
  | "serial_seq"
  | "staff_role"
  | "staff_company"
  | "is_test"
  | "ticket_type"
  | "phase_id"
  | "event_date_id"
  | "source_combo_tier_id"
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
  qr_code?: string | null
  totp_secret?: string | null
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
  issuance_channel?: TicketIssuanceChannel
  print_batch_id?: string | null
  serial_label?: string | null
  serial_seq?: number | null
  staff_role?: string | null
  staff_company?: string | null
  is_test?: boolean
  ticket_type?: "admission" | "parking" | "access_pass"
  phase_id?: string | null
  event_date_id?: string | null
  source_combo_tier_id?: string | null
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
  | "event_date_id"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  status?: EventSeatingUnit["status"]
  reserved_by?: string | null
  reserved_order_id?: string | null
  reserved_until?: string | null
  sold_order_id?: string | null
  event_date_id?: string | null
  created_at?: string
  updated_at?: string
}
type SeatHoldInsert = Omit<
  SeatHold,
  "id" | "event_date_key" | "status" | "frozen_at" | "order_id" | "created_at"
> & {
  id?: string
  event_date_key?: string
  status?: SeatHold["status"]
  frozen_at?: string | null
  order_id?: string | null
  created_at?: string
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
  | "is_test"
  | "environment"
  | "payment_started_at"
  | "legal_consent_required"
  | "terms_accepted"
  | "terms_accepted_at"
  | "legal_terms_version"
  | "organizer_legal_name_snapshot"
  | "organizer_tax_id_snapshot"
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
  is_test?: boolean
  environment?: "production" | "test"
  payment_started_at?: string | null
  legal_consent_required?: boolean
  terms_accepted?: boolean
  terms_accepted_at?: string | null
  legal_terms_version?: string | null
  organizer_legal_name_snapshot?: string | null
  organizer_tax_id_snapshot?: string | null
  created_at?: string
  updated_at?: string
}
type PromoCodeInsert = Omit<
  PromoCode,
  | "id"
  | "current_uses"
  | "is_active"
  | "promoter_id"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  current_uses?: number
  is_active?: boolean
  max_uses?: number | null
  valid_until?: string | null
  promoter_id?: string | null
  created_at?: string
  updated_at?: string
}
type PromoterSettlementInsert = Omit<
  PromoterSettlement,
  "id" | "settled_at" | "notes" | "created_at"
> & {
  id?: string
  amount: number
  settled_at?: string
  created_by?: string | null
  notes?: string | null
  created_at?: string
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

type GuestListInsert = Omit<
  GuestList,
  "id" | "created_at" | "updated_at" | "used_guests" | "promoter_id"
> & {
  id?: string
  created_at?: string
  updated_at?: string
  used_guests?: number
  promoter_id?: string | null
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
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      support_threads: {
        Row: SupportThread
        Insert: {
          id?: string
          organizer_id: string
          event_id?: string | null
          status?: SupportThreadStatus
          last_message_preview?: string | null
          last_message_is_admin?: boolean
          last_admin_read_at?: string | null
          last_organizer_read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          organizer_id: string
          event_id: string | null
          status: SupportThreadStatus
          last_message_preview: string | null
          last_message_is_admin: boolean
          last_admin_read_at: string | null
          last_organizer_read_at: string | null
          updated_at: string
        }>
        Relationships: [
          {
            foreignKeyName: "support_threads_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_threads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: SupportMessage
        Insert: {
          id?: string
          thread_id: string
          sender_id: string
          is_admin?: boolean
          content: string
          created_at?: string
        }
        Update: Partial<{
          thread_id: string
          sender_id: string
          is_admin: boolean
          content: string
        }>
        Relationships: [
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_faqs: {
        Row: SupportFaq
        Insert: {
          id?: string
          question: string
          answer: string
          category?: SupportFaqCategory
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          question: string
          answer: string
          category: SupportFaqCategory
          is_active: boolean
          sort_order: number
          updated_at: string
        }>
        Relationships: []
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
      seating_maps: {
        Row: SeatingMap
        Insert: {
          id?: string
          event_id: string
          event_date_id?: string | null
          map_config?: Json
          pricing?: Json
          seating_layout?: Json
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          event_id: string
          event_date_id: string | null
          map_config: Json
          pricing: Json
          seating_layout: Json
          updated_at: string
        }>
        Relationships: [
          {
            foreignKeyName: "seating_maps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seating_maps_event_date_id_fkey"
            columns: ["event_date_id"]
            isOneToOne: false
            referencedRelation: "event_schedules"
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
      platform_settings: {
        Row: PlatformSettings
        Insert: {
          id?: number
          resale_fee_percentage?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<{
          resale_fee_percentage: number
          updated_at: string
          updated_by: string | null
        }>
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          starts_at?: string | null
          ends_at?: string | null
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
      ticket_templates: {
        Row: TicketTemplate
        Insert: Omit<
          TicketTemplate,
          | "id"
          | "medium"
          | "page_width_mm"
          | "page_height_mm"
          | "dpi"
          | "layout_json"
          | "assets_json"
          | "is_archived"
          | "created_at"
          | "updated_at"
        > & {
          id?: string
          medium?: TicketPrintMedium
          page_width_mm?: number
          page_height_mm?: number
          dpi?: number
          layout_json?: Json
          assets_json?: Json
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<
          Omit<TicketTemplate, "id" | "organizer_id" | "created_at">
        >
        Relationships: [
          {
            foreignKeyName: "ticket_templates_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_print_batches: {
        Row: TicketPrintBatch
        Insert: Omit<
          TicketPrintBatch,
          | "id"
          | "template_id"
          | "tier_id"
          | "mode"
          | "channel"
          | "series_code"
          | "seq_start"
          | "status"
          | "issued_count"
          | "artifact_csv_url"
          | "artifact_pdf_url"
          | "created_by"
          | "created_at"
        > & {
          id?: string
          template_id?: string | null
          tier_id?: string | null
          mode?: TicketPrintBatchMode
          channel?: TicketPrintBatchChannel
          series_code?: string
          seq_start?: number
          status?: TicketPrintBatchStatus
          issued_count?: number
          artifact_csv_url?: string | null
          artifact_pdf_url?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: Partial<
          Omit<TicketPrintBatch, "id" | "event_id" | "organizer_id" | "created_at">
        >
        Relationships: [
          {
            foreignKeyName: "ticket_print_batches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_print_batches_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ticket_templates"
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
      security_audit_log: {
        Row: SecurityAuditLog
        Insert: Omit<SecurityAuditLog, "id" | "created_at"> & {
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
          {
            foreignKeyName: "tickets_print_batch_id_fkey"
            columns: ["print_batch_id"]
            isOneToOne: false
            referencedRelation: "ticket_print_batches"
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
      event_ga_cart_holds: {
        Row: EventGaCartHold
        Insert: {
          id?: string
          event_id: string
          tier_id: string
          owner_id: string
          quantity: number
          reserved_until: string
          created_at?: string
          user_session_id?: string
        }
        Update: Partial<{
          event_id: string
          tier_id: string
          owner_id: string
          quantity: number
          reserved_until: string
          user_session_id: string
        }>
        Relationships: []
      }
      seat_holds: {
        Row: SeatHold
        Insert: SeatHoldInsert
        Update: Partial<SeatHoldInsert>
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
      promoter_settlements: {
        Row: PromoterSettlement
        Insert: PromoterSettlementInsert
        Update: Partial<PromoterSettlementInsert>
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
      refund_requests: {
        Row: RefundRequest
        Insert: {
          id?: string
          order_id: string
          user_id?: string | null
          reason?: string | null
          status?: RefundRequestStatus
          created_at?: string
        }
        Update: Partial<{
          order_id: string
          user_id: string | null
          reason: string | null
          status: RefundRequestStatus
        }>
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
        Update: never
        Relationships: []
      }
      checkout_idempotency_keys: {
        Row: {
          buyer_id: string
          idempotency_key: string
          event_id: string
          cart_fingerprint: string
          order_id: string | null
          created_at: string
        }
        Insert: {
          buyer_id: string
          idempotency_key: string
          event_id: string
          cart_fingerprint: string
          order_id?: string | null
          created_at?: string
        }
        Update: {
          event_id?: string
          cart_fingerprint?: string
          order_id?: string | null
          created_at?: string
        }
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
      event_door_access_pins: {
        Row: EventDoorAccessPin
        Insert: {
          id?: string
          event_id: string
          pin_hash: string
          pin_lookup: string
          expires_at: string
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
          last_redeemed_at?: string | null
        }
        Update: Partial<EventDoorAccessPin>
        Relationships: []
      }
      event_items: {
        Row: EventItem
        Insert: EventItemInsert
        Update: Partial<EventItemInsert>
        Relationships: []
      }
      combo_items: {
        Row: ComboItem
        Insert: {
          id?: string
          combo_tier_id: string
          schedule_id: string
          child_tier_id?: string | null
          quantity?: number
          created_at?: string
        }
        Update: Partial<ComboItem>
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
          | "open_claim"
          | "expires_at"
        > & {
          id?: string
          new_ticket_id?: string | null
          created_at?: string
          status?: TicketTransferStatus
          claim_token?: string | null
          receiver_id?: string | null
          accepted_at?: string | null
          cancelled_at?: string | null
          open_claim?: boolean
          expires_at?: string | null
        }
        Update: Partial<TicketTransfer>
        Relationships: []
      }
      ticket_action_consents: {
        Row: TicketActionConsent
        Insert: {
          id?: string
          user_id: string
          ticket_id: string
          action: "transfer" | "resale"
          terms_version: string
          accepted_at?: string
          transfer_id?: string | null
          listing_id?: string | null
        }
        Update: Partial<TicketActionConsent>
        Relationships: []
      }
      user_favorites: {
        Row: UserFavorite
        Insert: UserFavoriteInsert
        Update: Partial<UserFavoriteInsert>
        Relationships: []
      }
      user_producer_follows: {
        Row: UserProducerFollow
        Insert: UserProducerFollowInsert
        Update: Partial<UserProducerFollowInsert>
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
          reserved_until?: string | null
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
      organizer_profiles: {
        Row: OrganizerBankProfile
        Insert: {
          id?: string
          user_id: string
          full_name_or_company: string
          tax_id: string
          bank_cbu_cvu?: string | null
          bank_alias?: string | null
          bank_name?: string | null
          verification_status?: OrganizerBankVerificationStatus
          review_notes?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          full_name_or_company: string
          tax_id: string
          bank_cbu_cvu: string | null
          bank_alias: string | null
          bank_name: string | null
          verification_status: OrganizerBankVerificationStatus
          review_notes: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          updated_at: string
        }>
        Relationships: []
      }
      event_payouts: {
        Row: EventPayout
        Insert: {
          id?: string
          event_id: string
          organizer_id: string
          gross_amount?: number
          service_fee_amount?: number
          net_amount?: number
          payout_status?: EventPayoutStatus
          scheduled_payout_date?: string | null
          hold_reason?: string | null
          transferred_at?: string | null
          reviewed_by?: string | null
          bank_holder_snapshot?: string | null
          bank_tax_id_snapshot?: string | null
          bank_cbu_snapshot?: string | null
          bank_alias_snapshot?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          gross_amount: number
          service_fee_amount: number
          net_amount: number
          payout_status: EventPayoutStatus
          scheduled_payout_date: string | null
          hold_reason: string | null
          transferred_at: string | null
          reviewed_by: string | null
          bank_holder_snapshot: string | null
          bank_tax_id_snapshot: string | null
          bank_cbu_snapshot: string | null
          bank_alias_snapshot: string | null
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
          processed_at?: string | null
          status?: "pending" | "processing" | "processed" | "failed"
          attempts?: number
          last_error?: string | null
          available_at?: string
          received_at?: string
        }
        Update: Partial<PaymentWebhookEvent>
        Relationships: []
      }
      ticket_day_admissions: {
        Row: {
          ticket_id: string
          day_id: string
          scanned_at: string
        }
        Insert: {
          ticket_id: string
          day_id: string
          scanned_at?: string
        }
        Update: Partial<{
          scanned_at: string
        }>
        Relationships: []
      }
      buyer_denylist: {
        Row: BuyerDenylist
        Insert: {
          id?: string
          dni_hash?: string | null
          email_norm?: string | null
          reason: string
          source_order_id?: string | null
          created_at?: string
        }
        Update: Partial<{
          dni_hash: string | null
          email_norm: string | null
          reason: string
          source_order_id: string | null
        }>
        Relationships: []
      }
      notification_outbox: {
        Row: NotificationOutbox
        Insert: {
          id?: string
          order_id?: string | null
          type: NotificationOutboxType
          channel: NotificationOutboxChannel
          payload?: Json
          status?: NotificationOutboxStatus
          attempts?: number
          last_error?: string | null
          available_at?: string
          created_at?: string
          processed_at?: string | null
        }
        Update: Partial<NotificationOutbox>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      get_resale_fee_percentage: {
        Args: Record<string, never>
        Returns: number
      }
      scanner_server_time: {
        Args: Record<string, never>
        Returns: number
      }
      assert_buyer_not_denylisted: {
        Args: {
          p_holder_dni: string | null
          p_holder_email: string | null
        }
        Returns: undefined
      }
      record_buyer_denylist_from_order: {
        Args: {
          p_order_id: string
          p_reason?: string
        }
        Returns: string
      }
      write_security_audit_log: {
        Args: {
          p_action: string
          p_entity: string
          p_entity_id?: string | null
          p_ip?: string | null
          p_user_agent?: string | null
          p_details?: Json
          p_actor_id?: string | null
        }
        Returns: string
      }
      assert_holder_identity_ticket_cap: {
        Args: {
          p_event_id: string
          p_holder_dni: string | null
          p_holder_email: string | null
          p_requested: number
        }
        Returns: undefined
      }
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
      sync_event_payouts: {
        Args: Record<string, never>
        Returns: number
      }
      expire_buyer_pending_event_orders: {
        Args: {
          p_owner_id: string
          p_event_id: string
        }
        Returns: number
      }
      claim_checkout_idempotency_key: {
        Args: {
          p_buyer_id: string
          p_event_id: string
          p_idempotency_key: string
          p_cart_fingerprint: string
        }
        Returns: {
          reused: boolean
          in_progress: boolean
          fingerprint_mismatch: boolean
          order_id: string | null
          order_status: string | null
        }[]
      }
      attach_checkout_idempotency_order: {
        Args: {
          p_buyer_id: string
          p_idempotency_key: string
          p_order_id: string
        }
        Returns: undefined
      }
      release_checkout_idempotency_order: {
        Args: {
          p_order_id: string
        }
        Returns: undefined
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
          p_holder_dni?: string | null
          p_holder_email?: string | null
          p_addons?: Json
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
          p_holder_dni?: string | null
          p_holder_email?: string | null
          p_addons?: Json
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
      sync_published_seating_maps: {
        Args: {
          p_event_id: string
          p_maps: Json
        }
        Returns: undefined
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
      hold_seating_unit_for_cart_by_layout: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_sector_id: string
          p_layout_item_id: string
          p_event_date_id?: string | null
        }
        Returns: {
          seating_unit_id: string
          reserved_until: string
        }[]
      }
      hold_seat: {
        Args: {
          p_seat_id: string
          p_event_date_id: string | null
          p_session_id: string
          p_event_id?: string | null
        }
        Returns: {
          hold_id: string
          seating_unit_id: string
          event_id: string
          expires_at: string
        }[]
      }
      hold_seat_for_combo: {
        Args: {
          p_seat_id: string
          p_combo_tier_id: string
          p_session_id: string
          p_event_id?: string | null
        }
        Returns: {
          hold_id: string
          seating_unit_id: string
          event_id: string
          expires_at: string
          event_date_id: string | null
        }[]
      }
      hold_layout_item_for_combo: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_sector_id: string
          p_layout_item_id: string
          p_combo_tier_id: string
        }
        Returns: {
          seating_unit_id: string
          reserved_until: string
          event_date_id: string
        }[]
      }
      sync_combo_items: {
        Args: {
          p_combo_tier_id: string
          p_schedule_ids: string[]
        }
        Returns: number
      }
      release_seat_holds: {
        Args: {
          p_session_id: string
          p_event_id?: string | null
        }
        Returns: number
      }
      expire_seat_holds: {
        Args: {
          p_batch_size?: number
        }
        Returns: number
      }
      assert_seat_holds_for_purchase: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_session_id: string
          p_items: Json
        }
        Returns: undefined
      }
      consume_seat_holds_for_purchase: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_session_id: string
          p_items: Json
        }
        Returns: number
      }
      purchase_held_seats_tx: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_session_id: string
          p_items: Json
          p_promoter_id?: string | null
          p_holder_dni?: string | null
          p_holder_email?: string | null
          p_addons?: Json
        }
        Returns: {
          order_id: string
          ticket_id: string
          subtotal: number
          service_charge: number
          total_amount: number
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
      hold_mixed_cart_for_checkout: {
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
      transfer_guest_cart_holds: {
        Args: {
          p_event_id: string
          p_session_id: string
          p_buyer_id: string
        }
        Returns: undefined
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
          p_holder_dni?: string | null
          p_holder_email?: string | null
          p_addons?: Json
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
        Args: { p_batch_size?: number }
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
      event_uses_live_stock: {
        Args: {
          p_event_id: string
        }
        Returns: boolean
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
      event_manifest_capacity: {
        Args: {
          p_event_id: string
        }
        Returns: {
          map_capacity: number
          floating_capacity: number
          general_sector_capacity: number
          total_capacity: number
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
        Args: { p_batch_size?: number }
        Returns: number
      }
      get_event_seating_availability: {
        Args: {
          p_event_id: string
          p_event_date_id?: string | null
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
          event_date_id: string | null
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
          event_date_id: string | null
        }[]
      }
      get_event_seating_units_by_sector: {
        Args: {
          p_event_id: string
          p_sector_id: string
          p_event_date_id?: string | null
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
          event_date_id: string | null
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
          event_date_id: string | null
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
      event_preview_key_matches: {
        Args: {
          p_event_id: string
          p_key: string
        }
        Returns: boolean
      }
      resolve_current_event_schedule_day: {
        Args: {
          p_event_id: string
          p_now?: string
        }
        Returns: string
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
        Args: { p_batch_size?: number }
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
      publish_event_v2: {
        Args: {
          p_event_id: string
          p_payload: Json
        }
        Returns: Json
      }
      publish_event_seating_inventory: {
        Args: {
          p_event_id: string
          p_payload: Json
        }
        Returns: undefined
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
      get_event_dashboard_metrics: {
        Args: {
          p_event_id: string
        }
        Returns: Json
      }
      organizer_paid_ledger: {
        Args: {
          p_organizer_id: string
          p_include_test?: boolean
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
      reset_event_test_inventory: {
        Args: {
          p_event_id: string
        }
        Returns: number
      }
      release_test_order_live_stock: {
        Args: {
          p_order_id: string
        }
        Returns: undefined
      }
      get_organizer_finance_summary: {
        Args: {
          p_organizer_id: string
          p_include_test?: boolean
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
      finalize_sandbox_paid_order: {
        Args: { p_order_id: string }
        Returns: Json
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
      apply_order_refund_state: {
        Args: {
          p_order_id: string
          p_order_status?: string
        }
        Returns: number
      }
      refund_single_ticket: {
        Args: {
          p_ticket_id: string
        }
        Returns: Json
      }
      restore_combo_parent_sold_for_order: {
        Args: {
          p_order_id: string
        }
        Returns: undefined
      }
      restore_combo_parent_sold_after_losing_ticket: {
        Args: {
          p_order_id: string
          p_source_combo_tier_id: string
          p_ticket_id: string
        }
        Returns: undefined
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
      freeze_seat_holds_for_payment: {
        Args: { p_order_id: string }
        Returns: number
      }
      release_payment_frozen_holds: {
        Args: { p_order_id: string }
        Returns: number
      }
      expire_abandoned_orders: {
        Args: { p_older_than?: string; p_batch_size?: number }
        Returns: number
      }
      claim_payment_webhook_events: {
        Args: { p_limit?: number }
        Returns: PaymentWebhookEvent[]
      }
      enqueue_payment_webhook_event: {
        Args: {
          p_provider: string
          p_external_event_id: string
          p_event_type: string
          p_payload: Json
        }
        Returns: { id: string; status: string }[]
      }
      replay_dead_webhook_event: {
        Args: {
          p_event_id: string
        }
        Returns: boolean
      }
      anonymize_account: {
        Args: {
          p_user_id: string
        }
        Returns: undefined
      }
      enqueue_notification_outbox: {
        Args: {
          p_order_id: string | null
          p_type: string
          p_channel: string
          p_payload?: Json
        }
        Returns: string
      }
      claim_notification_outbox: {
        Args: { p_limit?: number }
        Returns: NotificationOutbox[]
      }
      requeue_notification_outbox: {
        Args: {
          p_order_id: string
          p_type: string
          p_payload?: Json
        }
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
          p_owner_id?: string | null
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
      increment_event_storefront_views: {
        Args: {
          p_event_id: string
        }
        Returns: undefined
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
      ticket_has_active_resale_listing: {
        Args: { p_ticket_id: string }
        Returns: boolean
      }
      create_resale_listing: {
        Args: { p_ticket_id: string; p_terms_version: string }
        Returns: {
          listing_id: string
          ticket_id: string
          event_id: string
          price: number
          status: TicketResaleListingStatus
          created_at: string
        }[]
      }
      initiate_ticket_transfer: {
        Args: {
          p_ticket_id: string
          p_receiver_email: string
          p_terms_version: string
        }
        Returns: {
          transfer_id: string
          claim_token: string
          event_title: string
          receiver_email: string
        }[]
      }
      initiate_ticket_share_transfer: {
        Args: { p_ticket_id: string; p_terms_version: string }
        Returns: {
          transfer_id: string
          claim_token: string
          event_title: string
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
      reserve_resale_listing: {
        Args: {
          p_listing_id: string
          p_ttl_minutes?: number
        }
        Returns: Json
      }
      release_resale_listing_reservation: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      expire_resale_listing_reservations: {
        Args: { p_batch_size?: number }
        Returns: number
      }
      expire_pending_ticket_transfers: {
        Args: { p_batch_size?: number }
        Returns: number
      }
      claim_pending_ticket_transfers: {
        Args: { p_user_id: string }
        Returns: number
      }
      claim_active_wallet_device: {
        Args: { p_device_id: string }
        Returns: Json
      }
      assert_active_wallet_device: {
        Args: { p_device_id: string }
        Returns: Json
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
          p_event_date_id?: string | null
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
      issue_print_batch_tx: {
        Args: {
          p_event_id: string
          p_staff_id: string
          p_tier_id: string
          p_template_id?: string | null
          p_name: string
          p_mode: string
          p_channel: string
          p_series_code: string
          p_seq_start: number
          p_unnamed_count: number
          p_guests?: Json
          p_default_staff_role?: string | null
          p_default_staff_company?: string | null
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
      support_thread_status: SupportThreadStatus
      ticket_status: TicketStatus
      zone_type: ZoneType
      seat_status: SeatStatus
      ticket_resale_listing_status: TicketResaleListingStatus
      ticket_transfer_status: TicketTransferStatus
      payout_pending_status: PayoutPendingStatus
      payout_request_status: PayoutRequestStatus
      organizer_bank_verification_status: OrganizerBankVerificationStatus
      event_payout_status: EventPayoutStatus
    }
    CompositeTypes: Record<string, never>
  }
}
