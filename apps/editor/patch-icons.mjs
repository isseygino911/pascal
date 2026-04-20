import fs from 'fs'
import path from 'path'

const OUT = 'out'

function patchFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const patched = content
    .replaceAll('"/icons/', '"/editor/icons/')
    .replaceAll("'/icons/", "'/editor/icons/")
    .replaceAll('href="/icons/', 'href="/editor/icons/')
  if (patched !== content) {
    fs.writeFileSync(filePath, patched)
    console.log('patched:', filePath)
  }
}

// Patch JS chunks
const chunksDir = path.join(OUT, '_next', 'static', 'chunks')
for (const f of fs.readdirSync(chunksDir)) {
  if (f.endsWith('.js')) patchFile(path.join(chunksDir, f))
}

// Patch HTML files (preload hints)
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith('.html')) patchFile(path.join(OUT, f))
}

console.log('icon paths patched')
