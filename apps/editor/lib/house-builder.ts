import {
  type AnyNode,
  type AnyNodeId,
  type AssetInput,
  BuildingNode,
  CeilingNode,
  ItemNode,
  LevelNode,
  RoofNode,
  RoofSegmentNode,
  SiteNode,
  SlabNode,
  WallNode,
  ZoneNode,
  generateId,
  useScene,
} from '@pascal-app/core'
import { CATALOG_ITEMS } from '@pascal-app/editor'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Room {
  name: string
  color: string
  level: number
  polygon: [number, number][]
}

interface WallSpec {
  start: [number, number]
  end: [number, number]
  thickness: number
  height: number
  level: number
}

interface ItemSpec {
  id: string           // catalog item id
  level: number
  x: number
  z: number
  y?: number           // floor offset, default 0
  rotationY?: number   // degrees, default 0
}

interface LevelSpec {
  level: number
  elevation: number    // bottom Y of this level in metres
  floorHeight: number  // wall height for this level
}

const VALID_ROOF_TYPES = new Set(['hip', 'gable', 'shed', 'gambrel', 'dutch', 'mansard', 'flat'])

// Maps common AI-generated aliases to valid roof types
const ROOF_ALIASES: Record<string, string> = {
  none: 'flat', skip: 'flat', no: 'flat', open: 'flat', omit: 'flat',
  pitched: 'gable', triangle: 'gable', peak: 'gable', peaked: 'gable',
  sloped: 'shed', slant: 'shed', lean: 'shed',
  pyramid: 'hip', hipped: 'hip',
}

function sanitizeRoofType(raw: string): 'gable' | 'hip' | 'flat' | 'shed' | 'gambrel' | 'dutch' | 'mansard' {
  const s = raw.toLowerCase().trim().replace(/[^a-z]/g, '')
  if (VALID_ROOF_TYPES.has(s)) return s as any
  return (ROOF_ALIASES[s] ?? 'flat') as any
}

// Maps common AI item id variations to real catalog ids
const ITEM_ALIASES: Record<string, string> = {
  'arm-chair': 'livingroom-chair', 'armchair': 'livingroom-chair',
  'couch': 'sofa', 'sectional': 'sofa', 'loveseat': 'sofa',
  'bed': 'double-bed', 'king-bed': 'double-bed', 'queen-bed': 'double-bed',
  'twin-bed': 'single-bed',
  'nightstand': 'bedside-table', 'night-stand': 'bedside-table',
  'wardrobe': 'closet', 'cabinet': 'kitchen-cabinet',
  'sink': 'bathroom-sink', 'basin': 'bathroom-sink',
  'shower': 'shower-square', 'bathtub-shower': 'bathtub',
  'desk': 'office-table', 'work-desk': 'office-table',
  'chair': 'dining-chair', 'side-chair': 'dining-chair',
  'lamp': 'floor-lamp', 'light': 'ceiling-lamp',
  'rug': 'rectangular-carpet', 'carpet': 'rectangular-carpet',
  'plant': 'indoor-plant', 'flower': 'indoor-plant',
  'tv': 'television', 'monitor': 'television',
  'fridge': 'fridge', 'refrigerator': 'fridge',
  'range': 'stove', 'cooktop': 'stove', 'oven': 'stove',
  'washer': 'washing-machine', 'dryer': 'washing-machine',
  'car': 'tesla', 'vehicle': 'tesla',
  'fan': 'ceiling-fan',
  'counter': 'kitchen-counter', 'countertop': 'kitchen-counter',
  'bookcase': 'bookshelf', 'bookcases': 'bookshelf',
}

function sanitizeItemId(raw: string, validIds: Set<string>): string | null {
  const s = raw.toLowerCase().trim()
  if (validIds.has(s)) return s
  if (ITEM_ALIASES[s]) return ITEM_ALIASES[s]!
  // Try partial match — pick first catalog id that contains the raw string
  for (const id of validIds) {
    if (id.includes(s) || s.includes(id)) return id
  }
  return null
}

function sanitizeColor(raw: string): string {
  const s = raw.trim()
  if (/^#[0-9a-fA-F]{3,6}$/.test(s)) return s
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`
  return '#6366f1'
}

interface HouseSpec {
  name: string
  wallThickness: number
  levels: LevelSpec[]
  rooms: Room[]
  walls: WallSpec[]
  items: ItemSpec[]
  roofType: 'gable' | 'hip' | 'flat' | 'shed' | 'gambrel' | 'dutch' | 'mansard'
  roofHeight: number
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function isHouseSpec(content: string): boolean {
  return /^\[house\]/im.test(content)
}

/**
 * Parse INI-like house spec.
 *
 * Supported sections: [house], [level], [room], [wall], [item]
 *
 * [house]
 *   name = ...
 *   wall_thickness = 0.2
 *   roof_type = none
 *   roof_height = 2.2
 *
 * [level]
 *   number = 0
 *   elevation = 0
 *   floor_height = 3.0
 *
 * [room]
 *   name = Living Room
 *   color = #3b82f6
 *   level = 0
 *   polygon = 0,0 | 8,0 | 8,6 | 0,6
 *
 * [wall]
 *   level = 0
 *   start = 0,0
 *   end = 8,0
 *
 * [item]
 *   id = sofa
 *   level = 0
 *   x = 2
 *   z = 1
 *   rotation_y = 180
 */
export function parseHouseSpec(content: string): HouseSpec {
  const spec: HouseSpec = {
    name: 'Generated House',
    wallThickness: 0.2,
    levels: [],
    rooms: [],
    walls: [],
    items: [],
    roofType: 'flat',
    roofHeight: 2.2,
  }

  // Build valid catalog id set for item validation
  const validItemIds = new Set(CATALOG_ITEMS.map((a) => a.id))

  let section = ''
  let current: Record<string, string> = {}

  const flushSection = () => {
    if (section === 'house') {
      if (current.name) spec.name = current.name.trim()
      if (current.wall_thickness) spec.wallThickness = parseFloat(current.wall_thickness)
      if (current.roof_type) spec.roofType = sanitizeRoofType(current.roof_type)
      if (current.roof_height) spec.roofHeight = parseFloat(current.roof_height)
    } else if (section === 'level') {
      spec.levels.push({
        level: current.number ? parseInt(current.number) : spec.levels.length,
        elevation: current.elevation ? parseFloat(current.elevation) : 0,
        floorHeight: current.floor_height ? parseFloat(current.floor_height) : 3.0,
      })
    } else if (section === 'room' && current.polygon) {
      const polygon = parsePolygon(current.polygon)
      if (polygon.length >= 3) {
        spec.rooms.push({
          name: current.name ?? 'Room',
          color: sanitizeColor(current.color ?? '#6366f1'),
          level: current.level ? parseInt(current.level) : 0,
          polygon,
        })
      }
    } else if (section === 'wall' && current.start && current.end) {
      const start = parsePair(current.start)
      const end = parsePair(current.end)
      if (start && end) {
        spec.walls.push({
          start,
          end,
          thickness: current.thickness ? parseFloat(current.thickness) : spec.wallThickness,
          height: current.height ? parseFloat(current.height) : 3.0,
          level: current.level ? parseInt(current.level) : 0,
        })
      }
    } else if (section === 'item' && current.id) {
      const safeId = sanitizeItemId(current.id, validItemIds)
      if (safeId) {
        spec.items.push({
          id: safeId,
          level: current.level ? parseInt(current.level) : 0,
          x: current.x ? parseFloat(current.x) : 0,
          z: current.z ? parseFloat(current.z) : 0,
          y: current.y ? parseFloat(current.y) : 0,
          rotationY: current.rotation_y ? parseFloat(current.rotation_y) : 0,
        })
      }
    }
    current = {}
  }

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    // Section headers — allow optional spaces: [ room ] or [room]
    const sectionMatch = line.match(/^\[\s*(\w+)\s*\]$/)
    if (sectionMatch) {
      flushSection()
      section = sectionMatch[1]!.toLowerCase()
      continue
    }
    // Key = value — allow = or :
    const kvMatch = line.match(/^([\w_]+)\s*[=:]\s*(.+)$/)
    if (kvMatch) current[kvMatch[1]!.toLowerCase()] = kvMatch[2]!.trim()
  }
  flushSection()

  // Auto-generate level specs if none defined
  if (spec.levels.length === 0) {
    spec.levels.push({ level: 0, elevation: 0, floorHeight: 3.0 })
  }

  return spec
}

function parsePair(s: string): [number, number] | null {
  // Strip parentheses, then split on comma or whitespace
  const clean = s.replace(/[()]/g, '').trim()
  const parts = clean.split(/[,\s]+/).map(Number)
  if (parts.length >= 2 && !isNaN(parts[0]!) && !isNaN(parts[1]!)) return [parts[0]!, parts[1]!]
  return null
}

function parsePolygon(s: string): [number, number][] {
  // Support pipe-separated, semicolon-separated, or parenthesised pairs: (0,0)(6,0)...
  const normalized = s
    .replace(/\)\s*\(/g, '|')  // (0,0)(6,0) → (0,0|(6,0
    .replace(/[()]/g, '')       // strip remaining parens
    .replace(/;/g, '|')         // semicolons → pipes
  return normalized
    .split('|')
    .map((p) => parsePair(p.trim()))
    .filter((p): p is [number, number] => p !== null)
}

// ─── Scene builder ────────────────────────────────────────────────────────────

// Build a lookup map from catalog id → asset data once
const catalogMap = new Map<string, AssetInput>(CATALOG_ITEMS.map((a) => [a.id, a]))

export function buildHouseScene(spec: HouseSpec, onProgress?: (pct: number) => void): void {
  const scene = useScene.getState()

  onProgress?.(5)

  const allPts = spec.rooms.flatMap((r) => r.polygon)
  const sitePolygon = computeSitePolygon(allPts)

  // ── IDs ───────────────────────────────────────────────────────────────────
  const siteId = generateId('site')
  const buildingId = generateId('building')

  // Map from level number → levelId
  const levelIdMap = new Map<number, AnyNodeId>()
  for (const ls of spec.levels) {
    levelIdMap.set(ls.level, generateId('level') as AnyNodeId)
  }

  const siteNode = SiteNode.parse({
    id: siteId,
    polygon: { type: 'polygon', points: sitePolygon },
    children: [],
  })

  const buildingNode = BuildingNode.parse({
    id: buildingId,
    parentId: siteId,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    children: [],
  })

  const initialNodes: Record<AnyNodeId, AnyNode> = {
    [siteId as AnyNodeId]: { ...siteNode, children: [buildingNode as any] } as AnyNode,
    [buildingId as AnyNodeId]: {
      ...buildingNode,
      children: [...levelIdMap.values()].map((id) => id as any),
    } as AnyNode,
  }

  // Create level nodes in the initial map
  for (const ls of spec.levels) {
    const levelId = levelIdMap.get(ls.level)!
    const levelNode = LevelNode.parse({
      id: levelId,
      parentId: buildingId,
      level: ls.level,
      children: [],
    })
    initialNodes[levelId] = { ...levelNode, children: [] } as AnyNode
  }

  scene.setScene(initialNodes, [siteId as AnyNodeId])

  onProgress?.(15)

  const totalSteps = spec.walls.length + spec.rooms.length + spec.items.length + spec.levels.length * 2
  let step = 0
  const tick = () => {
    step++
    onProgress?.(15 + Math.round((step / totalSteps) * 80))
  }

  // ── Walls ─────────────────────────────────────────────────────────────────
  for (const w of spec.walls) {
    const levelId = levelIdMap.get(w.level) ?? levelIdMap.get(0)!
    const levelSpec = spec.levels.find((l) => l.level === w.level) ?? spec.levels[0]!
    const wall = WallNode.parse({
      start: w.start,
      end: w.end,
      thickness: w.thickness,
      height: w.height ?? levelSpec.floorHeight,
    })
    scene.createNode(wall as any, levelId as any)
    tick()
  }

  // ── Per-level slab + ceiling ───────────────────────────────────────────────
  for (const ls of spec.levels) {
    const levelId = levelIdMap.get(ls.level)!
    const levelPts = spec.rooms.filter((r) => r.level === ls.level).flatMap((r) => r.polygon)
    if (levelPts.length >= 3) {
      const hull = computeHull(levelPts)
      const slab = SlabNode.parse({ polygon: hull, elevation: 0.05 })
      scene.createNode(slab as any, levelId as any)
      tick()
      const ceiling = CeilingNode.parse({ polygon: hull, height: ls.floorHeight })
      scene.createNode(ceiling as any, levelId as any)
      tick()
    }
  }

  // ── Zones ─────────────────────────────────────────────────────────────────
  for (const room of spec.rooms) {
    const levelId = levelIdMap.get(room.level) ?? levelIdMap.get(0)!
    const zone = ZoneNode.parse({ name: room.name, polygon: room.polygon, color: room.color })
    scene.createNode(zone as any, levelId as any)
    tick()
  }

  onProgress?.(85)

  // ── Roof (optional) ───────────────────────────────────────────────────────
  if (spec.roofHeight > 0 && allPts.length >= 3) {
    const topLevel = spec.levels.reduce((a, b) => (a.level > b.level ? a : b))
    const topLevelId = levelIdMap.get(topLevel.level)!
    const bounds = getBounds(allPts)
    const roofW = bounds.maxX - bounds.minX
    const roofD = bounds.maxZ - bounds.minZ
    const roofCX = (bounds.minX + bounds.maxX) / 2
    const roofCZ = (bounds.minZ + bounds.maxZ) / 2
    const roofY = topLevel.elevation + topLevel.floorHeight
    const roofId = generateId('roof') as AnyNodeId
    const roofSegment = RoofSegmentNode.parse({
      roofType: spec.roofType as any,
      width: roofW,
      depth: roofD,
      wallHeight: 0.3,
      roofHeight: spec.roofHeight,
      overhang: 0.4,
      position: [0, 0, 0],
    })
    const roof = RoofNode.parse({
      id: roofId,
      position: [roofCX, roofY, roofCZ],
      rotation: 0,
      children: [roofSegment.id],
    })
    scene.createNode(roof as any, topLevelId as any)
    scene.createNode(roofSegment as any, roofId as any)
  }

  // ── Furniture / items ─────────────────────────────────────────────────────
  for (const spec_item of spec.items) {
    const asset = catalogMap.get(spec_item.id)
    if (!asset) continue

    const levelId = levelIdMap.get(spec_item.level) ?? levelIdMap.get(0)!
    const levelSpec = spec.levels.find((l) => l.level === spec_item.level) ?? spec.levels[0]!
    const yBase = levelSpec.elevation + (spec_item.y ?? 0)
    const rotY = ((spec_item.rotationY ?? 0) * Math.PI) / 180

    const item = ItemNode.parse({
      position: [spec_item.x, yBase, spec_item.z],
      rotation: [0, rotY, 0],
      scale: [1, 1, 1],
      name: asset.name,
      asset,
    })
    scene.createNode(item as any, levelId as any)
    tick()
  }

  onProgress?.(100)
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function getBounds(pts: [number, number][]) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const [x, z] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
  }
  return { minX, maxX, minZ, maxZ }
}

function computeHull(pts: [number, number][]): [number, number][] {
  const { minX, maxX, minZ, maxZ } = getBounds(pts)
  return [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]]
}

function computeSitePolygon(pts: [number, number][]): [number, number][] {
  if (pts.length === 0) return [[-20, -20], [20, -20], [20, 20], [-20, 20]]
  const { minX, maxX, minZ, maxZ } = getBounds(pts)
  const pad = 6
  return [[minX - pad, minZ - pad], [maxX + pad, minZ - pad], [maxX + pad, maxZ + pad], [minX - pad, maxZ + pad]]
}
