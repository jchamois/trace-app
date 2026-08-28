/**
 * Normalise une photo à l'import : décodage, redimensionnement, vignette.
 *
 * Le redimensionnement n'est pas une économie de place, c'est une contrainte de
 * rendu : une photo de téléphone fait 4000 px de large pour un écran qui en affiche
 * 1200, et la texture WebGL coûte `w × h × 4` octets en VRAM quelle que soit la
 * compression du fichier. Au-delà du plafond on paie de la mémoire pour des détails
 * que l'écran ne montrera jamais.
 */

/** Côté long maximal, en pixels. Couvre le plus dense des écrans visés. */
export const MAX_EDGE = 2000

/** Largeur de la vignette de bibliothèque, au ratio d'une feuille. */
const THUMB_W = 420
const THUMB_RATIO = 1 / 1.414

export interface Size { w: number, h: number }

/**
 * Réduit pour tenir dans `max` sur le côté long, **sans jamais agrandir** : une
 * photo déjà petite doit rester telle quelle, l'agrandir n'inventerait que du flou.
 */
export const fitWithin = ({ w, h }: Size, max: number): Size => {
  const factor = Math.min(1, max / Math.max(w, h))

  return {
    w: Math.max(1, Math.round(w * factor)),
    h: Math.max(1, Math.round(h * factor)),
  }
}

/**
 * Cadrage « cover » : la boîte est remplie, le débordement est rogné au centre.
 * Rend le rectangle **source** à découper dans l'image d'origine.
 */
export const coverCrop = (source: Size, box: Size): { x: number, y: number } & Size => {
  const scale = Math.max(box.w / source.w, box.h / source.h)
  const w = box.w / scale
  const h = box.h / scale

  return { x: (source.w - w) / 2, y: (source.h - h) / 2, w, h }
}

/* Safari a longtemps ignoré `image/webp` dans `toBlob` en produisant **un PNG**
   sans le signaler — ce qui, sur une photo de 2000 px, quadruple le poids en
   silence. On encode donc, puis on vérifie ce qu'on a réellement obtenu. */
const encode = async (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => {
  const attempt = (type: string) =>
    new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))

  const webp = await attempt('image/webp')
  if (webp?.type === 'image/webp') return webp

  const jpeg = await attempt('image/jpeg')
  if (!jpeg) throw new Error('Encodage de l’image impossible.')

  return jpeg
}

const draw = (bitmap: ImageBitmap, size: Size, crop?: { x: number, y: number } & Size) => {
  const canvas = document.createElement('canvas')
  canvas.width = size.w
  canvas.height = size.h

  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'

  if (crop) ctx.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, size.w, size.h)
  else ctx.drawImage(bitmap, 0, 0, size.w, size.h)

  return canvas
}

export interface ImportedImage {
  image: Blob
  thumb: Blob
  size: Size
}

/**
 * `File` → couple (image normalisée, vignette). La qualité de l'image principale
 * est haute — 0,92 — parce qu'elle passe ensuite dans un détecteur de contours :
 * les artefacts de blocs d'une compression basse produiraient de faux traits.
 */
export const importImage = async (file: File): Promise<ImportedImage> => {
  const bitmap = await createImageBitmap(file)

  try {
    const size = fitWithin({ w: bitmap.width, h: bitmap.height }, MAX_EDGE)
    const thumbSize = { w: THUMB_W, h: Math.round(THUMB_W / THUMB_RATIO) }

    const [image, thumb] = await Promise.all([
      encode(draw(bitmap, size), 0.92),
      encode(draw(bitmap, thumbSize, coverCrop({ w: bitmap.width, h: bitmap.height }, thumbSize)), 0.8),
    ])

    return { image, thumb, size }
  }
  finally {
    // Sans ça, la mémoire du bitmap décodé — plusieurs dizaines de Mo pour une
    // photo de téléphone — n'est libérée qu'au bon vouloir du ramasse-miettes.
    bitmap.close()
  }
}
