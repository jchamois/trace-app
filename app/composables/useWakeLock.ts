/**
 * Empêche l'écran de s'éteindre pendant une séance.
 *
 * Sans ce verrou l'application est inutilisable : on dessine sur le papier sans
 * toucher l'écran, donc rien ne réinitialise le délai de veille du système, et
 * l'écran s'éteint au bout d'une minute — en emportant le calage de l'œil.
 */

export interface WakeLock {
  /** Le verrou est-il effectivement tenu à cet instant ? */
  active: Ref<boolean>
  /** L'API existe-t-elle sur cette plateforme ? */
  supported: Ref<boolean>
  request: () => Promise<void>
  release: () => Promise<void>
}

export const useWakeLock = (): WakeLock => {
  const active = ref(false)
  const supported = ref(false)

  let sentinel: WakeLockSentinel | null = null
  /** Ce que l'appelant veut, indépendamment de ce que le système accorde. */
  let wanted = false

  const request = async () => {
    wanted = true
    if (!supported.value || sentinel) return

    try {
      sentinel = await navigator.wakeLock.request('screen')
      active.value = true

      /* Le système relâche le verrou de lui-même dès que la page passe en
         arrière-plan, et il n'est **pas** rendu au retour. Sans cette écoute, le
         premier appel téléphonique reçu laisserait l'écran s'éteindre pour le
         reste de la séance. */
      sentinel.addEventListener('release', () => {
        sentinel = null
        active.value = false
      }, { once: true })
    }
    catch {
      /* Refusé par le système : batterie faible, ou économiseur d'énergie. Ce
         n'est pas une erreur à remonter — l'application reste utilisable, l'écran
         s'éteindra simplement plus tôt. */
      active.value = false
    }
  }

  const release = async () => {
    wanted = false
    if (!sentinel) return

    await sentinel.release().catch(() => {})
    sentinel = null
    active.value = false
  }

  onMounted(() => {
    supported.value = 'wakeLock' in navigator
  })

  // Le retour au premier plan est le seul moment où reprendre le verrou perdu.
  useAppResume(() => {
    if (wanted && !sentinel) void request()
  })

  onScopeDispose(() => void release())

  return { active, supported, request, release }
}
