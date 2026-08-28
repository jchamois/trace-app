/**
 * Appelle `onResume` chaque fois que l'application revient au premier plan.
 *
 * **Deux événements, et il en faut bien deux.** `visibilitychange` ne se déclenche
 * que si l'onglet devient réellement caché — changer d'onglet, réduire la fenêtre.
 * Passer à une autre application puis revenir le laisse « visible » et ne déclenche
 * rien : c'est `focus` qui rattrape ce cas, et c'est le geste le plus courant sur
 * une PWA installée.
 *
 * Cette connaissance vivait dans `AppUpdateBanner` seul. L'accueil, qui relit
 * l'heure et la date au réveil, n'écoutait que `visibilitychange` — il ratait donc
 * précisément le geste que son propre commentaire invoque (« une PWA installée reste
 * ouverte des jours »), et « Bonjour » restait affiché le soir.
 *
 * Les écoutes sont posées dans `onMounted` — seul moment où `document` et `window`
 * existent à coup sûr — et retirées par le `signal` d'un unique `AbortController`,
 * déclaré au niveau du composable pour que sa libération ne dépende pas du montage.
 */
export const useAppResume = (onResume: () => void): void => {
  const listeners = new AbortController()

  onMounted(() => {
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'visible') onResume()
      },
      // Pas de `passive` : il ne vaut que pour `touch*`, `wheel` et `scroll`, et
      // n'aurait rien changé ici qu'une déclaration trompeuse.
      { signal: listeners.signal },
    )

    // Pas de garde de visibilité : `focus` ne part que sur une fenêtre au premier plan.
    window.addEventListener('focus', onResume, { signal: listeners.signal })
  })

  onScopeDispose(() => listeners.abort())
}
