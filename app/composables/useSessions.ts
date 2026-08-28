import type { DBSchema, IDBPDatabase } from 'idb'
import { openDB } from 'idb'
import type { TraceSession } from '~/utils/session'
import { collectSession } from '~/utils/session'

interface TraceDB extends DBSchema {
  sessions: {
    key: string
    value: TraceSession
    indexes: { 'by-updated': number }
  }
}

const DB_NAME = 'trace-app'
const DB_VERSION = 1

/* Une seule connexion pour toute l'application, ouverte à la demande. La rouvrir
   par composant multiplierait les connexions et bloquerait les futures migrations :
   une mise à niveau attend la fermeture de toutes les connexions ouvertes. */
let dbPromise: Promise<IDBPDatabase<TraceDB>> | null = null

const db = () => {
  dbPromise ??= openDB<TraceDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      const store = database.createObjectStore('sessions', { keyPath: 'id' })
      // La bibliothèque affiche les tracés du plus récent au plus ancien : sans
      // index, il faudrait tout charger — images comprises — pour les trier.
      store.createIndex('by-updated', 'updatedAt')
    },
  })

  return dbPromise
}

/** Laisse le geste respirer : un pincement émet des dizaines d'événements. */
const WRITE_DEBOUNCE_MS = 400

export interface Sessions {
  list: Ref<TraceSession[]>
  loading: Ref<boolean>
  /** Message si la base est illisible — distinct d'une bibliothèque vide. */
  error: Ref<string | null>
  refresh: () => Promise<void>
  get: (id: string) => Promise<TraceSession | undefined>
  /** `touch: false` conserve l'`updatedAt` fourni — cf. la restauration d'archive. */
  put: (session: TraceSession, options?: { touch?: boolean }) => Promise<void>
  putSoon: (session: TraceSession) => void
  flush: () => Promise<void>
}

export const useSessions = (): Sessions => {
  const list = useState<TraceSession[]>('sessions', () => [])
  const loading = useState('sessions-loading', () => false)

  /** Renseigné quand la base est illisible : la bibliothèque doit le dire. */
  const error = ref<string | null>(null)

  const refresh = async () => {
    loading.value = true
    error.value = null

    try {
      const all = await (await db()).getAllFromIndex('sessions', 'by-updated')
      list.value = all.map(repair).filter(Boolean).reverse() as TraceSession[]
    }
    catch {
      /* Un `catch` et pas seulement un `finally` : sans lui, une base illisible
         laissait `list` inchangée et la bibliothèque affichait « aucun tracé »
         pour toujours, sans distinguer « vide » de « cassé ». */
      error.value = 'Impossible de lire la bibliothèque sur cet appareil.'
    }
    finally {
      loading.value = false
    }
  }

  /**
   * IndexedDB est une frontière, au même titre qu'une archive — mais une frontière
   * **honnête** : ce qu'on y lit a été écrit par une version antérieure de notre
   * propre code, pas par un tiers. La politique est donc la réparation silencieuse,
   * là où l'archive rejette (`libraryArchive.parseManifest`). Les deux partagent
   * `collectSession`, qui connaît le schéma et ne décide de rien.
   *
   * Ne peut plus lever. C'est le point : `normalize` déréférençait `session.params`
   * sans garde, `refresh` n'a pas de `catch`, et un seul enregistrement au `params`
   * absent rendait la bibliothèque définitivement vide — sans recours depuis
   * l'interface, puisque le tracé fautif ne pouvait alors être ni ouvert ni
   * supprimé.
   */
  const repair = (session: TraceSession | undefined): TraceSession | undefined => {
    if (!session) return undefined

    const { value } = collectSession(session)

    // Les blobs ne passent pas par le schéma : `collectSession` ne les voit pas.
    return { ...value, id: session.id, image: session.image, thumb: session.thumb }
  }

  const get = async (id: string) => repair(await (await db()).get('sessions', id))

  /**
   * `toRaw` n'est pas une précaution : sans lui **rien ne s'enregistre**.
   *
   * Les sessions viennent d'un `ref`, donc leurs tableaux imbriqués — `corners` au
   * premier chef — sont des `Proxy`. L'algorithme de clonage structuré d'IndexedDB
   * inspecte les emplacements internes : un `Proxy` sur un tableau n'en est pas un
   * à ses yeux, et la transaction meurt sur
   * « DataCloneError: [object Array] could not be cloned ».
   *
   * `toRaw` rend la cible d'origine, dont les propriétés imbriquées sont les objets
   * bruts — les proxies enfants ne naissent qu'à la lecture *à travers* le parent.
   * Un seul appel suffit donc pour tout l'arbre.
   *
   * Les `Blob` traversent intacts : Vue ne rend réactifs que les objets simples,
   * les tableaux et les collections, et laisse le reste tel quel.
   *
   * **`touch: false`** pour une restauration : sans lui, `put` détruisait la
   * décision que `mergeSessions` venait de prendre. La fusion arbitre sur
   * `updatedAt` — « ne jamais écraser un tracé plus récent, ne pas dupliquer à la
   * réimportation » — et redater systématiquement à `Date.now()` effaçait
   * l'horodatage d'origine : la bibliothèque remontait tous les tracés restaurés en
   * tête, et la politique n'était correcte qu'au **premier** import.
   */
  const put = async (session: TraceSession, { touch = true } = {}) => {
    const raw = toRaw(session)
    await (await db()).put('sessions', touch ? { ...raw, updatedAt: Date.now() } : { ...raw })
  }

  /* L'écriture différée porte sur l'écran de travail : chaque déplacement de
     poignée mute la session, et une écriture IndexedDB par événement de pointeur
     ferait saccader le geste. Le dernier état gagne — c'est exactement la sémantique
     voulue pour un calage en cours. */
  let pendingTimer: ReturnType<typeof setTimeout> | null = null
  let pendingSession: TraceSession | null = null

  const flush = async () => {
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      pendingTimer = null
    }
    if (!pendingSession) return

    const session = pendingSession
    pendingSession = null
    await put(session)
  }

  const putSoon = (session: TraceSession) => {
    pendingSession = session
    if (pendingTimer) return

    pendingTimer = setTimeout(() => {
      pendingTimer = null
      void flush()
    }, WRITE_DEBOUNCE_MS)
  }

  /* Sans ça, quitter l'écran de travail pendant la fenêtre de 400 ms perdrait le
     dernier calage — c'est-à-dire précisément celui que l'utilisateur venait
     d'ajuster avant de sortir. */
  onScopeDispose(() => void flush())

  return { list, loading, error, refresh, get, put, putSoon, flush }
}
