import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components"

export type OrderEmailTicket = {
  id: string
  label: string
  qrCodeUrl: string
  codeText: string
}

export type OrderEmailProps = {
  customerName: string
  orderNumber: string
  eventName: string
  eventDate: string
  eventVenue: string
  eventBannerUrl?: string
  totalAmount: string
  tickets: OrderEmailTicket[]
  accountUrl?: string
}

const DEFAULT_ACCOUNT_URL = "https://www.tokepass.com.ar/cuenta/entradas"

export const PreviewProps: OrderEmailProps = {
  customerName: "Ana Perez",
  orderNumber: "TP-10482",
  eventName: "Noche en Club Tokepass",
  eventDate: "Sabado 22 nov 2026 · 23:30",
  eventVenue: "CABA · Salón Central",
  eventBannerUrl: "https://www.tokepass.com.ar/brand/tokepass-mark.png",
  totalAmount: "$ 48.000",
  accountUrl: DEFAULT_ACCOUNT_URL,
  tickets: [
    {
      id: "tkt-demo-1",
      label: "Mesa 12 - Pase 1 de 4",
      qrCodeUrl:
        "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=TOKEPASS-DEMO-1",
      codeText: "TKP-12A1",
    },
    {
      id: "tkt-demo-2",
      label: "Mesa 12 - Pase 2 de 4",
      qrCodeUrl:
        "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=TOKEPASS-DEMO-2",
      codeText: "TKP-12A2",
    },
  ],
}

export function OrderConfirmationEmail({
  customerName,
  orderNumber,
  eventName,
  eventDate,
  eventVenue,
  eventBannerUrl,
  totalAmount,
  tickets,
  accountUrl = DEFAULT_ACCOUNT_URL,
}: OrderEmailProps) {
  const greeting = customerName.trim()
    ? `Hola ${customerName.trim()},`
    : "Hola,"
  const preview = `Tus entradas para ${eventName} ya estan listas`

  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>Tokepass</Text>
          <Text style={styles.kicker}>Compra confirmada</Text>
          <Text style={styles.title}>Tus entradas ya estan listas</Text>
          <Text style={styles.lead}>
            {greeting} te enviamos cada pase con su QR para {eventName}.
          </Text>

          {eventBannerUrl ? (
            <Img
              src={eventBannerUrl}
              alt={eventName}
              width="504"
              style={styles.banner}
            />
          ) : null}

          <Section style={styles.card}>
            <Text style={styles.cardLabel}>Evento</Text>
            <Text style={styles.cardValue}>{eventName}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Fecha</Text>
            <Text style={styles.cardValue}>{eventDate}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Lugar</Text>
            <Text style={styles.cardValue}>{eventVenue}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Orden</Text>
            <Text style={styles.cardValue}>{orderNumber}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Total</Text>
            <Text style={styles.total}>{totalAmount}</Text>
          </Section>

          <Text style={styles.sectionTitle}>Tus pases</Text>
          {tickets.map((ticket) => (
            <Section key={ticket.id} style={styles.ticketCard}>
              <Text style={styles.ticketLabel}>{ticket.label}</Text>
              <Section style={styles.qrWrap}>
                <Img
                  src={ticket.qrCodeUrl}
                  alt={`QR ${ticket.label}`}
                  width="180"
                  height="180"
                  style={styles.qrImage}
                />
              </Section>
              <Text style={styles.codeText}>{ticket.codeText}</Text>
            </Section>
          ))}

          <Section style={styles.ctaWrap}>
            <Button href={accountUrl} style={styles.button}>
              Ver mis entradas en Tokepass
            </Button>
          </Section>

          <Text style={styles.note}>
            El QR Living en tu cuenta se actualiza en tiempo real. Llevalo en
            la app o en la web de Tokepass al ingresar.
          </Text>
          <Hr style={styles.footerRule} />
          <Text style={styles.footer}>
            Tokepass · Entradas digitales para vivir el evento
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

OrderConfirmationEmail.PreviewProps = PreviewProps

const styles = {
  body: {
    backgroundColor: "#0B0F17",
    fontFamily:
      'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    margin: 0,
    padding: "32px 12px",
  },
  container: {
    backgroundColor: "#0B0F17",
    margin: "0 auto",
    maxWidth: "560px",
    padding: "8px 12px 28px",
  },
  brand: {
    color: "#E5E7EB",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.22em",
    margin: "0 0 18px",
    textTransform: "uppercase" as const,
  },
  kicker: {
    color: "#10B981",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.18em",
    margin: "0 0 8px",
    textTransform: "uppercase" as const,
  },
  title: {
    color: "#F9FAFB",
    fontSize: "26px",
    fontWeight: 800,
    letterSpacing: "-0.03em",
    lineHeight: "1.25",
    margin: "0 0 10px",
  },
  lead: {
    color: "#9CA3AF",
    fontSize: "15px",
    lineHeight: "1.55",
    margin: "0 0 20px",
  },
  banner: {
    borderRadius: "16px",
    display: "block",
    height: "auto",
    margin: "0 0 20px",
    maxWidth: "100%",
    objectFit: "cover" as const,
    width: "100%",
  },
  card: {
    backgroundColor: "#1F2937",
    border: "1px solid #374151",
    borderRadius: "16px",
    padding: "8px 20px 16px",
  },
  cardLabel: {
    color: "#9CA3AF",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.14em",
    margin: "12px 0 4px",
    textTransform: "uppercase" as const,
  },
  cardValue: {
    color: "#F9FAFB",
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: "1.45",
    margin: "0",
  },
  total: {
    color: "#10B981",
    fontSize: "20px",
    fontWeight: 800,
    letterSpacing: "-0.03em",
    margin: "0",
  },
  divider: {
    borderColor: "#374151",
    borderTop: "1px solid #374151",
    margin: "12px 0 0",
  },
  sectionTitle: {
    color: "#F9FAFB",
    fontSize: "16px",
    fontWeight: 800,
    margin: "28px 0 12px",
  },
  ticketCard: {
    backgroundColor: "#1F2937",
    border: "1px solid #374151",
    borderRadius: "16px",
    marginBottom: "12px",
    padding: "18px 16px 16px",
    textAlign: "center" as const,
  },
  ticketLabel: {
    color: "#E5E7EB",
    fontSize: "14px",
    fontWeight: 700,
    margin: "0 0 14px",
  },
  qrWrap: {
    backgroundColor: "#FFFFFF",
    borderRadius: "12px",
    display: "inline-block",
    margin: "0 auto",
    padding: "12px",
  },
  qrImage: {
    display: "block",
    height: "180px",
    margin: "0 auto",
    width: "180px",
  },
  codeText: {
    color: "#D1D5DB",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.16em",
    margin: "14px 0 0",
    textTransform: "uppercase" as const,
  },
  ctaWrap: {
    margin: "28px 0 16px",
    textAlign: "center" as const,
  },
  button: {
    backgroundColor: "#10B981",
    borderRadius: "12px",
    color: "#FFFFFF",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: 700,
    padding: "14px 28px",
    textDecoration: "none",
  },
  note: {
    color: "#9CA3AF",
    fontSize: "12px",
    lineHeight: "1.55",
    margin: "0",
  },
  footerRule: {
    borderColor: "#374151",
    margin: "24px 0 12px",
  },
  footer: {
    color: "#6B7280",
    fontSize: "11px",
    margin: "0",
  },
} as const
