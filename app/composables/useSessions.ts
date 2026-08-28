import type { DBSchema, IDBPDatabase } from 'idb'
import { openDB } from 'idb'
import type { TraceSession } from '~/utils/session'

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
  refresh: () => Promise<void>
  get: (id: string) => Promise<TraceSession | undefined>
  put: (session: TraceSession) => Promise<void>
  putSoon: (session: TraceSession) => void
  remove: (id: string) => Promise<void>
  flush: () => Promise<void>
}

export const useSessions = (): Sessions => {
  const list = useState<TraceSession[]>('sessions', () => [])
  const loading = useState('sessions-loading', () => false)

  const refresh = async () => {
    loading.value = true
    try {
      const all = await (await db()).getAllFromIndex('sessions', 'by-updated')
      list.value = all.reverse()
    }
    finally {
      loading.value = false
    }
  }

  const get = async (id: string) => (await db()).get('sessions', id)

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
   */
  const put = async (session: TraceSession) => {
    await (await db()).put('sessions', { ...toRaw(session), updatedAt: Date.now() })
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

  const remove = async (id: string) => {
    await (await db()).delete('sessions', id)
    list.value = list.value.filter(s => s.id !== id)
  }

  /* Sans ça, quitter l'écran de travail pendant la fenêtre de 400 ms perdrait le
     dernier calage — c'est-à-dire précisément celui que l'utilisateur venait
     d'ajuster avant de sortir. */
  onScopeDispose(() => void flush())

  return { list, loading, refresh, get, put, putSoon, remove, flush }
}
