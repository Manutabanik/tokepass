import {
  Document,
  Image,
  Page,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer"

import {
  THERMAL_58_PAGE_SIZE,
  THERMAL_80_PAGE_SIZE,
  type ThermalTicketPdfModel,
  type TicketPdfSize,
} from "@/lib/pdf/ticket-pdf-model"

const INK = "#000000"
const PAPER = "#FFFFFF"
const MUTED = "#18181B"

const thermal = StyleSheet.create({
  page80: {
    width: THERMAL_80_PAGE_SIZE[0],
    padding: 8,
    backgroundColor: PAPER,
    fontFamily: "Helvetica",
    color: INK,
  },
  page58: {
    width: THERMAL_58_PAGE_SIZE[0],
    padding: 6,
    backgroundColor: PAPER,
    fontFamily: "Helvetica",
    color: INK,
  },
  header: {
    textAlign: "center",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: INK,
    borderBottomStyle: "solid",
    marginBottom: 6,
  },
  eventFlyer: {
    width: "100%",
    height: 70,
    objectFit: "cover",
    marginBottom: 4,
  },
  eventFlyer58: {
    width: "100%",
    height: 48,
    objectFit: "cover",
    marginBottom: 3,
  },
  eventTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    textAlign: "center",
    color: INK,
  },
  eventTitle58: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    textAlign: "center",
    color: INK,
  },
  testBanner: {
    marginBottom: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: INK,
    textAlign: "center",
  },
  testBannerText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    color: INK,
  },
  tierBox: {
    backgroundColor: INK,
    padding: 8,
    marginVertical: 6,
    alignItems: "center",
  },
  tierBox58: {
    backgroundColor: INK,
    padding: 6,
    marginVertical: 4,
    alignItems: "center",
  },
  tierLabel: {
    color: PAPER,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    textAlign: "center",
  },
  tierTitle: {
    color: PAPER,
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    marginTop: 2,
    textAlign: "center",
  },
  tierTitle58: {
    color: PAPER,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    marginTop: 2,
    textAlign: "center",
  },
  sectorBadge: {
    backgroundColor: PAPER,
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  sectorBadgeText: {
    color: INK,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  detailsBlock: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: INK,
    borderBottomStyle: "dashed",
    alignItems: "center",
  },
  detailText: {
    fontSize: 8,
    color: MUTED,
    textAlign: "center",
  },
  detailTextBold: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: INK,
    textAlign: "center",
  },
  qrContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: INK,
  },
  qrImage: {
    width: 120,
    height: 120,
  },
  qrImage58: {
    width: 88,
    height: 88,
  },
  ticketCode: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    marginTop: 4,
    textAlign: "center",
    color: INK,
  },
  auditBlock: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: INK,
    borderBottomStyle: "dashed",
  },
  auditRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  auditText: {
    fontSize: 7,
    color: MUTED,
    maxWidth: "48%",
  },
  auditMeta: {
    fontSize: 7,
    color: MUTED,
    marginTop: 2,
  },
  footer: {
    paddingTop: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  brandName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginLeft: 4,
  },
  domainText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  subFooterText: {
    fontSize: 6,
    color: MUTED,
    marginTop: 1,
  },
})

const a4 = StyleSheet.create({
  page: {
    padding: 36,
    backgroundColor: PAPER,
    fontFamily: "Helvetica",
    color: INK,
  },
  card: {
    borderWidth: 1,
    borderColor: INK,
    padding: 16,
  },
  cutRow: {
    marginTop: 12,
    alignItems: "center",
  },
  cutLine: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: INK,
    borderTopStyle: "dashed",
    marginTop: 4,
  },
  cutHint: {
    fontSize: 8,
    color: MUTED,
    letterSpacing: 1,
  },
  restHint: {
    marginTop: 16,
    fontSize: 9,
    color: MUTED,
  },
})

function TokepassPdfWordmark({ compact = false }: { compact?: boolean }) {
  const mark = compact ? 11 : 14
  return (
    <View style={thermal.brandRow}>
      <Svg width={mark} height={mark} viewBox="0 0 32 32">
        <Rect x={0} y={0} width={32} height={32} rx={7} fill={INK} />
        <Rect x={6} y={7} width={20} height={5.5} rx={2.75} fill={PAPER} />
        <Rect x={13.25} y={10} width={5.5} height={10.5} rx={2.75} fill={PAPER} />
        <Rect x={12.5} y={23} width={7} height={3} rx={1.5} fill={PAPER} />
      </Svg>
      <Text style={thermal.brandName}>TokePass</Text>
    </View>
  )
}

function TicketBody({
  ticket,
  compact,
}: {
  ticket: ThermalTicketPdfModel
  compact: boolean
}) {
  return (
    <>
      <View style={thermal.header}>
        {ticket.isTest ? (
          <View style={thermal.testBanner}>
            <Text style={thermal.testBannerText}>ENTRADA DE PRUEBA</Text>
          </View>
        ) : null}
        {ticket.eventFlyerSrc ? (
          <Image
            src={ticket.eventFlyerSrc}
            style={compact ? thermal.eventFlyer58 : thermal.eventFlyer}
          />
        ) : null}
        <Text style={compact ? thermal.eventTitle58 : thermal.eventTitle}>
          {ticket.eventName}
        </Text>
      </View>

      <View style={compact ? thermal.tierBox58 : thermal.tierBox}>
        <Text style={thermal.tierLabel}>TIPO DE ENTRADA</Text>
        <Text style={compact ? thermal.tierTitle58 : thermal.tierTitle}>
          {ticket.ticketTierName}
        </Text>
        {ticket.sectorName ? (
          <View style={thermal.sectorBadge}>
            <Text style={thermal.sectorBadgeText}>
              SECTOR: {ticket.sectorName}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={thermal.detailsBlock}>
        {ticket.eventDateFormatted ? (
          <Text style={thermal.detailTextBold}>{ticket.eventDateFormatted}</Text>
        ) : null}
        {ticket.eventLocationName ? (
          <Text style={thermal.detailText}>{ticket.eventLocationName}</Text>
        ) : null}
      </View>

      <View style={thermal.qrContainer}>
        <Image
          src={ticket.qrDataUri}
          style={compact ? thermal.qrImage58 : thermal.qrImage}
        />
        {ticket.ticketCode ? (
          <Text style={thermal.ticketCode}>{ticket.ticketCode}</Text>
        ) : null}
      </View>

      <View style={thermal.auditBlock}>
        <View style={thermal.auditRow}>
          {ticket.ticketPrice ? (
            <Text style={thermal.auditText}>PRECIO: {ticket.ticketPrice}</Text>
          ) : (
            <Text style={thermal.auditText}> </Text>
          )}
          {ticket.paymentMethod ? (
            <Text style={thermal.auditText}>PAGO: {ticket.paymentMethod}</Text>
          ) : null}
        </View>
        <View style={thermal.auditRow}>
          {ticket.customerName ? (
            <Text style={thermal.auditText}>TITULAR: {ticket.customerName}</Text>
          ) : (
            <Text style={thermal.auditText}> </Text>
          )}
          {ticket.customerDni ? (
            <Text style={thermal.auditText}>DNI: {ticket.customerDni}</Text>
          ) : null}
        </View>
        {ticket.issueDateFormatted || ticket.orderIdShort ? (
          <Text style={thermal.auditMeta}>
            {ticket.issueDateFormatted
              ? `EMISION: ${ticket.issueDateFormatted}`
              : ""}
            {ticket.issueDateFormatted && ticket.orderIdShort ? "  " : ""}
            {ticket.orderIdShort ? `ID: ${ticket.orderIdShort}` : ""}
          </Text>
        ) : null}
      </View>

      <View style={thermal.footer}>
        <TokepassPdfWordmark compact={compact} />
        <Text style={thermal.domainText}>tokepass.com.ar</Text>
        <Text style={thermal.subFooterText}>Boleteria Digital Oficial</Text>
      </View>
    </>
  )
}

function ThermalTicketPage({
  ticket,
  format,
}: {
  ticket: ThermalTicketPdfModel
  format: "80mm" | "58mm"
}) {
  const compact = format === "58mm"
  return (
    <Page
      size={compact ? THERMAL_58_PAGE_SIZE : THERMAL_80_PAGE_SIZE}
      wrap={false}
      style={compact ? thermal.page58 : thermal.page80}
    >
      <TicketBody ticket={ticket} compact={compact} />
    </Page>
  )
}

function A4TicketPage({ ticket }: { ticket: ThermalTicketPdfModel }) {
  return (
    <Page size="A4" style={a4.page}>
      <View style={a4.card}>
        <TicketBody ticket={ticket} compact={false} />
      </View>
      <View style={a4.cutRow}>
        <Text style={a4.cutHint}>CORTAR POR LA LINEA</Text>
        <View style={a4.cutLine} />
      </View>
      <Text style={a4.restHint}>
        Conserva este voucher. El codigo QR es valido para el acceso al evento.
      </Text>
    </Page>
  )
}

export function AdmissionTicketPdf({
  tickets,
  format,
}: {
  tickets: ThermalTicketPdfModel[]
  format: TicketPdfSize
}) {
  const title =
    tickets.length === 1
      ? `${tickets[0]?.eventName ?? "Entrada"} — TokePass`
      : "Entradas TokePass"

  return (
    <Document
      title={title}
      author="TokePass"
      creator="TokePass"
      producer="TokePass"
      language="es"
    >
      {tickets.map((ticket) =>
        format === "a4" ? (
          <A4TicketPage key={ticket.ticketId} ticket={ticket} />
        ) : (
          <ThermalTicketPage
            key={ticket.ticketId}
            ticket={ticket}
            format={format}
          />
        ),
      )}
    </Document>
  )
}

/** Alias pedido por la arquitectura de ticket termico. */
export const ThermalTicketPdf = AdmissionTicketPdf
