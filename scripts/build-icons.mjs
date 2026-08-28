/**
 * Exporte les icônes PNG du manifeste à partir des deux SVG sources du handoff.
 *
 * Lancé **à la main** (`npm run icons`), jamais au build : ces fichiers ne
 * changent qu'à une refonte d'identité, et les régénérer à chaque `npm ci`
 * ajouterait `sharp` au chemin critique de la CI pour un résultat identique.
 * Les PNG sont donc versionnés.
 */
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const ICONS_DIR = new URL('../public/icons/', import.meta.url)

/* `apple-touch-icon` est le seul à devoir être **opaque** : iOS ne compose pas la
   transparence, il la rendrait noire sur fond noir. L'icône standard a déjà son
   propre fond, mais le rendu SVG produit de l'alpha sur les coins arrondis. */
const EXPORTS = [
  { source: 'icon.svg', name: 'pwa-32.png', size: 32 },
  { source: 'icon.svg', name: 'pwa-192.png', size: 192 },
  { source: 'icon.svg', name: 'pwa-512.png', size: 512 },
  { source: 'icon.svg', name: 'apple-touch-icon.png', size: 180, background: '#0E0E10' },
  { source: 'icon-maskable.svg', name: 'maskable-192.png', size: 192 },
  { source: 'icon-maskable.svg', name: 'maskable-512.png', size: 512 },
]

const build = async ({ source, name, size, background }) => {
  const svg = await readFile(new URL(source, ICONS_DIR))

  /* `density` et non un simple `resize` : sans elle, librsvg rastérise à 96 dpi
     puis sharp agrandit le bitmap — les bords du trait ressortent crénelés. La
     formule cale la rastérisation directement à la taille demandée, le viewBox
     des deux sources faisant 512. */
  let pipeline = sharp(svg, { density: (72 * size) / 512 }).resize(size, size)

  if (background) pipeline = pipeline.flatten({ background })

  await writeFile(new URL(name, ICONS_DIR), await pipeline.png({ compressionLevel: 9 }).toBuffer())

  console.log(`  ${name.padEnd(22)} ${size}×${size}`)
}

console.log('Icônes → public/icons/')
await Promise.all(EXPORTS.map(build))
