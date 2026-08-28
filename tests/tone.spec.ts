import { describe, expect, it } from 'vitest'
import { applyTone, gradeTone, LUMA_COEFFS, lumaFrom, TONE_GLSL } from '~/utils/tone'

/**
 * La chaîne tonale existe en deux exemplaires — un en TypeScript pour la
 * calibration, un en GLSL pour le rendu — et c'est leur désaccord qui a produit
 * quatre bugs de calque successifs.
 *
 * Ces tests verrouillent la version TypeScript. L'accord des deux se vérifie dans
 * `tests/toneParity.spec.ts`, qui compile réellement le GLSL.
 */

const NEUTRAL = { contrast: 0, gamma: 1, invert: false }

describe('lumaFrom', () => {
  it('applique les coefficients Rec. 709 et ramène en 0-1', () => {
    expect(lumaFrom(new Uint8ClampedArray([255, 0, 0, 255]))[0]).toBeCloseTo(LUMA_COEFFS[0], 6)
    expect(lumaFrom(new Uint8ClampedArray([0, 255, 0, 255]))[0]).toBeCloseTo(LUMA_COEFFS[1], 6)
    expect(lumaFrom(new Uint8ClampedArray([0, 0, 255, 255]))[0]).toBeCloseTo(LUMA_COEFFS[2], 6)
  })

  it('rend 1 sur du blanc et 0 sur du noir', () => {
    const gray = lumaFrom(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))

    expect(gray[0]).toBeCloseTo(1, 6)
    expect(gray[1]).toBeCloseTo(0, 6)
  })

  it('ignore le canal alpha', () => {
    // Une image à alpha nul garde sa luminance : c'est le RGB qu'on mesure.
    expect(lumaFrom(new Uint8ClampedArray([255, 255, 255, 0]))[0]).toBeCloseTo(1, 6)
  })
})

describe('gradeTone', () => {
  it('est l’identité aux valeurs neutres', () => {
    /* C'est **pour cette raison** que le bug a survécu : aux réglages par défaut,
       mesurer le brut ou l'étalonné donne le même résultat. Le désaccord
       n'apparaissait qu'en poussant un curseur. */
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      expect(gradeTone(v, NEUTRAL)).toBeCloseTo(v, 6)
    }
  })

  it('étire les écarts autour du milieu quand le contraste monte', () => {
    const p = { ...NEUTRAL, contrast: 1 }

    expect(gradeTone(0.5, p)).toBeCloseTo(0.5, 6)
    expect(gradeTone(0.6, p)).toBeCloseTo(0.7, 6)
    expect(gradeTone(0.4, p)).toBeCloseTo(0.3, 6)
  })

  it('éclaircit les tons moyens quand le gamma monte', () => {
    expect(gradeTone(0.25, { ...NEUTRAL, gamma: 2 })).toBeGreaterThan(0.25)
    expect(gradeTone(0.25, { ...NEUTRAL, gamma: 0.5 })).toBeLessThan(0.25)
  })

  it('inverse en dernier', () => {
    // L'ordre compte : inverser avant le contraste ne donnerait pas le complément.
    const p = { contrast: 0.8, gamma: 1.4, invert: false }

    expect(gradeTone(0.3, { ...p, invert: true })).toBeCloseTo(1 - gradeTone(0.3, p), 6)
  })

  it('reste borné à 0-1 quels que soient les réglages extrêmes', () => {
    for (const contrast of [-0.9, 0, 2]) {
      for (const gamma of [0.3, 1, 3]) {
        for (const v of [-1, 0, 0.5, 1, 2]) {
          const out = gradeTone(v, { contrast, gamma, invert: false })

          expect(out).toBeGreaterThanOrEqual(0)
          expect(out).toBeLessThanOrEqual(1)
          expect(Number.isNaN(out)).toBe(false)
        }
      }
    }
  })
})

describe('applyTone', () => {
  it('applique gradeTone terme à terme sans muter l’entrée', () => {
    const raw = Float32Array.from([0, 0.3, 0.7, 1])
    // Copie de référence, et non des littéraux : un `Float32Array` arrondit, donc
    // 0,3 y vaut 0,30000001192092896.
    const before = [...raw]
    const p = { contrast: 0.5, gamma: 1.2, invert: false }
    const out = applyTone(raw, p)

    expect([...raw]).toEqual(before)
    out.forEach((v, i) => expect(v).toBeCloseTo(gradeTone(raw[i]!, p), 6))
  })
})

describe('TONE_GLSL', () => {
  it('reprend les coefficients de luminance de la version TypeScript', () => {
    // Interpolés depuis LUMA_COEFFS : ils ne peuvent pas diverger par recopie.
    for (const c of LUMA_COEFFS) expect(TONE_GLSL).toContain(String(c))
  })

  it('déclare les trois fonctions que le shader appelle', () => {
    for (const fn of ['float luma(', 'float gradeTone(', 'vec3 gradeColor(']) {
      expect(TONE_GLSL).toContain(fn)
    }
  })
})
