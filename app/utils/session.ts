/**
 * Le modèle d'un tracé. Partagé par la persistance, l'archive et le rendu — il n'y
 * a qu'une définition, et c'est ici.
 */
import type { Pt } from './homography'

export type PaperFormat = 'A3' | 'A4' | 'A5' | 'notebook' | 'free'
export type RenderMode = 'photo' | 'edges' | 'posterize'
export type AlignMode = 'simple' | 'quad'

export interface RenderParams {
  /** 0 → 1. Le calque doit laisser voir la feuille : jamais 1 par défaut. */
  opacity: number
  contrast: number
  gamma: number
  /**
   * Part de l'image à encrer en rendu « Contours », de 0 à 1 — **et non un seuil**.
   *
   * La magnitude d'un gradient ne se compare pas d'une image à l'autre : mesuré sur
   * le même shader, un seuil de 0,38 encrait 0,01 % d'une photographie et 5,16 %
   * d'un dessin au trait. La proportion, elle, est stable ; le seuil absolu s'en
   * déduit par le quantile de l'image ouverte (`utils/edgeStats.ts`).
   */
  inkRatio: number
  /** Nombre de paliers en rendu « Aplats ». */
  levels: number
}

export interface TraceSession {
  id: string
  name: string
  createdAt: number
  updatedAt: number

  /** La photo, telle qu'importée après redimensionnement. Ne quitte pas l'appareil. */
  image: Blob
  thumb: Blob

  /**
   * Les quatre coins de la feuille, **normalisés** sur le viewport caméra.
   * `null` tant que le tracé n'a jamais été calé.
   *
   * On stocke les coins et jamais la matrice : la matrice se dérive en un calcul,
   * alors qu'exprimée en pixels écran elle deviendrait fausse à la première
   * rotation portrait ↔ paysage, au premier changement de définition du flux ou au
   * premier redimensionnement.
   *
   * `null` plutôt qu'un rectangle arbitraire posé à la création : le calage par
   * défaut dépend des **proportions du viewport**, qu'on ne connaît qu'une fois
   * l'écran de travail monté. Un défaut calculé trop tôt donnerait une feuille
   * déformée, et l'image avec elle.
   */
  corners: [Pt, Pt, Pt, Pt] | null
  mode: AlignMode

  paperFormat: PaperFormat
  /** Dérivé du format, sauf en « Libre » où l'utilisateur le saisit. */
  paperSizeCm: { w: number, h: number }
  /** Largeur voulue du sujet sur le papier ; `null` = l'image remplit la feuille. */
  targetWidthCm: number | null

  render: RenderMode
  params: RenderParams
  invert: boolean
  strokeColor: string
}

/** Format, en centimètres. Le carnet vise un A5 à l'italienne courant. */
export const PAPER_SIZES: Record<Exclude<PaperFormat, 'free'>, { w: number, h: number }> = {
  A3: { w: 29.7, h: 42 },
  A4: { w: 21, h: 29.7 },
  A5: { w: 14.8, h: 21 },
  notebook: { w: 21, h: 14.8 },
}

export const PAPER_LABELS: Record<PaperFormat, string> = {
  A3: 'A3',
  A4: 'A4',
  A5: 'A5',
  notebook: 'Carnet',
  free: 'Libre',
}

/** Les quatre couleurs du handoff. Le blanc sert sur papier sombre. */
export const STROKE_COLORS = ['#111114', '#FFFFFF', '#6E56F8', '#3B82F6'] as const

export const DEFAULT_PARAMS: RenderParams = {
  opacity: 0.42,
  contrast: 0,
  gamma: 1,
  // 8 % : assez de trait pour décalquer un visage ou une architecture, assez peu
  // pour que le grain de la photo ne remonte pas en semis de points.
  inkRatio: 0.08,
  levels: 4,
}

/** Part du viewport occupée par la feuille par défaut, sur son côté contraignant. */
const DEFAULT_FILL = 0.84

/**
 * Le calage par défaut : un rectangle centré **aux proportions réelles de la
 * feuille**, inscrit dans le viewport.
 *
 * Le viewport est indispensable au calcul, et c'est le piège de cette fonction :
 * les coins sont normalisés, mais l'écran ne l'est pas. Un rectangle de 0,68 × 0,80
 * en unités normalisées mesure 265 × 675 pixels sur un écran 390 × 844 — un rapport
 * de 0,39 quand un A4 vaut 0,71. L'image héritait de cette déformation et
 * s'affichait étirée en hauteur jusqu'à ce qu'on pose les poignées à la main.
 */
export const defaultCorners = (
  paperRatio: number,
  viewport: { w: number, h: number },
): [Pt, Pt, Pt, Pt] => {
  let width = viewport.w * DEFAULT_FILL
  let height = width / paperRatio

  // Feuille portrait sur écran portrait : c'est la hauteur qui contraint.
  if (height > viewport.h * DEFAULT_FILL) {
    height = viewport.h * DEFAULT_FILL
    width = height * paperRatio
  }

  const halfW = width / viewport.w / 2
  const halfH = height / viewport.h / 2

  return [
    { x: 0.5 - halfW, y: 0.5 - halfH },
    { x: 0.5 + halfW, y: 0.5 - halfH },
    { x: 0.5 + halfW, y: 0.5 + halfH },
    { x: 0.5 - halfW, y: 0.5 + halfH },
  ]
}

export const createSession = (
  { id, name, image, thumb }: { id: string, name: string, image: Blob, thumb: Blob },
): TraceSession => {
  const paperSizeCm = PAPER_SIZES.A4
  const now = Date.now()

  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    image,
    thumb,
    // Calé au premier montage de l'écran de travail, quand le viewport est connu.
    corners: null,
    mode: 'simple',
    paperFormat: 'A4',
    paperSizeCm,
    targetWidthCm: null,
    render: 'edges',
    params: { ...DEFAULT_PARAMS },
    invert: false,
    strokeColor: STROKE_COLORS[0],
  }
}
