/**
 * Sauvegarde et restauration, sans compte.
 *
 * Le besoin est de ne pas perdre sa bibliothèque en changeant de téléphone. Un
 * fichier le couvre : pas d'authentification, pas de quota, pas de résolution de
 * conflit entre deux appareils. L'archive porte aussi les calages et les réglages,
 * donc elle restaure des tracés **en cours**, pas seulement des photos.
 *
 * C'est le **seul point de l'application où une donnée vient de l'extérieur** —
 * et donc le seul où une validation est justifiée. Tout ce qui entre est suspect
 * jusqu'à preuve du contraire.
 */
import { unzip, zip } from 'fflate'
import type { SessionFields, TraceSession } from './session'
import { collectSession } from './session'

/**
 * Types acceptés à l'import. Le type déclaré dans le manifeste devient celui d'un
 * `Blob` exposé en URL `blob:` de notre origine — il ne peut pas être arbitraire.
 */
const ALLOWED_IMAGE_TYPES = ['image/webp', 'image/png', 'image/jpeg']

/**
 * Plafonds de lecture. `fflate` n'en applique aucun : une archive de 10 ko peut
 * se décompresser en gigaoctets et faire tomber l'onglet, et rien ne borne le
 * nombre de tracés déclarés. Auto-infligé — l'utilisateur choisit le fichier —
 * mais deux comparaisons valent mieux qu'un onglet mort.
 */
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
const MAX_SESSIONS = 500

/**
 * Sans ce numéro dès la première version, la première évolution du schéma rendrait
 * illisibles toutes les archives déjà produites, sans même pouvoir le dire.
 */
export const FORMAT_VERSION = 1

const MANIFEST = 'library.json'

/** Erreur destinée à être affichée telle quelle : les messages sont des copies. */
export class ArchiveError extends Error {}

/** Une session sans ses blobs : ce qui tient dans le manifeste JSON. */
export type SerializedSession = SessionFields & {
  imageType: string
  thumbType: string
}

export interface Manifest {
  formatVersion: number
  exportedAt: number
  sessions: SerializedSession[]
}

export interface MergeResult {
  sessions: TraceSession[]
  /**
   * Les seules à réécrire. La politique de fusion vit ici et nulle part ailleurs :
   * l'appelant persiste ce qu'on lui donne, il ne re-décide rien.
   */
  write: TraceSession[]
  added: number
  updated: number
  /** Déjà présentes dans une version au moins aussi récente. */
  kept: number
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const requireNumber = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ArchiveError(`Archive illisible : le champ « ${field} » est absent ou invalide.`)
  }

  return v
}

const requireString = (v: unknown, field: string): string => {
  if (typeof v !== 'string' || !v) {
    throw new ArchiveError(`Archive illisible : le champ « ${field} » est absent ou invalide.`)
  }

  return v
}

/**
 * Valide le manifeste. Pur, donc vérifiable — et c'est le point de l'exercice :
 * chaque forme de corruption doit produire une phrase, pas une exception brute.
 */
export const parseManifest = (data: unknown): Manifest => {
  if (!isObject(data)) throw new ArchiveError('Archive illisible : le manifeste n’est pas un objet.')

  const version = requireNumber(data.formatVersion, 'formatVersion')

  if (version > FORMAT_VERSION) {
    throw new ArchiveError(
      `Cette archive vient d’une version plus récente de trace-app (format ${version}). `
      + 'Mets l’application à jour, puis réessaie.',
    )
  }
  if (version < 1) throw new ArchiveError(`Format d’archive inconnu (${version}).`)

  if (!Array.isArray(data.sessions)) {
    throw new ArchiveError('Archive illisible : la liste des tracés est absente.')
  }

  if (data.sessions.length > MAX_SESSIONS) {
    throw new ArchiveError(
      `Cette archive déclare ${data.sessions.length} tracés, au-delà de la limite de ${MAX_SESSIONS}.`,
    )
  }

  const sessions = data.sessions.map((raw, index) => {
    /* Politique **stricte** : l'archive vient de l'extérieur, on refuse plutôt
       que de réparer. `collectSession` connaît le schéma, elle ne décide de rien —
       c'est ici qu'on choisit de lever, et dans `useSessions` qu'on choisit de
       réparer une donnée écrite par un build antérieur. Une seule connaissance,
       deux politiques. */
    const { value, issues } = collectSession(raw)

    if (issues.length) {
      const fields = issues.map(i => i.field).filter(Boolean).join(', ')
      throw new ArchiveError(
        `Archive illisible : le tracé n° ${index + 1} est invalide`
        + (fields ? ` (${fields}).` : '.'),
      )
    }

    const imageType = requireString(
      (raw as Record<string, unknown>).imageType,
      `sessions[${index}].imageType`,
    )
    const thumbType = requireString(
      (raw as Record<string, unknown>).thumbType,
      `sessions[${index}].thumbType`,
    )

    /* Liste blanche des types MIME, et pas seulement pour la forme : le type
       déclaré ici devient celui d'un `Blob` exposé en URL `blob:` **de notre
       origine**. Une archive annonçant `text/html` créerait un document
       same-origin — et notre CSP porte `script-src 'unsafe-inline'`. Aujourd'hui
       la seule destination est un `<img>`, qui n'exécute rien ; il suffirait d'un
       aperçu en grand pour que ça devienne du XSS stocké. */
    for (const [field, type] of [['imageType', imageType], ['thumbType', thumbType]] as const) {
      if (!ALLOWED_IMAGE_TYPES.includes(type)) {
        throw new ArchiveError(
          `Archive refusée : le tracé « ${value.name} » déclare un type d’image `
          + `non autorisé pour ${field} (${type}).`,
        )
      }
    }

    return { ...value, imageType, thumbType }
  })

  return { formatVersion: version, exportedAt: requireNumber(data.exportedAt, 'exportedAt'), sessions }
}

/**
 * Fusionne par `id`, **jamais en écrasant** : réimporter deux fois la même archive
 * ne doit rien dupliquer, et restaurer une vieille sauvegarde ne doit pas écraser
 * un tracé qu'on vient de faire avancer sur cet appareil.
 */
export const mergeSessions = (
  existing: readonly TraceSession[],
  incoming: readonly TraceSession[],
): MergeResult => {
  const byId = new Map(existing.map(s => [s.id, s]))
  const write: TraceSession[] = []
  let added = 0
  let updated = 0
  let kept = 0

  for (const session of incoming) {
    const current = byId.get(session.id)

    if (!current) {
      byId.set(session.id, session)
      write.push(session)
      added++
    }
    else if (session.updatedAt > current.updatedAt) {
      byId.set(session.id, session)
      write.push(session)
      updated++
    }
    else {
      kept++
    }
  }

  return {
    sessions: [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt),
    write,
    added,
    updated,
    kept,
  }
}

/** Extension déduite du type MIME — l'archive doit rester lisible à la main. */
const extensionFor = (type: string): string => {
  if (type === 'image/webp') return 'webp'
  if (type === 'image/png') return 'png'

  return 'jpg'
}

const zipAsync = (files: Record<string, [Uint8Array, { level: 0 | 6 }]>): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    zip(files, (error, data) => (error ? reject(error) : resolve(data)))
  })

const unzipAsync = (data: Uint8Array): Promise<Record<string, Uint8Array>> =>
  new Promise((resolve, reject) => {
    unzip(data, (error, files) => (error ? reject(error) : resolve(files)))
  })

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer())

export const exportLibrary = async (sessions: readonly TraceSession[]): Promise<Blob> => {
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {}
  const serialized: SerializedSession[] = []

  for (const session of sessions) {
    const { image, thumb, ...rest } = session
    const imageName = `images/${session.id}.${extensionFor(image.type)}`
    const thumbName = `thumbs/${session.id}.${extensionFor(thumb.type)}`

    /* `level: 0` sur les images : elles sont déjà en WebP ou JPEG, les recompresser
       coûterait plusieurs secondes de blocage pour quelques pour mille. Le manifeste,
       lui, est du JSON très répétitif et compresse bien. */
    files[imageName] = [await bytesOf(image), { level: 0 }]
    files[thumbName] = [await bytesOf(thumb), { level: 0 }]

    serialized.push({ ...rest, imageType: image.type, thumbType: thumb.type })
  }

  const manifest: Manifest = {
    formatVersion: FORMAT_VERSION,
    exportedAt: Date.now(),
    sessions: serialized,
  }

  files[MANIFEST] = [new TextEncoder().encode(JSON.stringify(manifest)), { level: 6 }]

  return new Blob([await zipAsync(files) as BlobPart], { type: 'application/zip' })
}

export const readArchive = async (file: Blob): Promise<TraceSession[]> => {
  /* Contrôle avant décompression : `unzipAsync` inflate **tout** en mémoire avant
     qu'on regarde quoi que ce soit. Le refus doit donc précéder la lecture, pas
     la suivre. */
  if (file.size > MAX_ARCHIVE_BYTES) {
    throw new ArchiveError(
      `Cette archive fait ${Math.round(file.size / 1024 / 1024)} Mo, `
      + `au-delà de la limite de ${MAX_ARCHIVE_BYTES / 1024 / 1024} Mo.`,
    )
  }

  let entries: Record<string, Uint8Array>

  try {
    entries = await unzipAsync(await bytesOf(file))
  }
  catch {
    throw new ArchiveError('Ce fichier n’est pas une archive trace-app valide.')
  }

  const raw = entries[MANIFEST]
  if (!raw) throw new ArchiveError('Archive incomplète : le manifeste est absent.')

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw))
  }
  catch {
    throw new ArchiveError('Archive illisible : le manifeste est corrompu.')
  }

  const manifest = parseManifest(parsed)

  return manifest.sessions.map(({ imageType, thumbType, ...rest }) => {
    const image = entries[`images/${rest.id}.${extensionFor(imageType)}`]
    const thumb = entries[`thumbs/${rest.id}.${extensionFor(thumbType)}`]

    if (!image || !thumb) {
      throw new ArchiveError(`Archive incomplète : l’image du tracé « ${rest.name} » est absente.`)
    }

    return {
      ...rest,
      image: new Blob([image as BlobPart], { type: imageType }),
      thumb: new Blob([thumb as BlobPart], { type: thumbType }),
    }
  })
}

/** Nom de fichier daté, pour que plusieurs sauvegardes cohabitent dans un dossier. */
export const archiveName = (at: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0')

  return `trace-app-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}.zip`
}
