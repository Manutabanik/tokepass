import { generateConcentricRing } from "@/lib/seating/concentric-ring"
import {
  createVenueElement,
  rebuildElementSeats,
} from "@/lib/seating/venue-element-geometry"
import { rebuildSectorSeats } from "@/lib/seating/venue-map-geometry"
import {
  emptyVenueMap,
  parseVenueMap,
  type InteractiveVenueMap,
  type VenueElementType,
  type VenueInfraSubtype,
  type VenueMapElement,
  type VenueMapSector,
} from "@/types/venue-map"

export type BuiltinVenueTemplateId =
  | "theater"
  | "amphitheater"
  | "pena"
  | "gala"
  | "club"
  | "blank"

export type BuiltinVenueTemplateMeta = {
  id: BuiltinVenueTemplateId
  title: string
  description: string
  icon: "ticket" | "landmark" | "utensils" | "sparkles" | "music" | "plus"
}

export const VENUE_TEMPLATE_CATALOG: BuiltinVenueTemplateMeta[] = [
  {
    id: "theater",
    title: "Teatro / Auditorio clásico",
    description: "Escenario, platea baja curva y pullman listos para numerar precios.",
    icon: "ticket",
  },
  {
    id: "amphitheater",
    title: "Anfiteatro en graderías",
    description: "Arcos de mesas y tablones numerados alrededor del escenario.",
    icon: "landmark",
  },
  {
    id: "pena",
    title: "Peña folclórica / patio",
    description: "Pista central, filas de tablones y barra para gastronomía.",
    icon: "utensils",
  },
  {
    id: "gala",
    title: "Cena show / gala",
    description: "Mesas redondas de 6 y 8 sillas distribuidas frente al escenario.",
    icon: "sparkles",
  },
  {
    id: "club",
    title: "Boliche / fiesta VIP",
    description: "Cabina DJ, campo de pie y boxes o livings VIP.",
    icon: "music",
  },
  {
    id: "blank",
    title: "Diseño personalizado",
    description: "Lienzo en blanco para armar el recinto desde cero.",
    icon: "plus",
  },
]

function cloneMap(map: InteractiveVenueMap): InteractiveVenueMap {
  return parseVenueMap(JSON.parse(JSON.stringify(map)) as InteractiveVenueMap)
}

function makeSector(
  input: Omit<VenueMapSector, "seats">,
): VenueMapSector {
  const draft: VenueMapSector = { ...input, seats: [] }
  return { ...draft, seats: rebuildSectorSeats(draft) }
}

function place(
  type: VenueElementType,
  point: { x: number; y: number },
  patch: Partial<VenueMapElement> & { subtype?: VenueInfraSubtype } = {},
): VenueMapElement {
  const created = createVenueElement(type, 0, point, patch.subtype)
  const next: VenueMapElement = {
    ...created,
    ...patch,
    type,
    x: point.x,
    y: point.y,
  }
  if (type === "infrastructure") {
    next.category = "infrastructure"
    next.sectorName = ""
    next.price = 0
    next.seats = []
    return next
  }
  next.category = "commercial"
  next.sectorName = patch.sectorName || created.sectorName
  if (
    type === "round_table" ||
    type === "long_table" ||
    type === "vip_box"
  ) {
    next.sellMode = patch.sellMode ?? "group"
    next.priceMode =
      patch.priceMode ?? (next.sellMode === "group" ? "closed_unit" : "per_person")
    next.priceMode = patch.priceMode ?? (next.sellMode === "group" ? "closed_unit" : "per_person")
  }
  next.seats = rebuildElementSeats(next)
  return next
}

function numberGroup(
  elements: VenueMapElement[],
  groupId: string,
  prefix: string,
): VenueMapElement[] {
  let index = 1
  return elements.map((element) => {
    if (element.groupId !== groupId) return element
    const next = {
      ...element,
      label: `${prefix} ${String(index).padStart(2, "0")}`,
    }
    index += 1
    next.seats = rebuildElementSeats(next)
    return next
  })
}

function assemble(
  patch: Partial<InteractiveVenueMap>,
): InteractiveVenueMap {
  return parseVenueMap({
    ...emptyVenueMap(),
    backgroundImage: null,
    ...patch,
  })
}

function theaterMap(): InteractiveVenueMap {
  return assemble({
    stage: { label: "ESCENARIO", x: 200, y: 18, width: 400, height: 44 },
    labels: [
      {
        id: "lbl-platea",
        text: "PLATEA BAJA",
        x: 400,
        y: 78,
        color: "#86efac",
      },
      {
        id: "lbl-pullman",
        text: "PULLMAN",
        x: 400,
        y: 318,
        color: "#93c5fd",
      },
    ],
    aisles: [{ id: "aisle-center", x: 392, y: 96, width: 16, height: 420 }],
    sectors: [
      makeSector({
        id: "platea-baja",
        name: "Platea Baja",
        color: "#10b981",
        price: 0,
        x: 400,
        y: 118,
        rows: 8,
        seatsPerRow: 14,
        curvature: 0.72,
        aisle: true,
      }),
      makeSector({
        id: "pullman",
        name: "Pullman",
        color: "#6366f1",
        price: 0,
        x: 400,
        y: 338,
        rows: 6,
        seatsPerRow: 16,
        curvature: 0.42,
        aisle: true,
      }),
    ],
    elements: [],
  })
}

function amphitheaterMap(): InteractiveVenueMap {
  const orange = generateConcentricRing({
    groupId: "grada-naranja",
    groupName: "Grada Naranja",
    color: "#ea580c",
    centerX: 400,
    centerY: 508,
    startAngle: -70,
    endAngle: 70,
    innerRadius: 120,
    outerRadius: 220,
    rows: 3,
    rowTypes: ["round_table", "round_table", "round_table"],
    countPerRow: ["auto", "auto", "auto"],
    aisle: true,
    aisleWidthDeg: 16,
    aisleCenterDeg: 0,
    price: 0,
  })
  const yellow = generateConcentricRing({
    groupId: "grada-amarilla",
    groupName: "Grada Amarilla",
    color: "#f59e0b",
    centerX: 400,
    centerY: 508,
    startAngle: -74,
    endAngle: 74,
    innerRadius: 268,
    outerRadius: 330,
    rows: 2,
    rowTypes: ["long_table", "long_table"],
    countPerRow: ["auto", "auto"],
    aisle: true,
    aisleWidthDeg: 16,
    aisleCenterDeg: 0,
    price: 0,
  })
  const numbered = numberGroup(
    numberGroup([...orange, ...yellow], "grada-naranja", "Mesa"),
    "grada-amarilla",
    "Tablón",
  )
  return assemble({
    stage: { label: "ESCENARIO", x: 250, y: 16, width: 300, height: 42 },
    labels: [
      {
        id: "lbl-pista",
        text: "PISTA",
        x: 400,
        y: 430,
        color: "#a1a1aa",
      },
    ],
    sectors: [],
    elements: numbered,
  })
}

function penaMap(): InteractiveVenueMap {
  const tablones: VenueMapElement[] = []
  let n = 1
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const left = col < 2
      const x = left ? 120 + col * 110 : 470 + (col - 2) * 110
      const y = 168 + row * 78
      tablones.push(
        place("long_table", { x, y }, {
          id: `tablon-${n}`,
          label: `Tablón ${String(n).padStart(2, "0")}`,
          category: "commercial",
          sectorName: "Tablones",
          groupId: "tablones",
          groupName: "Tablones",
          color: "#f97316",
          sideA: 5,
          sideB: 5,
          width: 108,
          height: 28,
          sellMode: "group",
          price: 0,
        }),
      )
      n += 1
    }
  }
  return assemble({
    stage: { label: "ESCENARIO", x: 210, y: 16, width: 380, height: 44 },
    labels: [
      { id: "lbl-pista", text: "PISTA", x: 400, y: 118, color: "#86efac" },
    ],
    sectors: [],
    elements: [
      place("standing_zone", { x: 400, y: 250 }, {
        id: "pista-central",
        label: "Pista central",
        category: "commercial",
        sectorName: "Pista",
        color: "#10b981",
        width: 168,
        height: 280,
        capacity: 80,
        price: 0,
      }),
      ...tablones,
      place("infrastructure", { x: 400, y: 528 }, {
        subtype: "bar",
        id: "barra-pena",
        label: "BARRA",
        category: "infrastructure",
        sectorName: "",
        width: 220,
        height: 36,
      }),
      place("infrastructure", { x: 86, y: 528 }, {
        subtype: "restroom",
        id: "banos-pena",
        label: "BAÑOS",
        category: "infrastructure",
        sectorName: "",
        width: 72,
        height: 40,
      }),
    ],
  })
}

function galaMap(): InteractiveVenueMap {
  const tables: VenueMapElement[] = []
  let n = 1
  for (let row = 0; row < 3; row += 1) {
    const cols = row === 1 ? 4 : 3
    for (let col = 0; col < cols; col += 1) {
      const offset = cols === 4 ? 0 : 48
      const chairs = n % 2 === 0 ? 8 : 6
      tables.push(
        place("round_table", { x: 168 + offset + col * 156, y: 168 + row * 118 }, {
          id: `mesa-gala-${n}`,
          label: `Mesa ${String(n).padStart(2, "0")}`,
          category: "commercial",
          sectorName: "Cena",
          groupId: "mesas-gala",
          groupName: "Mesas de gala",
          color: "#ec4899",
          chairCount: chairs,
          sellMode: "group",
          price: 0,
        }),
      )
      n += 1
    }
  }
  return assemble({
    stage: { label: "ESCENARIO", x: 200, y: 18, width: 400, height: 44 },
    labels: [
      { id: "lbl-gala", text: "CENA SHOW", x: 400, y: 86, color: "#f9a8d4" },
    ],
    sectors: [],
    elements: tables,
  })
}

function clubMap(): InteractiveVenueMap {
  const boxes: VenueMapElement[] = []
  for (let index = 0; index < 6; index += 1) {
    const left = index < 3
    const slot = left ? index : index - 3
    boxes.push(
      place("vip_box", {
        x: left ? 88 : 712,
        y: 168 + slot * 110,
      }, {
        id: `box-vip-${index + 1}`,
        label: `Box VIP ${String(index + 1).padStart(2, "0")}`,
        category: "commercial",
        sectorName: "VIP",
        groupId: "boxes-vip",
        groupName: "Boxes VIP",
        color: "#a855f7",
        chairCount: 6,
        width: 92,
        height: 64,
        sellMode: "group",
        price: 0,
      }),
    )
  }
  return assemble({
    stage: null,
    labels: [
      { id: "lbl-pista", text: "PISTA", x: 400, y: 300, color: "#86efac" },
    ],
    sectors: [],
    elements: [
      place("infrastructure", { x: 400, y: 42 }, {
        subtype: "dj_booth",
        id: "dj-booth",
        label: "DJ BOOTH",
        category: "infrastructure",
        sectorName: "",
        width: 220,
        height: 48,
      }),
      place("standing_zone", { x: 400, y: 300 }, {
        id: "campo-general",
        label: "Campo general",
        category: "commercial",
        sectorName: "General",
        color: "#10b981",
        width: 280,
        height: 260,
        capacity: 200,
        price: 0,
      }),
      ...boxes,
      place("infrastructure", { x: 400, y: 528 }, {
        subtype: "bar",
        id: "barra-club",
        label: "BARRA",
        category: "infrastructure",
        sectorName: "",
        width: 200,
        height: 36,
      }),
      place("infrastructure", { x: 86, y: 528 }, {
        subtype: "restroom",
        id: "banos-club",
        label: "BAÑOS",
        category: "infrastructure",
        sectorName: "",
        width: 72,
        height: 40,
      }),
    ],
  })
}

function blankMap(): InteractiveVenueMap {
  return assemble({
    stage: null,
    labels: [],
    aisles: [],
    sectors: [],
    elements: [],
  })
}

const PRESETS: Record<BuiltinVenueTemplateId, InteractiveVenueMap> = {
  theater: theaterMap(),
  amphitheater: amphitheaterMap(),
  pena: penaMap(),
  gala: galaMap(),
  club: clubMap(),
  blank: blankMap(),
}

export function getVenueTemplateMap(
  id: BuiltinVenueTemplateId,
): InteractiveVenueMap {
  return cloneMap(PRESETS[id] ?? PRESETS.blank)
}

export function isBlankVenueTemplate(id: BuiltinVenueTemplateId): boolean {
  return id === "blank"
}
