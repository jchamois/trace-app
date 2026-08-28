import { describe, expect, it } from 'vitest'
import { collectSession, createSession, DEFAULT_PARAMS, PAPER_SIZES, STROKE_COLORS } from '~/utils/session'

/**
 * `collectSession` est la connaissance du schéma partagée par les deux frontières :
 * l'archive ZIP, qui **rejette** dès qu'un écart est signalé, et IndexedDB, qui
 * **accepte la valeur réparée**. Elle ne lève jamais — c'est ce qui permet aux deux
 * politiques opposées de la partager.
 */

const blob = new Blob(['x'], { type: 'image/webp' })
const valid = () => {
  const { image, thumb, ...fields } = createSession({ id: 'a', name: 'Louise', image: blob, thumb: blob })

  return fields
}

const fieldsOf = (raw: unknown) => collectSession(raw).issues.map(i => i.field)

describe('collectSession — session valide', () => {
  it('ne signale aucun écart et rend la session à l’identique', () => {
    const input = valid()
    const { value, issues } = collectSession(input)

    expect(issues).toEqual([])
    expect(value).toEqual(input)
  })

  it('accepte un calage absent', () => {
    expect(collectSession({ ...valid(), corners: null }).issues).toEqual([])
  })

  it('accepte un calage à quatre points finis', () => {
    const corners = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]

    expect(collectSession({ ...valid(), corners }).issues).toEqual([])
  })
})

describe('collectSession — réparation', () => {
  it('ne lève jamais, quelle que soit l’entrée', () => {
    for (const raw of [null, undefined, 42, 'texte', [], {}]) {
      expect(() => collectSession(raw)).not.toThrow()
    }
  })

  it('rend une session complète à partir de rien', () => {
    const { value } = collectSession({})

    expect(value.params).toEqual(DEFAULT_PARAMS)
    expect(value.render).toBe('edges')
    expect(value.corners).toBeNull()
    expect(value.strokeColor).toBe(STROKE_COLORS[0])
    expect(Number.isFinite(value.updatedAt)).toBe(true)
  })

  it('répare des réglages absents plutôt que de déréférencer', () => {
    /* La régression de sécurité : `params: null` faisait lever un TypeError à
       chaque chargement de la bibliothèque, définitivement vide. */
    const { value, issues } = collectSession({ ...valid(), params: null })

    expect(value.params).toEqual(DEFAULT_PARAMS)
    expect(fieldsOf({ ...valid(), params: null })).toContain('params')
    expect(issues.length).toBeGreaterThan(0)
  })

  it('borne les réglages hors plage — un NaN atteindrait gl.uniform1f', () => {
    const params = { ...DEFAULT_PARAMS, gamma: 999, levels: Number.NaN, opacity: -3 }
    const { value } = collectSession({ ...valid(), params })

    expect(value.params.gamma).toBe(DEFAULT_PARAMS.gamma)
    expect(value.params.levels).toBe(DEFAULT_PARAMS.levels)
    expect(value.params.opacity).toBe(DEFAULT_PARAMS.opacity)
  })

  it('ramène un calage douteux à null plutôt qu’à des valeurs arbitraires', () => {
    // `null` veut dire « à recaler » : l'écran de travail le repose à partir des
    // proportions du viewport. Inventer des coins produirait une image de travers.
    for (const corners of [[null, null, null, null], [1, 2, 3, 4], ['a'], {}, [{ x: 0, y: 'nord' }]]) {
      expect(collectSession({ ...valid(), corners }).value.corners).toBeNull()
    }
  })

  it('fait suivre le repli de dimensions au format déclaré', () => {
    const { value } = collectSession({ ...valid(), paperFormat: 'A3', paperSizeCm: null })

    expect(value.paperSizeCm).toEqual(PAPER_SIZES.A3)
  })

  it('rejette une couleur de trait qui n’est pas un hex', () => {
    for (const strokeColor of ['javascript:alert(1)', '#ff', 42, null, 'red']) {
      expect(collectSession({ ...valid(), strokeColor }).value.strokeColor).toBe(STROKE_COLORS[0])
    }
  })

  it('rejette un mode ou un rendu inconnu', () => {
    expect(collectSession({ ...valid(), render: 'constructor' }).value.render).toBe('edges')
    expect(collectSession({ ...valid(), mode: '__proto__' }).value.mode).toBe('simple')
    expect(collectSession({ ...valid(), paperFormat: 'toString' }).value.paperFormat).toBe('A4')
  })

  it('nomme précisément le champ fautif', () => {
    expect(fieldsOf({ ...valid(), name: 42 })).toContain('name')
    expect(fieldsOf({ ...valid(), invert: 'oui' })).toContain('invert')
    expect(fieldsOf({ ...valid(), params: { ...DEFAULT_PARAMS, gamma: 'clair' } })).toContain('params.gamma')
  })
})
