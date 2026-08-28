/**
 * Les décisions que le module PWA ne sait pas prendre.
 *
 * `@vite-pwa/nuxt` expose `$pwa.showInstallPrompt` dès que `client.installPrompt`
 * est activé, et c'est lui qui doit servir de source — pas un second capteur de
 * `beforeinstallprompt` écrit à la main : le premier des deux à consommer l'invite
 * prive l'autre de la sienne.
 *
 * Mais **`beforeinstallprompt` n'existe pas sur iOS Safari**, donc
 * `showInstallPrompt` y reste faux à jamais. Il n'y a pas d'invite à déclencher :
 * il faut reconnaître le navigateur et expliquer le geste.
 *
 * Toutes ces fonctions sont **paramétrées plutôt que lisant `window`** — c'est ce
 * qui les rend vérifiables, et c'est la raison d'être de ce fichier.
 * `useInstallPrompt` en est l'adaptateur : il lit `$pwa`, le cookie, `navigator` et
 * `location`, puis délègue ici.
 */

/**
 * iOS Safari, seul navigateur où installer se fait à la main.
 *
 * Deux subtilités, chacune verrouillée par un test :
 *
 * - **un iPad récent s'annonce comme un Mac.** `/iPad/` ne suffit donc plus ; le
 *   couple « Mac » + écran tactile le rattrape, un Mac de bureau n'ayant pas
 *   `ontouchend`.
 * - **Chrome, Firefox et Edge sur iOS portent aussi « Safari »** dans leur
 *   `userAgent` — ils sont tous bâtis sur WebKit. Sans l'exclusion de `CriOS`,
 *   `FxiOS` et `EdgiOS`, on leur montrerait les instructions de partage de Safari,
 *   qui ne correspondent pas à leur menu.
 */
export const isIOSSafari = (userAgent: string, hasTouch: boolean): boolean => {
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (userAgent.includes('Mac') && hasTouch)
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent)

  return isIOS && isSafari
}

/**
 * L'application tourne-t-elle déjà installée ?
 *
 * Deux signaux parce qu'aucun ne couvre tout : `display-mode: standalone` est la
 * forme standard, `navigator.standalone` la forme propriétaire d'iOS — seule
 * disponible là où l'invite manque justement.
 */
export const isStandalone = (
  matchesStandalone: boolean,
  navigatorStandalone?: boolean,
): boolean => matchesStandalone || navigatorStandalone === true

/** Tout ce dont dépend la proposition d'installer, à un instant donné. */
export interface InstallContext {
  /** L'application tourne déjà installée — voir `isStandalone`. */
  installed: boolean
  /** Le navigateur a une invite native prête : `$pwa.showInstallPrompt`. */
  promptable: boolean
  /** iOS Safari, où l'installation est possible mais jamais proposée. */
  isIOS: boolean
  /** `?pwa-force` — le seul moyen d'éprouver le bandeau sans désinstaller. */
  forced: boolean
  /** Le refus du bandeau, valable 30 jours. */
  refused: boolean
  /** Au moins un tracé créé : la proposition a alors un sens. */
  earned: boolean
}

/**
 * Peut-on proposer l'installation ?
 *
 * Installable si le navigateur le propose **ou** si c'est iOS, où rien ne le
 * proposera jamais. Jamais si l'application tourne déjà installée — c'est la seule
 * condition qui ne souffre aucune exception, `?pwa-force` compris : il n'y a rien à
 * installer deux fois.
 */
export const canOfferInstall = (context: InstallContext): boolean =>
  !context.installed && (context.forced || context.promptable || context.isIOS)

/**
 * Le bandeau doit-il paraître ?
 *
 * L'éligibilité, moins un refus encore valide, moins le mérite. **Un tracé créé
 * avant de proposer** : le bandeau vante le plein écran et l'écran qui reste
 * allumé, deux arguments qui ne parlent qu'à quelqu'un ayant déjà vu l'écran de
 * travail. Le compte appartient à l'appelant ; ce module ne connaît pas la
 * bibliothèque.
 *
 * `?pwa-force` passe outre le refus **et** le mérite, mais pas l'installation : il
 * sert à voir le bandeau, pas à en inventer un.
 */
export const shouldShowBanner = (context: InstallContext): boolean =>
  canOfferInstall(context) && (context.forced || (!context.refused && context.earned))
