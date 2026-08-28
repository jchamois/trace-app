/**
 * Le calage, en algèbre pure. Aucun DOM, aucune dépendance : c'est le seul module
 * du projet où une erreur est invisible à l'œil et fausse pourtant tout l'écran.
 *
 * Une **homographie** est la transformation qui envoie un plan sur un autre à
 * travers une projection centrale — exactement ce que fait une caméra qui regarde
 * une feuille de biais. Elle se représente par une matrice 3 × 3 appliquée à des
 * coordonnées homogènes, et c'est ce qui la distingue d'une transformation affine :
 * elle ne conserve ni les longueurs, ni les milieux, ni le parallélisme. Seul
 * l'alignement des points survit.
 *
 * Convention : `Mat3` est stockée **par lignes**, et le point transformé vaut
 * `((a x + b y + c) / w, (d x + e y + f) / w)` avec `w = g x + h y + i`.
 */

export interface Pt { x: number, y: number }

/** Quatre coins, dans l'ordre horaire depuis le coin haut-gauche. */
export type Quad = readonly [Pt, Pt, Pt, Pt]

export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
]

/** L'espace de référence : les coins de la feuille en coordonnées normalisées. */
export const UNIT_SQUARE: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

/* Seuil sur le **sinus** de l'angle à chaque coin, et non sur le produit vectoriel
   brut : le produit dépend de l'échelle (1 pour le carré unité, ~10⁴ en pixels),
   un seuil absolu serait donc juste à une échelle et faux à l'autre. */
const MIN_CORNER_SINE = 1e-6

const cross = (ox: number, oy: number, ax: number, ay: number): number => ox * ay - oy * ax

/**
 * Un quadrilatère est exploitable s'il est **strictement convexe** : c'est la
 * condition pour que l'homographie soit inversible et que le rendu ne se replie
 * pas sur lui-même.
 *
 * Trois cas sont rejetés, et ils correspondent à trois gestes réels : traîner une
 * poignée à travers la feuille (croisé), la traîner au-delà de la diagonale
 * opposée (concave), et rassembler les coins sur une ligne (aplati).
 */
export const isDegenerate = (q: Quad): boolean => {
  let sign = 0

  for (let i = 0; i < 4; i++) {
    const a = q[i]!
    const b = q[(i + 1) % 4]!
    const c = q[(i + 2) % 4]!

    const ux = b.x - a.x
    const uy = b.y - a.y
    const vx = c.x - b.x
    const vy = c.y - b.y

    const lengths = Math.hypot(ux, uy) * Math.hypot(vx, vy)
    // Deux coins confondus : longueur nulle, aucun angle à mesurer.
    if (lengths === 0) return true

    const sine = cross(ux, uy, vx, vy) / lengths
    if (Math.abs(sine) < MIN_CORNER_SINE) return true

    const current = sine > 0 ? 1 : -1
    if (sign === 0) sign = current
    // Un changement de sens de rotation en cours de parcours = concave ou croisé.
    else if (current !== sign) return true
  }

  return false
}

/**
 * Résout l'homographie qui envoie `src` sur `dst`.
 *
 * Huit inconnues (`i` est normalisé à 1), donc huit équations, donc exactement
 * quatre correspondances de points — ni plus ni moins. Chaque correspondance
 * `(x,y) → (u,v)` en fournit deux :
 *
 * ```
 * a·x + b·y + c − g·x·u − h·y·u = u
 * d·x + e·y + f − g·x·v − h·y·v = v
 * ```
 *
 * Résolution par élimination de Gauss avec pivot partiel. Le pivot partiel n'est
 * pas décoratif : sans lui, un quadrilatère dont un coin est à l'origine produit
 * un pivot nul en première colonne alors que le système est parfaitement soluble.
 */
export const solveHomography = (src: Quad, dst: Quad): Mat3 => {
  if (isDegenerate(src) || isDegenerate(dst)) {
    throw new Error('solveHomography : quadrilatère dégénéré (croisé, concave ou aplati).')
  }

  // Matrice augmentée 8 × 9.
  const m: number[][] = []

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!
    const { x: u, y: v } = dst[i]!

    m.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u])
    m.push([0, 0, 0, x, y, 1, -x * v, -y * v, v])
  }

  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row
    }

    if (m[pivot]![col] === 0) {
      throw new Error('solveHomography : système singulier.')
    }

    const swap = m[col]!
    m[col] = m[pivot]!
    m[pivot] = swap

    const lead = m[col]!
    const scale = lead[col]!
    for (let k = col; k < 9; k++) lead[k]! /= scale

    for (let row = 0; row < 8; row++) {
      if (row === col) continue
      const factor = m[row]![col]!
      if (factor === 0) continue
      for (let k = col; k < 9; k++) m[row]![k]! -= factor * lead[k]!
    }
  }

  return [
    m[0]![8]!, m[1]![8]!, m[2]![8]!,
    m[3]![8]!, m[4]![8]!, m[5]![8]!,
    m[6]![8]!, m[7]![8]!, 1,
  ]
}

export const applyToPoint = (h: Mat3, p: Pt): Pt => {
  const w = h[6] * p.x + h[7] * p.y + h[8]

  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  }
}

/**
 * Sérialise en `transform: matrix3d(…)`, à poser avec `transform-origin: 0 0`.
 *
 * CSS lit les seize valeurs **par colonnes**, et la composante homogène vit dans la
 * quatrième ligne — d'où l'entrelacement, qui n'est pas une coquille : la 3ᵉ colonne
 * est l'axe Z, laissé identité.
 *
 * Passer par le GPU en CSS plutôt que par un rendu WebGL par frame est ce qui
 * permet à l'écran de travail de ne consommer aucun temps CPU au repos, sur des
 * séances d'une heure.
 */
export const toMatrix3d = (h: Mat3): string => {
  const [a, b, c, d, e, f, g, i, j] = h

  const cells = [
    a, d, 0, g,
    b, e, 0, i,
    0, 0, 1, 0,
    c, f, 0, j,
  ]

  return `matrix3d(${cells.join(', ')})`
}
