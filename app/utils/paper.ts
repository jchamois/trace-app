/**
 * La feuille comme unité de mesure.
 *
 * Une fois les quatre poignées posées sur les coins du papier, le carré unité de
 * `homography.ts` **est** la feuille. Déclarer son format suffit alors à convertir
 * n'importe quelle mesure de l'écran en centimètres réels — c'est ce qui permet
 * d'annoncer « ce visage fera 12 cm » et de le tenir.
 */
import type { Quad } from './homography'
import type { Size } from './imageImport'

/** Position de l'image sur la feuille, en fractions de feuille (0 → 1). */
export interface Placement { x: number, y: number, w: number, h: number }

export interface PaperSize { w: number, h: number }

/**
 * Dimensions réelles du sujet, en centimètres.
 *
 * Sans taille cible, l'image est inscrite dans la feuille (« contain ») : c'est le
 * plus grand tracé possible sans débordement. Avec une taille cible, c'est la
 * largeur demandée qui fait foi et le ratio est conservé.
 *
 * Volontairement **non plafonné** à la feuille : décalquer un sujet plus grand que
 * la page, en deux passes en déplaçant le papier, est un usage légitime. Plafonner
 * afficherait des centimètres faux plutôt que d'empêcher quoi que ce soit.
 */
export const subjectSizeCm = (
  paper: PaperSize,
  imageSize: Size,
  targetWidthCm: number | null,
): PaperSize => {
  const ratio = imageSize.w / imageSize.h

  if (targetWidthCm !== null) {
    return { w: targetWidthCm, h: targetWidthCm / ratio }
  }

  const w = Math.min(paper.w, paper.h * ratio)

  return { w, h: w / ratio }
}

/** Où poser l'image sur la feuille : centrée, en fractions de feuille. */
export const placementOf = (paper: PaperSize, subject: PaperSize): Placement => {
  const w = subject.w / paper.w
  const h = subject.h / paper.h

  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

/** Les quatre coins de l'image dans l'espace normalisé de la feuille. */
export const placementQuad = ({ x, y, w, h }: Placement): Quad => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

/**
 * Formate une longueur pour l'affichage : une décimale, virgule décimale.
 *
 * Une décimale et pas deux : le millimètre est la limite de ce qu'on trace au
 * crayon à main levée, afficher des dixièmes de millimètre serait une précision
 * que ni le geste ni le calage ne portent.
 */
export const formatCm = (value: number): string =>
  value.toFixed(1).replace('.', ',')
