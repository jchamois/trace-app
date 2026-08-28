import { describe, expect, it } from 'vitest'
import { edgeRamp, sobelMagnitudes, thresholdForRatio } from '~/utils/edgeStats'

/** Fabrique une image en niveaux de gris à partir d'une fonction (x, y) → 0..1. */
const grid = (w: number, h: number, f: (x: number, y: number) => number) => {
  const gray = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = f(x, y)

  return gray
}

/** Part des magnitudes atteignant le seuil — la sémantique d'un quantile. */
const shareAbove = (sorted: Float32Array, t: number) =>
  sorted.reduce((n, m) => n + (m >= t ? 1 : 0), 0) / sorted.length

/**
 * Bruit déterministe, continu et sans structure : le seul moyen d'obtenir une
 * distribution de magnitudes réaliste. Les motifs réguliers (damiers, rampes) ne
 * produisent qu'une poignée de valeurs distinctes, et un quantile n'a alors aucun
 * sens — c'est ce qui a fait échouer la première version de ces tests.
 */
const noise = (x: number, y: number) => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return n - Math.floor(n)
}

describe('sobelMagnitudes', () => {
  it('rend zéro sur un aplat', () => {
    const m = sobelMagnitudes(grid(8, 8, () => 0.5), 8, 8)

    expect(m.length).toBe(36)
    expect(Math.max(...m)).toBe(0)
  })

  it('mesure une rampe horizontale à la valeur attendue', () => {
    /* Pente de 0,1 par pixel en x. Sobel horizontal : gx = 4 × 0,2 = 0,8, gy = 0,
       donc magnitude = 0,8 / 4 = 0,2. C'est ce calcul, et sa division par 4, qui
       doivent rester identiques à ceux du shader. */
    const m = sobelMagnitudes(grid(8, 8, x => x * 0.1), 8, 8)

    expect(m[0]).toBeCloseTo(0.2, 6)
    expect(m[m.length - 1]).toBeCloseTo(0.2, 6)
  })

  it('plafonne à 1 sur une transition franche', () => {
    const m = sobelMagnitudes(grid(8, 8, x => (x < 4 ? 0 : 1)), 8, 8)

    expect(Math.max(...m)).toBe(1)
  })

  it('rend les magnitudes triées croissant', () => {
    const m = sobelMagnitudes(grid(16, 16, (x, y) => ((x * y) % 7) / 7), 16, 16)

    expect([...m]).toEqual([...m].sort((a, b) => a - b))
  })

  it('rend un tableau vide sur une image trop petite pour un noyau 3×3', () => {
    expect(sobelMagnitudes(grid(2, 2, () => 1), 2, 2).length).toBe(0)
  })

  it('mesure la même magnitude quel que soit le pas d’échantillonnage', () => {
    /* Le pas espace les points de **mesure**, pas les voisins lus par le noyau.
       C'est ce qui garde les magnitudes à l'échelle de la définition de rendu :
       calibrer sur une vignette réduite les multipliait par quatre, et le seuil
       qu'on en tirait ne laissait plus rien passer. */
    const image = grid(64, 64, x => x * 0.01)

    const dense = sobelMagnitudes(image, 64, 64, 1)
    const sparse = sobelMagnitudes(image, 64, 64, 4)

    expect(sparse.length).toBeLessThan(dense.length / 10)
    expect(sparse[0]).toBeCloseTo(dense[0]!, 9)
    expect(sparse[sparse.length - 1]).toBeCloseTo(dense[dense.length - 1]!, 9)
  })

  it('donne la même distribution échantillonnée qu’en dense', () => {
    const image = grid(128, 128, noise)
    const median = (m: Float32Array) => m[Math.floor(m.length / 2)]!

    expect(median(sobelMagnitudes(image, 128, 128, 4)))
      .toBeCloseTo(median(sobelMagnitudes(image, 128, 128, 1)), 2)
  })

  it('ne laisse aucune queue de zéros quand le pas ne divise pas la taille', () => {
    // Un tableau surdimensionné puis rempli partiellement fausserait les quantiles
    // en injectant des magnitudes nulles inexistantes.
    const m = sobelMagnitudes(grid(23, 17, noise), 23, 17, 4)

    expect(m.length).toBe(Math.ceil(21 / 4) * Math.ceil(15 / 4))
  })
})

describe('thresholdForRatio', () => {
  it('rend le quantile exact sur une distribution contrôlée', () => {
    // 0, 1, … 99 : le seuil laissant passer 10 % doit être 90.
    const sorted = Float32Array.from({ length: 100 }, (_, i) => i)

    expect(thresholdForRatio(sorted, 0.1)).toBe(90)
    expect(thresholdForRatio(sorted, 0.5)).toBe(50)
    expect(thresholdForRatio(sorted, 1)).toBe(0)
  })

  it('encre la proportion demandée sur une distribution resserrée', () => {
    // Le cas de la photographie : gradients faibles, tassés près de zéro.
    const m = sobelMagnitudes(grid(96, 96, (x, y) => 0.5 + 0.02 * noise(x, y)), 96, 96)

    expect(shareAbove(m, thresholdForRatio(m, 0.08))).toBeCloseTo(0.08, 2)
  })

  it('encre la même proportion sur une distribution étalée', () => {
    /* Le cas du dessin au trait : contrastes forts. C'est la propriété qui remplace
       le seuil fixe — un même réglage doit donner la même quantité d'encre sur les
       deux familles d'images, là où un seuil absolu passait de 0,01 % à 5 %. */
    const m = sobelMagnitudes(grid(96, 96, (x, y) => noise(x, y)), 96, 96)

    expect(shareAbove(m, thresholdForRatio(m, 0.08))).toBeCloseTo(0.08, 2)
  })

  it('laisse passer plus d’encre quand on demande plus', () => {
    const m = sobelMagnitudes(grid(96, 96, noise), 96, 96)

    expect(thresholdForRatio(m, 0.3)).toBeLessThan(thresholdForRatio(m, 0.05))
    expect(shareAbove(m, thresholdForRatio(m, 0.3)))
      .toBeGreaterThan(shareAbove(m, thresholdForRatio(m, 0.05)))
  })

  it('ne rend ni NaN ni division par zéro sur un aplat', () => {
    // Une photo d'un mur uni est une entrée parfaitement plausible.
    const m = sobelMagnitudes(grid(16, 16, () => 0.7), 16, 16)

    expect(thresholdForRatio(m, 0.08)).toBe(0)
  })

  it('rend 0 sur un tableau vide plutôt que undefined', () => {
    expect(thresholdForRatio(new Float32Array(0), 0.08)).toBe(0)
  })

  it('borne les ratios hors de 0-1', () => {
    const m = sobelMagnitudes(grid(32, 32, (x, y) => ((x + y) % 4) / 4), 32, 32)

    expect(thresholdForRatio(m, -1)).toBe(thresholdForRatio(m, 0))
    expect(thresholdForRatio(m, 2)).toBe(thresholdForRatio(m, 1))
  })
})

describe('edgeRamp', () => {
  it('place la borne d’opacité pleine à l’intérieur de la distribution', () => {
    /* La régression : la rampe valait `seuil + 0,08`, une largeur constante dans les
       mêmes fausses unités que l'ancien seuil. Sur une photographie dont le 99ᵉ
       centile vaut 0,14, l'opacité pleine n'était jamais atteinte et le calque
       paraissait vide — alors que le seuil, lui, était juste. */
    const m = sobelMagnitudes(grid(96, 96, (x, y) => 0.5 + 0.02 * noise(x, y)), 96, 96)
    const { start, full } = edgeRamp(m, 0.08)
    const max = m[m.length - 1]!

    expect(full).toBeGreaterThan(start)
    expect(full).toBeLessThan(max)
    // La largeur suit l'échelle de l'image, elle n'est pas constante.
    expect(full - start).toBeLessThan(0.08)
  })

  it('encre pleinement environ un quart de la quantité demandée', () => {
    const m = sobelMagnitudes(grid(96, 96, noise), 96, 96)
    const { full } = edgeRamp(m, 0.08)

    expect(shareAbove(m, full)).toBeCloseTo(0.02, 2)
  })

  it('sépare toujours les deux bornes, même sur un aplat', () => {
    // `smoothstep(a, a, x)` divise par zéro dans le shader : les bornes confondues
    // sont le cas qu'il ne faut jamais lui transmettre.
    const { start, full } = edgeRamp(sobelMagnitudes(grid(16, 16, () => 0.7), 16, 16), 0.08)

    expect(full).toBeGreaterThan(start)
  })

  it('ne rend pas de NaN sur une distribution vide', () => {
    const { start, full } = edgeRamp(new Float32Array(0), 0.08)

    expect(Number.isFinite(start)).toBe(true)
    expect(Number.isFinite(full)).toBe(true)
  })

  it('descend les deux bornes quand on demande plus de trait', () => {
    const m = sobelMagnitudes(grid(96, 96, noise), 96, 96)
    const peu = edgeRamp(m, 0.03)
    const beaucoup = edgeRamp(m, 0.2)

    expect(beaucoup.start).toBeLessThan(peu.start)
    expect(beaucoup.full).toBeLessThan(peu.full)
  })
})
