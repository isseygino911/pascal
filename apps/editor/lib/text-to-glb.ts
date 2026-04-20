import { Group, Mesh, MeshStandardMaterial, Scene } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'

const FONT_URL = '/fonts/droid_sans_regular.typeface.json'

export const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.yaml', '.yml', '.log', '.xml',
])

let cachedFont: ReturnType<FontLoader['parse']> | null = null

async function loadFont() {
  if (cachedFont) return cachedFont
  const loader = new FontLoader()
  cachedFont = await loader.loadAsync(FONT_URL)
  return cachedFont
}

export function isTextFile(file: File): boolean {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
  return TEXT_EXTENSIONS.has(ext) || file.type.startsWith('text/')
}

export async function textToGlb(
  textContent: string,
  onProgress?: (pct: number) => void,
): Promise<ArrayBuffer> {
  onProgress?.(10)

  const displayText =
    textContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0)
      ?.slice(0, 60) ?? 'Text'

  onProgress?.(20)
  const font = await loadFont()
  onProgress?.(50)

  const geometry = new TextGeometry(displayText, {
    font,
    size: 0.5,
    depth: 0.2,
    curveSegments: 6,
    bevelEnabled: false,
  })
  geometry.center()

  const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: 0x888888 }))
  mesh.name = 'GeneratedText'

  const group = new Group()
  group.name = 'TextModel'
  group.position.set(0, 0.1, 0)
  group.add(mesh)

  const scene = new Scene()
  scene.add(group)

  onProgress?.(70)

  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(scene, { binary: true })

  onProgress?.(95)
  return result as ArrayBuffer
}
