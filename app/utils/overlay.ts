/**
 * La géométrie du calque, de bout en bout.
 *
 * Trois espaces de coordonnées se croisent ici, et ils portaient tous le même type
 * `Pt` : normalisé sur le viewport (ce qu'on persiste), normalisé sur la feuille
 * (où l'image est posée), et pixels de l'image (ce que le canvas mesure). La chaîne
 * était répartie sur trois fichiers avec **quatre `as unknown as Quad`** — le typage
 * signalant que l'abstraction ne collait pas — et l'invariant « la boîte CSS vaut la
 * définition de l'image » était affirmé à deux endroits qui ne s'accordaient que par
 * hasard.
 *
 * Les trois espaces sont désormais des types distincts, et la boîte CSS est **rendue
 * par la même fonction que la matrice** : ils ne peuvent plus diverger.
 */
import type { Mat3, Pt, Quad } from './homography'
import { applyToPoint, solveHomography, toMatrix3d, UNIT_SQUARE } from './homography'
import type { Size } from './imageImport'
import { placementOf, placementQuad, subjectSizeCm } from './paper'
import type { PaperSize } from './paper'

/**
 * Les trois espaces, nommés.
 *
 * Purement nominaux : ils ne changent rien à l'exécution, mais un mélange cesse de
 * compiler. C'est tout ce qu'on leur demande.
 */
export type ViewportPt = Pt & { readonly __space?: 'viewport' }
export type SheetPt = Pt & { readonly __space?: 'sheet' }
export type ScreenPt = Pt & { readonly __space?: 'screen' }

/** Les quatre coins de la feuille, normalisés sur le viewport. C'est ce qu'on persiste. */
export type Corners = [ViewportPt, ViewportPt, ViewportPt, ViewportPt]

export interface OverlayPlacement {
  /** À poser tel quel sur `transform`, avec `transform-origin: 0 0`. */
  matrix: string
  /**
   * Taille CSS que le canvas **doit** avoir.
   *
   * L'homographie envoie le rectangle `0,0 → imageSize` sur le quadrilatère de
   * l'écran : si la boîte CSS ne vaut pas exactement cette définition, le calque
   * s'affiche à la mauvaise échelle. Rendue ici pour que la matrice et la boîte
   * viennent du même calcul — auparavant, un reset global
   * (`canvas { max-inline-size: 100% }`) rabotait la boîte et le calque
   * s'affichait au tiers de sa taille.
   */
  cssSize: Size
}

export interface OverlayInput {
  corners: Corners | null
  /** Taille du conteneur, en pixels CSS. */
  viewport: Size
  paperSizeCm: PaperSize
  targetWidthCm: number | null
  /** Définition de la photo décodée. */
  imageSize: Size
}

/** Les coins de la feuille en pixels d'écran. */
const toScreen = (corners: Corners, viewport: Size): Quad =>
  corners.map(c => ({ x: c.x * viewport.w, y: c.y * viewport.h })) as unknown as Quad

const quadOf = (points: readonly Pt[]): Quad => points as unknown as Quad

const mapQuad = (h: Mat3, quad: Quad): Quad =>
  quadOf(quad.map(p => applyToPoint(h, p)))

/**
 * Compose la chaîne complète.
 *
 * Deux homographies et non une : la position de l'image **sur le papier** dépend du
 * format et de la taille cible, qui changent sans que le calage bouge.
 *
 * 1. carré unité → feuille à l'écran (le calage) ;
 * 2. rectangle de l'image sur la feuille → écran ;
 * 3. rectangle du canvas → ce quadrilatère.
 *
 * Rend `null` tant qu'une entrée manque — conteneur pas encore mesuré, photo pas
 * encore décodée, ou tracé jamais calé.
 */
export const placeOverlay = (
  { corners, viewport, paperSizeCm, targetWidthCm, imageSize }: OverlayInput,
): OverlayPlacement | null => {
  if (!corners || !viewport.w || !viewport.h || !imageSize.w || !imageSize.h) return null

  const sheetToScreen = solveHomography(UNIT_SQUARE, toScreen(corners, viewport))

  const subject = subjectSizeCm(paperSizeCm, imageSize, targetWidthCm)
  const onSheet = placementQuad(placementOf(paperSizeCm, subject))
  const onScreen = mapQuad(sheetToScreen, onSheet)

  const { w, h } = imageSize
  const canvasRect = quadOf([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }])

  return {
    matrix: toMatrix3d(solveHomography(canvasRect, onScreen)),
    cssSize: { w, h },
  }
}
