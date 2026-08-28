import { describe, expect, it } from 'vitest'
import { createSession, defaultCorners, PAPER_SIZES } from '~/utils/session'

const A4_RATIO = PAPER_SIZES.A4.w / PAPER_SIZES.A4.h

/** Rend les dimensions en pixels du rectangle décrit par des coins normalisés. */
const pixelBox = (corners: { x: number, y: number }[], viewport: { w: number, h: number }) => ({
  w: (corners[1]!.x - corners[0]!.x) * viewport.w,
  h: (corners[2]!.y - corners[1]!.y) * viewport.h,
})

describe('defaultCorners', () => {
  it('respecte les proportions réelles de la feuille sur un écran portrait', () => {
    /* La régression que ce test verrouille : les coins sont normalisés, l'écran ne
       l'est pas. Un rectangle « carré » en unités normalisées est un rectangle
       étiré en pixels, et l'image héritait de la déformation. */
    const viewport = { w: 390, h: 844 }
    const box = pixelBox(defaultCorners(A4_RATIO, viewport), viewport)

    expect(box.w / box.h).toBeCloseTo(A4_RATIO, 6)
  })

  it('respecte les proportions sur un écran paysage', () => {
    const viewport = { w: 844, h: 390 }
    const box = pixelBox(defaultCorners(A4_RATIO, viewport), viewport)

    expect(box.w / box.h).toBeCloseTo(A4_RATIO, 6)
  })

  it('contraint par la hauteur quand la feuille est plus étroite que l’écran', () => {
    // A4 portrait dans un viewport portrait : c'est la hauteur qui limite.
    const viewport = { w: 390, h: 844 }
    const box = pixelBox(defaultCorners(A4_RATIO, viewport), viewport)

    expect(box.h).toBeLessThanOrEqual(844 * 0.84 + 1e-9)
    expect(box.w).toBeLessThanOrEqual(390 * 0.84 + 1e-9)
  })

  it('contraint par la largeur quand la feuille est plus large que l’écran', () => {
    // Feuille très large sur écran presque carré.
    const viewport = { w: 400, h: 400 }
    const box = pixelBox(defaultCorners(3, viewport), viewport)

    expect(box.w).toBeCloseTo(400 * 0.84, 6)
    expect(box.w / box.h).toBeCloseTo(3, 6)
  })

  it('reste centré', () => {
    const corners = defaultCorners(A4_RATIO, { w: 390, h: 844 })

    expect((corners[0].x + corners[1].x) / 2).toBeCloseTo(0.5, 9)
    expect((corners[0].y + corners[2].y) / 2).toBeCloseTo(0.5, 9)
  })
})

describe('createSession', () => {
  it('ne pose aucun calage : il dépend d’un viewport encore inconnu', () => {
    const blob = new Blob(['x'], { type: 'image/webp' })
    const session = createSession({ id: 'a', name: 'Test', image: blob, thumb: blob })

    expect(session.corners).toBeNull()
  })

  it('démarre en rendu contours — le seul qui laisse voir le papier', () => {
    const blob = new Blob(['x'], { type: 'image/webp' })
    const session = createSession({ id: 'a', name: 'Test', image: blob, thumb: blob })

    expect(session.render).toBe('edges')
    expect(session.params.opacity).toBeLessThan(1)
  })
})
