import { describe, expect, it } from 'vitest'
import { formatCm, placementOf, placementQuad, subjectSizeCm } from '~/utils/paper'
import { PAPER_SIZES } from '~/utils/session'

const A4 = PAPER_SIZES.A4

describe('subjectSizeCm', () => {
  it('inscrit une image paysage dans la largeur de la feuille', () => {
    // 4:3 sur A4 portrait : c'est la largeur (21 cm) qui limite.
    const subject = subjectSizeCm(A4, { w: 4000, h: 3000 }, null)

    expect(subject.w).toBeCloseTo(21, 6)
    expect(subject.h).toBeCloseTo(15.75, 6)
  })

  it('inscrit une image très allongée dans la hauteur de la feuille', () => {
    // 1:2 sur A4 portrait : cette fois c'est la hauteur (29,7 cm) qui limite, et
    // c'est le cas que raterait un calcul basé sur la seule largeur.
    const subject = subjectSizeCm(A4, { w: 1000, h: 2000 }, null)

    expect(subject.h).toBeCloseTo(29.7, 6)
    expect(subject.w).toBeCloseTo(14.85, 6)
  })

  it('respecte la taille cible et conserve le ratio', () => {
    const subject = subjectSizeCm(A4, { w: 4000, h: 3000 }, 12)

    expect(subject.w).toBe(12)
    expect(subject.h).toBeCloseTo(9, 6)
  })

  it('ne plafonne pas une taille cible plus grande que la feuille', () => {
    /* Décalquer un sujet plus grand que la page, en deux passes, est un usage
       légitime. Plafonner ici afficherait des centimètres faux. */
    const subject = subjectSizeCm(A4, { w: 1000, h: 1000 }, 40)

    expect(subject.w).toBe(40)
    expect(subject.h).toBe(40)
  })
})

describe('placementOf', () => {
  it('centre l’image et rend des fractions de feuille', () => {
    const placement = placementOf(A4, { w: 10.5, h: 14.85 })

    expect(placement.w).toBeCloseTo(0.5, 6)
    expect(placement.h).toBeCloseTo(0.5, 6)
    expect(placement.x).toBeCloseTo(0.25, 6)
    expect(placement.y).toBeCloseTo(0.25, 6)
  })

  it('rend le carré unité quand le sujet remplit la feuille', () => {
    expect(placementOf(A4, A4)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
})

describe('placementQuad', () => {
  it('rend les coins dans le sens horaire depuis le haut-gauche', () => {
    const quad = placementQuad({ x: 0.25, y: 0.1, w: 0.5, h: 0.8 })

    expect(quad).toEqual([
      { x: 0.25, y: 0.1 },
      { x: 0.75, y: 0.1 },
      { x: 0.75, y: 0.9 },
      { x: 0.25, y: 0.9 },
    ])
  })
})

describe('formatCm', () => {
  it('affiche une décimale avec une virgule', () => {
    expect(formatCm(18.44)).toBe('18,4')
    expect(formatCm(21)).toBe('21,0')
  })
})
