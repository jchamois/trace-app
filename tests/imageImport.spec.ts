import { describe, expect, it } from 'vitest'
import { coverCrop, fitWithin, MAX_EDGE } from '~/utils/imageImport'

describe('fitWithin', () => {
  it('plafonne le côté long et conserve le ratio', () => {
    const fitted = fitWithin({ w: 4032, h: 3024 }, MAX_EDGE)

    expect(fitted.w).toBe(MAX_EDGE)
    expect(fitted.w / fitted.h).toBeCloseTo(4032 / 3024, 2)
  })

  it('plafonne la hauteur sur une photo en portrait', () => {
    const fitted = fitWithin({ w: 3024, h: 4032 }, MAX_EDGE)

    expect(fitted.h).toBe(MAX_EDGE)
    expect(fitted.w).toBe(1500)
  })

  it('n’agrandit jamais une image déjà petite', () => {
    // Agrandir n'inventerait que du flou, et gonflerait la texture pour rien.
    expect(fitWithin({ w: 320, h: 240 }, MAX_EDGE)).toEqual({ w: 320, h: 240 })
  })

  it('ne descend jamais sous un pixel', () => {
    expect(fitWithin({ w: 4000, h: 3 }, 100)).toEqual({ w: 100, h: 1 })
  })
})

describe('coverCrop', () => {
  it('rogne les côtés d’une source plus large que la boîte', () => {
    const crop = coverCrop({ w: 2000, h: 1000 }, { w: 420, h: 594 })

    // La boîte est plus haute que large : c'est la largeur qui déborde.
    expect(crop.h).toBeCloseTo(1000, 6)
    expect(crop.w).toBeCloseTo(1000 * (420 / 594), 6)
    expect(crop.y).toBeCloseTo(0, 6)
    expect(crop.x).toBeGreaterThan(0)
  })

  it('centre le rognage', () => {
    const source = { w: 2000, h: 1000 }
    const crop = coverCrop(source, { w: 420, h: 594 })

    // Autant de retiré à gauche qu'à droite.
    expect(crop.x).toBeCloseTo(source.w - crop.w - crop.x, 6)
  })

  it('ne rogne rien quand les ratios coïncident', () => {
    const crop = coverCrop({ w: 840, h: 1188 }, { w: 420, h: 594 })

    expect(crop).toEqual({ x: 0, y: 0, w: 840, h: 1188 })
  })
})
