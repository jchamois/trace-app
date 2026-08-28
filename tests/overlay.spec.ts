import { describe, expect, it } from 'vitest'
import type { Corners } from '~/utils/overlay'
import { placeOverlay } from '~/utils/overlay'
import { PAPER_SIZES } from '~/utils/session'

/**
 * La chaîne géométrique complète n'avait aucun test : elle vivait dans un
 * `computed` fermé sur des props, à l'intérieur d'un composant, donc inatteignable
 * sans montage. Les deux défauts qu'elle a portés — un calage par défaut aux
 * mauvaises proportions et une boîte CSS rabotée par le reset global — n'étaient
 * visibles qu'au navigateur.
 */

const VIEWPORT = { w: 390, h: 844 }
const IMAGE = { w: 1200, h: 900 }
const A4 = PAPER_SIZES.A4

/** Rectangle centré au ratio d'un A4, comme le pose `defaultCorners`. */
const centredA4 = (): Corners => {
  const width = VIEWPORT.w * 0.84
  const height = width / (A4.w / A4.h)
  const halfW = width / VIEWPORT.w / 2
  const halfH = height / VIEWPORT.h / 2

  return [
    { x: 0.5 - halfW, y: 0.5 - halfH },
    { x: 0.5 + halfW, y: 0.5 - halfH },
    { x: 0.5 + halfW, y: 0.5 + halfH },
    { x: 0.5 - halfW, y: 0.5 + halfH },
  ]
}

const base = {
  corners: centredA4(),
  viewport: VIEWPORT,
  paperSizeCm: A4,
  targetWidthCm: null,
  imageSize: IMAGE,
}

/** Extrait les seize coefficients d'une chaîne `matrix3d(...)`. */
const cells = (matrix: string) =>
  matrix.slice('matrix3d('.length, -1).split(', ').map(Number)

describe('placeOverlay — entrées incomplètes', () => {
  it('rend null tant qu’un tracé n’est pas calé', () => {
    expect(placeOverlay({ ...base, corners: null })).toBeNull()
  })

  it('rend null tant que le conteneur n’est pas mesuré', () => {
    expect(placeOverlay({ ...base, viewport: { w: 0, h: 0 } })).toBeNull()
  })

  it('rend null tant que la photo n’est pas décodée', () => {
    // `imageSize` part à {0,0} : sans cette garde, la division par zéro produisait
    // une matrice de NaN que le navigateur ignore en silence.
    expect(placeOverlay({ ...base, imageSize: { w: 0, h: 0 } })).toBeNull()
  })
})

describe('placeOverlay — la boîte CSS', () => {
  it('vaut exactement la définition de l’image', () => {
    /* L'invariant structurel : l'homographie envoie `0,0 → imageSize` sur le
       quadrilatère de l'écran. Il était affirmé dans deux fichiers qui ne
       s'accordaient que par hasard ; il vient maintenant du même calcul que la
       matrice. */
    expect(placeOverlay(base)!.cssSize).toEqual(IMAGE)
  })

  it('suit la définition, quelle qu’elle soit', () => {
    const imageSize = { w: 640, h: 1136 }

    expect(placeOverlay({ ...base, imageSize })!.cssSize).toEqual(imageSize)
  })
})

describe('placeOverlay — la matrice', () => {
  it('place l’image pleine largeur de feuille, centrée verticalement', () => {
    // Image 4:3 sur A4 portrait : c'est la largeur de la feuille qui limite.
    const paperW = VIEWPORT.w * 0.84
    const [scaleX, , , , , scaleY, , , , , , , tx, ty] = cells(placeOverlay(base)!.matrix)

    expect(scaleX! * IMAGE.w).toBeCloseTo(paperW, 6)
    expect(scaleY! * IMAGE.h).toBeCloseTo(paperW / (IMAGE.w / IMAGE.h), 6)
    // Centrée horizontalement dans le viewport.
    expect(tx! + (scaleX! * IMAGE.w) / 2).toBeCloseTo(VIEWPORT.w / 2, 6)
    expect(ty! + (scaleY! * IMAGE.h) / 2).toBeCloseTo(VIEWPORT.h / 2, 6)
  })

  it('conserve le ratio de l’image sur un calage rectangulaire', () => {
    // La régression du calage par défaut : un rectangle « carré » en unités
    // normalisées est étiré en pixels, et l'image héritait de la déformation.
    const [scaleX, , , , , scaleY] = cells(placeOverlay(base)!.matrix)

    expect(scaleX).toBeCloseTo(scaleY!, 9)
  })

  it('ne produit aucune fuite sur un calage rectangulaire', () => {
    // m14 et m24 portent les termes homogènes : nuls sans perspective.
    const c = cells(placeOverlay(base)!.matrix)

    expect(c[3]).toBeCloseTo(0, 12)
    expect(c[7]).toBeCloseTo(0, 12)
  })

  it('produit une fuite dès que le quadrilatère est déformé', () => {
    const skewed = [...base.corners] as unknown as Corners
    const c = cells(placeOverlay({
      ...base,
      corners: [{ x: 0.2, y: 0.2 }, skewed[1], skewed[2], skewed[3]] as unknown as Corners,
    })!.matrix)

    expect(Math.abs(c[3]!) + Math.abs(c[7]!)).toBeGreaterThan(1e-9)
  })

  it('rétrécit l’image quand une taille cible plus petite est demandée', () => {
    const full = cells(placeOverlay(base)!.matrix)[0]!
    // Le sujet fait 21 cm en automatique ; on demande la moitié.
    const half = cells(placeOverlay({ ...base, targetWidthCm: 10.5 })!.matrix)[0]!

    expect(half).toBeCloseTo(full / 2, 6)
  })

  it('rend la même taille écran en automatique quel que soit le format', () => {
    // Sans taille cible, l'image s'inscrit dans la feuille — et le quadrilatère de
    // l'écran, lui, ne bouge pas. Une image 4:3 remplit la largeur d'un A4 comme
    // d'un A3, donc elle occupe le même nombre de pixels.
    const a4 = cells(placeOverlay(base)!.matrix)[0]!
    const a3 = cells(placeOverlay({ ...base, paperSizeCm: PAPER_SIZES.A3 })!.matrix)[0]!

    expect(a3).toBeCloseTo(a4, 6)
  })

  it('interprète la taille cible dans le format déclaré', () => {
    /* Là, le format compte : 10,5 cm valent la moitié d'un A4 mais un tiers d'un
       A3. C'est ce qui rend la calibration papier utile — annoncer « ce visage
       fera 12 cm » n'a de sens que rapporté à la feuille réelle. */
    const onA4 = cells(placeOverlay({ ...base, targetWidthCm: 10.5 })!.matrix)[0]!
    const onA3 = cells(placeOverlay({
      ...base,
      paperSizeCm: PAPER_SIZES.A3,
      targetWidthCm: 10.5,
    })!.matrix)[0]!

    expect(onA3 / onA4).toBeCloseTo(PAPER_SIZES.A4.w / PAPER_SIZES.A3.w, 6)
  })
})
