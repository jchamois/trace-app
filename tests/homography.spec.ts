import { describe, expect, it } from 'vitest'
import type { Mat3, Pt, Quad } from '~/utils/homography'
import {
  applyToPoint,
  composeSimple,
  invert,
  isDegenerate,
  solveHomography,
  toMatrix3d,
  UNIT_SQUARE,
} from '~/utils/homography'

/** Tolérance : la résolution passe par une élimination de Gauss en flottants. */
const EPS = 1e-9

const expectPointClose = (actual: Pt, expected: Pt) => {
  expect(actual.x).toBeCloseTo(expected.x, 9)
  expect(actual.y).toBeCloseTo(expected.y, 9)
}

const quad = (...pts: [number, number][]): Quad =>
  pts.map(([x, y]) => ({ x, y })) as unknown as Quad

describe('solveHomography', () => {
  it('rend l’identité quand source et cible coïncident', () => {
    const h = solveHomography(UNIT_SQUARE, UNIT_SQUARE)

    for (const pt of [{ x: 0.3, y: 0.7 }, { x: 0, y: 0 }, { x: 1, y: 1 }]) {
      expectPointClose(applyToPoint(h, pt), pt)
    }
  })

  it('résout une mise à l’échelle et une translation', () => {
    const h = solveHomography(UNIT_SQUARE, quad([10, 20], [110, 20], [110, 220], [10, 220]))

    expectPointClose(applyToPoint(h, { x: 0, y: 0 }), { x: 10, y: 20 })
    expectPointClose(applyToPoint(h, { x: 1, y: 1 }), { x: 110, y: 220 })
    // Une transformation affine conserve les milieux — ce n'est plus vrai dès
    // qu'il y a de la perspective, d'où le test dédié ci-dessous.
    expectPointClose(applyToPoint(h, { x: 0.5, y: 0.5 }), { x: 60, y: 120 })
  })

  it('fait correspondre exactement les quatre coins d’un trapèze', () => {
    // Une feuille vue de biais : le bord du fond est plus court que celui du bas.
    const paper = quad([120, 80], [280, 80], [340, 300], [60, 300])
    const h = solveHomography(UNIT_SQUARE, paper)

    UNIT_SQUARE.forEach((corner, i) => {
      expectPointClose(applyToPoint(h, corner), paper[i]!)
    })
  })

  it('ne conserve pas les milieux sous perspective — le centre fuit vers le fond', () => {
    const paper = quad([120, 80], [280, 80], [340, 300], [60, 300])
    const h = solveHomography(UNIT_SQUARE, paper)

    const center = applyToPoint(h, { x: 0.5, y: 0.5 })
    const centroidY = (80 + 80 + 300 + 300) / 4

    /* C'est tout l'intérêt de l'homographie face à un simple `scale` : le centre de
       la feuille se projette **au-dessus** du centre du quadrilatère, parce que la
       moitié éloignée occupe moins de pixels. Un test qui l'ignorerait passerait
       aussi avec une transformation affine. */
    expect(center.y).toBeLessThan(centroidY)
  })

  it('lève sur un quadrilatère dégénéré plutôt que de rendre une matrice fausse', () => {
    const flat = quad([0, 0], [10, 0], [20, 0], [30, 0])

    expect(() => solveHomography(UNIT_SQUARE, flat)).toThrow(/dégénéré/)
  })
})

describe('invert', () => {
  it('fait l’aller-retour sur des points quelconques', () => {
    const h = solveHomography(UNIT_SQUARE, quad([120, 80], [280, 80], [340, 300], [60, 300]))
    const back = invert(h)

    for (const pt of [{ x: 0.2, y: 0.1 }, { x: 0.87, y: 0.64 }, { x: 0.5, y: 0.5 }]) {
      expectPointClose(applyToPoint(back, applyToPoint(h, pt)), pt)
    }
  })

  it('ramène un point écran dans l’espace normalisé de la feuille', () => {
    const paper = quad([120, 80], [280, 80], [340, 300], [60, 300])
    const back = invert(solveHomography(UNIT_SQUARE, paper))

    // Le coin bas-droit de la feuille est le coin (1,1) de l'espace normalisé :
    // c'est ce calcul qui sert au test de survol des poignées.
    expectPointClose(applyToPoint(back, paper[2]!), { x: 1, y: 1 })
  })
})

describe('isDegenerate', () => {
  it('accepte un quadrilatère convexe, y compris fortement incliné', () => {
    expect(isDegenerate(UNIT_SQUARE)).toBe(false)
    expect(isDegenerate(quad([120, 80], [280, 80], [340, 300], [60, 300]))).toBe(false)
  })

  it('rejette un quadrilatère croisé', () => {
    // Deux coins échangés : c'est ce que produit une poignée traînée à travers la
    // feuille, et le rendu correspondant est un repliement illisible.
    expect(isDegenerate(quad([0, 0], [100, 0], [0, 100], [100, 100]))).toBe(true)
  })

  it('rejette un quadrilatère aplati ou réduit à un point', () => {
    expect(isDegenerate(quad([0, 0], [10, 0], [20, 0], [30, 0]))).toBe(true)
    expect(isDegenerate(quad([5, 5], [5, 5], [5, 5], [5, 5]))).toBe(true)
  })

  it('rejette un quadrilatère concave', () => {
    // Un coin rentrant : la surface reste non nulle, seul le test de convexité
    // l'attrape. Le rendu s'y replierait sur lui-même.
    expect(isDegenerate(quad([0, 0], [100, 0], [10, 10], [0, 100]))).toBe(true)
  })
})

describe('composeSimple', () => {
  it('rend l’identité sans paramètres', () => {
    const h = composeSimple({ tx: 0, ty: 0, scale: 1, rotation: 0 })

    expectPointClose(applyToPoint(h, { x: 3, y: 4 }), { x: 3, y: 4 })
  })

  it('applique la rotation autour de l’origine, puis l’échelle, puis la translation', () => {
    const h = composeSimple({ tx: 10, ty: 0, scale: 2, rotation: Math.PI / 2 })

    // (1,0) → rotation +90° → (0,1) → ×2 → (0,2) → +(10,0) → (10,2)
    expectPointClose(applyToPoint(h, { x: 1, y: 0 }), { x: 10, y: 2 })
  })

  it('coïncide avec solveHomography sur le quadrilatère qu’elle produit', () => {
    /* Le mode simple et le calage 4 coins doivent partager un seul chemin de rendu :
       ce test est ce qui le garantit. Si les deux divergeaient, basculer d'un mode à
       l'autre déplacerait l'image. */
    const simple = composeSimple({ tx: 40, ty: -15, scale: 1.7, rotation: 0.4 })
    const projected = UNIT_SQUARE.map(pt => applyToPoint(simple, pt)) as unknown as Quad
    const solved = solveHomography(UNIT_SQUARE, projected)

    for (const pt of [{ x: 0.25, y: 0.8 }, { x: 0.9, y: 0.1 }]) {
      expectPointClose(applyToPoint(solved, pt), applyToPoint(simple, pt))
    }
  })
})

describe('toMatrix3d', () => {
  it('sérialise une translation en colonne-major CSS', () => {
    const h: Mat3 = [1, 0, 12, 0, 1, 34, 0, 0, 1]

    // matrix3d(col1, col2, col3, col4) — la translation vit dans la 4e colonne.
    expect(toMatrix3d(h)).toBe('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 12, 34, 0, 1)')
  })

  it('place les termes de perspective en 4e ligne', () => {
    const h = solveHomography(UNIT_SQUARE, quad([120, 80], [280, 80], [340, 300], [60, 300]))
    const parts = toMatrix3d(h).slice('matrix3d('.length, -1).split(', ').map(Number)

    // m14 et m24 (indices 3 et 7) portent g et h : non nuls dès qu'il y a fuite.
    expect(Math.abs(parts[3]!) + Math.abs(parts[7]!)).toBeGreaterThan(EPS)
    // m44 est normalisé à 1 par la résolution.
    expect(parts[15]).toBeCloseTo(1, 9)
  })
})
