// Available catalog item IDs for the system prompt
const CATALOG_IDS = [
  // Outdoor
  'tesla','pillar','high-fence','medium-fence','low-fence','bush','fir-tree','tree','palm',
  'patio-umbrella','sunbed','parking-spot','outdoor-playhouse','skate','scooter',
  'basket-hoop','ball',
  // Doors & Windows
  'door','glass-door','door-bar','window-double','window-simple','window-rectangle',
  // Kitchen
  'kitchen','kitchen-counter','kitchen-cabinet','kitchen-shelf','fridge','stove','hood',
  'microwave','toaster','kettle','coffee-machine','cutting-board','frying-pan',
  'kitchen-utensils','wine-bottle','fruits',
  // Bathroom
  'toilet','shower-square','shower-angle','bathtub','bathroom-sink','washing-machine',
  'drying-rack','laundry-bag','shower-rug','toilet-paper',
  // Bedroom
  'double-bed','single-bed','bunkbed','bedside-table','dresser','closet',
  // Living / Seating
  'sofa','lounge-chair','livingroom-chair','dining-chair','stool','office-chair',
  // Tables
  'dining-table','coffee-table','office-table',
  // Lighting
  'ceiling-lamp','recessed-light','floor-lamp','table-lamp',
  // Storage
  'bookshelf','shelf','tv-stand','coat-rack','trash-bin',
  // Electronics
  'television','computer','stereo-speaker','air-conditioning','ceiling-fan','thermostat',
  // Appliances
  'ev-wall-charger','electric-panel','smoke-detector','sprinkler',
  // Decor
  'indoor-plant','small-indoor-plant','cactus','round-carpet','rectangular-carpet',
  'picture','round-mirror','books','guitar','piano','easel',
  // Fitness
  'threadmill','barbell-stand','barbell',
  // Structure
  'column','stairs',
].join(', ')

const SYSTEM_PROMPT = `Pascal 3D editor architectural spec generator. Output ONLY the INI spec, no markdown, no explanation.

ITEM IDs (only these): ${CATALOG_IDS}

FORMAT:
[house]
name=X
wall_thickness=0.2
roof_type=flat
roof_height=0

[level]
number=0
elevation=0
floor_height=3.0

[room]
name=X
color=#hex
level=0
polygon=x1,z1|x2,z2|x3,z3|x4,z4

[wall]
level=0
start=x1,z1
end=x2,z2

[item]
id=<catalog id>
level=0
x=N
z=N
rotation_y=0

RULES:
- Units: metres. Origin top-left. x=right, z=down.
- All coordinates must be multiples of 0.5.
- Rooms are rectangles (exactly 4 polygon points). Rooms tile side-by-side sharing edges — no gaps, no overlaps.
- Room size minimums: bedroom≥3×4, bathroom≥2×3, kitchen≥4×3, living/dining≥5×5, garage≥6×6.
- Walls must trace every room edge exactly.
- Multi-story: level 0 elevation=0, level 1 elevation=3.0, level 2 elevation=6.0, etc.
- STAIRS: for every multi-story building, place [item] id=stairs on every lower floor (level 0, 1, ..., n-1). Position stairs inside a hallway or landing area.
- Furniture: 4–6 items per room. Place items 0.5m from walls. Never invent item IDs.
- Per-room furniture guide:
  bedroom → double-bed or single-bed, bedside-table, closet, dresser, ceiling-lamp
  bathroom → toilet, bathroom-sink, shower-square or bathtub, towel-rack, ceiling-lamp
  kitchen → kitchen, fridge, stove, kitchen-counter, microwave, kettle
  living room → sofa, coffee-table, television, tv-stand, floor-lamp, livingroom-chair
  dining room → dining-table, dining-chair (×2–4), bookshelf, ceiling-lamp
  garage → tesla, ev-wall-charger, trash-bin, electric-panel
  office → office-table, office-chair, computer, bookshelf, floor-lamp
  gym → threadmill, barbell-stand, barbell, floor-lamp
- Add window-double or window-simple on outer walls of every room (place as [item] near wall centre).
- Never output roof_type=none; use flat when no roof is requested.`

export async function generateHouseSpec(
  userPrompt: string,
  onProgress?: (msg: string) => void,
): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_KIMI_API_KEY
  if (!apiKey) throw new Error('NEXT_PUBLIC_KIMI_API_KEY is not set in .env.local')

  const body = JSON.stringify({
    model: 'moonshot-v1-8k',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.4,
    max_tokens: 4096,
  })

  const MAX_RETRIES = 3
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    onProgress?.(attempt === 1 ? 'Sending prompt to Kimi...' : `Retrying… (attempt ${attempt}/${MAX_RETRIES})`)

    try {
      const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body,
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(`Kimi API error ${response.status}: ${err}`)
      }

      onProgress?.('Parsing response...')

      const json = await response.json()
      const text: string = json?.choices?.[0]?.message?.content ?? ''

      if (!text.trim()) throw new Error('Kimi returned an empty response.')

      return text.replace(/^```[^\n]*\n?/gm, '').replace(/^```$/gm, '').trim()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // Only retry on network-level errors, not API errors (4xx/5xx)
      const isNetworkError = !(lastError.message.startsWith('Kimi API error'))
      if (!isNetworkError || attempt === MAX_RETRIES) throw lastError
      // Wait briefly before retry (500ms, 1000ms)
      await new Promise((r) => setTimeout(r, attempt * 500))
    }
  }

  throw lastError
}
