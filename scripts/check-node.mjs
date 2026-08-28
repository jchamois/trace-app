// Refuse de démarrer sur un Node non supporté. Sans ce garde-fou, Nuxt 4.5 sur
// Node 20 échoue sur « oxc-walker: could not resolve a parseSync implementation »,
// qui ne dit rien de la vraie cause : oxc-walker charge parseSync via require(),
// ce qui exige le support require(esm) apparu en Node 22.12.
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const range = pkg.engines?.node ?? ''
const minimum = range.match(/^>=\s*(\d+)\.(\d+)\.(\d+)$/)

if (!minimum) {
  console.error(`✖ engines.node vaut « ${range} », attendu la forme « >=x.y.z ».`)
  console.error('  Mettre à jour scripts/check-node.mjs si la contrainte devient un intervalle.')
  process.exit(1)
}

const required = minimum.slice(1).map(Number)
const current = process.versions.node.split('.').map(Number)
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

if (compare(current, required) < 0) {
  console.error(`\n✖ Node v${process.versions.node} détecté — ce projet exige ${range}.\n`)
  console.error('  → nvm use          (lit la version de .nvmrc)')
  console.error('  → nvm install 24   si elle n’est pas encore installée\n')
  process.exit(1)
}
