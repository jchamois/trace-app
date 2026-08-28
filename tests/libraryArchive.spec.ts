import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  ArchiveError,
  archiveName,
  exportLibrary,
  FORMAT_VERSION,
  mergeSessions,
  parseManifest,
  readArchive,
} from '~/utils/libraryArchive'
import type { TraceSession } from '~/utils/session'
import { createSession } from '~/utils/session'

const blob = (text: string, type: string) => new Blob([text], { type })

const session = (id: string, updatedAt: number, name = id): TraceSession => ({
  ...createSession({
    id,
    name,
    image: blob(`image-${id}`, 'image/webp'),
    thumb: blob(`thumb-${id}`, 'image/webp'),
  }),
  updatedAt,
})

const manifestOf = (sessions: unknown[]) => ({
  formatVersion: FORMAT_VERSION,
  exportedAt: 1_700_000_000_000,
  sessions,
})

/** Un tracé sérialisé complet et valide, dont chaque test dégrade un champ. */
const serialized = (over: Record<string, unknown> = {}) => {
  const { image, thumb, ...fields } = session('a', 10, 'Portrait Louise')

  return { ...fields, imageType: 'image/webp', thumbType: 'image/webp', ...over }
}

describe('parseManifest', () => {
  it('accepte un manifeste conforme', () => {
    const parsed = parseManifest(manifestOf([serialized()]))

    expect(parsed.formatVersion).toBe(FORMAT_VERSION)
    expect(parsed.sessions).toHaveLength(1)
  })

  it('refuse un format plus récent en disant quoi faire', () => {
    expect(() => parseManifest(manifestOf([]) && { ...manifestOf([]), formatVersion: 99 }))
      .toThrow(/version plus récente/)
  })

  it('refuse un format inconnu', () => {
    expect(() => parseManifest({ ...manifestOf([]), formatVersion: 0 }))
      .toThrow(ArchiveError)
  })

  it('refuse un manifeste qui n’est pas un objet', () => {
    expect(() => parseManifest('nope')).toThrow(/n’est pas un objet/)
    expect(() => parseManifest(null)).toThrow(ArchiveError)
  })

  it('refuse une liste de tracés absente', () => {
    expect(() => parseManifest({ formatVersion: 1, exportedAt: 1 })).toThrow(/liste des tracés/)
  })

  it('nomme le champ fautif quand un tracé est incomplet', () => {
    expect(() => parseManifest(manifestOf([serialized({ id: undefined })])))
      .toThrow(/\bid\b/)
  })

  it('refuse un calage qui n’a pas quatre coins', () => {
    // Trois poignées ne définissent pas d'homographie : le rendu serait faux.
    expect(() => parseManifest(manifestOf([serialized({ corners: [{ x: 0, y: 0 }] })])))
      .toThrow(/corners/)
  })

  it('refuse un calage dont les coins ne sont pas des points', () => {
    // `[null, null, null, null]` passait l'ancien contrôle de longueur, puis
    // `c.x` levait dans un `computed` au premier rendu.
    expect(() => parseManifest(manifestOf([serialized({ corners: [null, null, null, null] })])))
      .toThrow(/corners/)
  })

  it('accepte un tracé jamais calé', () => {
    // Importé puis jamais ouvert : le calage dépend des proportions de l'écran, il
    // n'existe pas encore.
    expect(() => parseManifest(manifestOf([serialized({ corners: null })]))).not.toThrow()
  })

  it('refuse un tracé sans réglages', () => {
    /* La régression de sécurité : `"params": null` passait le cast, atterrissait en
       IndexedDB, et faisait lever un TypeError à chaque chargement de la
       bibliothèque — vide pour toujours, sans recours depuis l'interface. */
    expect(() => parseManifest(manifestOf([serialized({ params: null })])))
      .toThrow(/params/)
  })

  it('refuse un réglage hors bornes', () => {
    // Un `levels` non numérique atteignait `gl.uniform1f` et noircissait le calque.
    expect(() => parseManifest(manifestOf([serialized({ params: { ...serialized().params, levels: 'beaucoup' } })])))
      .toThrow(/levels/)
  })

  it('refuse des dimensions de feuille invalides', () => {
    expect(() => parseManifest(manifestOf([serialized({ paperSizeCm: null })])))
      .toThrow(/paperSizeCm/)
  })

  it('refuse un type MIME hors liste blanche', () => {
    /* Le type déclaré devient celui d'un `Blob` exposé en URL `blob:` de notre
       origine. `text/html` y créerait un document same-origin, et notre CSP porte
       `script-src 'unsafe-inline'`. */
    expect(() => parseManifest(manifestOf([serialized({ imageType: 'text/html' })])))
      .toThrow(/type d’image/)
    expect(() => parseManifest(manifestOf([serialized({ thumbType: 'image/svg+xml' })])))
      .toThrow(/type d’image/)
  })

  it('refuse une archive qui déclare trop de tracés', () => {
    const many = Array.from({ length: 501 }, (_, i) => serialized({ id: `s${i}` }))

    expect(() => parseManifest(manifestOf(many))).toThrow(/limite/)
  })
})

describe('mergeSessions', () => {
  it('ajoute ce qui manque', () => {
    const result = mergeSessions([session('a', 10)], [session('b', 20)])

    expect(result.added).toBe(1)
    expect(result.sessions.map(s => s.id)).toEqual(['b', 'a'])
  })

  it('remplace une version plus ancienne', () => {
    const result = mergeSessions([session('a', 10, 'ancien')], [session('a', 20, 'récent')])

    expect(result.updated).toBe(1)
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0]!.name).toBe('récent')
  })

  it('conserve la version locale si elle est plus récente', () => {
    /* Restaurer une vieille sauvegarde ne doit pas écraser un tracé qu'on vient de
       faire avancer sur cet appareil. */
    const result = mergeSessions([session('a', 30, 'local')], [session('a', 20, 'archive')])

    expect(result.kept).toBe(1)
    expect(result.updated).toBe(0)
    expect(result.sessions[0]!.name).toBe('local')
  })

  it('ne duplique rien quand la même archive est réimportée', () => {
    const existing = [session('a', 10), session('b', 20)]
    const once = mergeSessions(existing, existing)
    const twice = mergeSessions(once.sessions, existing)

    expect(twice.sessions).toHaveLength(2)
    expect(twice.added).toBe(0)
    expect(twice.updated).toBe(0)
    // Rien à réécrire : un second import ne doit toucher aucune ligne d'IndexedDB.
    expect(twice.write).toEqual([])
  })

  it('ne désigne à réécrire que ce qui a réellement changé', () => {
    const result = mergeSessions(
      [session('a', 30, 'local'), session('b', 10)],
      [session('a', 20, 'archive'), session('b', 40), session('c', 50)],
    )

    // « a » est plus récent en local, il ne doit pas être réécrit.
    expect(result.write.map(s => s.id).sort()).toEqual(['b', 'c'])
  })

  it('trie du plus récent au plus ancien', () => {
    const result = mergeSessions([], [session('a', 10), session('c', 30), session('b', 20)])

    expect(result.sessions.map(s => s.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('aller-retour export → import', () => {
  it('restitue les sessions, images et calage compris', async () => {
    const original = [session('a', 10, 'Portrait Louise'), session('b', 20, 'Chat endormi')]

    const restored = await readArchive(await exportLibrary(original))

    expect(restored.map(s => s.id).sort()).toEqual(['a', 'b'])

    const louise = restored.find(s => s.id === 'a')!
    expect(louise.name).toBe('Portrait Louise')
    expect(louise.corners).toEqual(original[0]!.corners)
    expect(louise.paperFormat).toBe('A4')
    expect(await louise.image.text()).toBe('image-a')
    expect(louise.image.type).toBe('image/webp')
  })

  it('refuse un fichier qui n’est pas une archive', async () => {
    await expect(readArchive(blob('ceci est un texte', 'text/plain')))
      .rejects.toThrow(/n’est pas une archive/)
  })

  it('refuse une archive dont l’image d’un tracé manque', async () => {
    /* Un manifeste qui déclare un tracé dont le fichier image n'est pas dans
       l'archive : c'est ce que produit une archive tronquée, ou recomposée à la
       main. Le ZIP se décompresse, et pourtant il manque l'essentiel. */
    const bytes = zipSync({
      'library.json': new TextEncoder().encode(JSON.stringify(manifestOf([
        serialized({ imageType: 'image/webp', thumbType: 'image/webp' }),
      ]))),
      'thumbs/a.webp': new TextEncoder().encode('thumb-a'),
    })

    await expect(readArchive(new Blob([bytes as BlobPart])))
      .rejects.toThrow(/est absente/)
  })

  it('refuse une archive sans manifeste', async () => {
    const bytes = zipSync({ 'images/a.webp': new TextEncoder().encode('image-a') })

    await expect(readArchive(new Blob([bytes as BlobPart])))
      .rejects.toThrow(/manifeste est absent/)
  })
})

describe('archiveName', () => {
  it('date le fichier pour que les sauvegardes cohabitent', () => {
    expect(archiveName(new Date(2026, 7, 28))).toBe('trace-app-2026-08-28.zip')
  })
})
