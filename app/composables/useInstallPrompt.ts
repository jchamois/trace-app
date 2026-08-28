import type { ComputedRef, Ref } from 'vue'
import { canOfferInstall, isIOSSafari, isStandalone, shouldShowBanner } from '~/utils/installPrompt'

/** Un mois : assez pour ne pas harceler, assez court pour ne pas perdre l'invite. */
const DISMISS_MAX_AGE = 30 * 24 * 60 * 60

/** Ressort la bannière malgré un refus — le seul moyen de la tester sans désinstaller. */
const FORCE_PARAM = 'pwa-force'

/**
 * L'installation, vue depuis l'application.
 *
 * **Ce composable ne décide de rien.** Il lit `$pwa`, le cookie, `navigator` et
 * `location` — autant de choses qui n'existent qu'au navigateur —, en compose un
 * `InstallContext`, et laisse `~/utils/installPrompt` trancher. La séparation n'est
 * pas cosmétique : les suites tournent en `happy-dom` **sans** environnement
 * `nuxt`, donc rien de ce qui touche `useNuxtApp` ou `useCookie` n'est vérifiable
 * ici. Tout ce qui est une règle doit donc en sortir.
 */
export interface InstallPrompt {
  canInstall: ComputedRef<boolean>
  /** L'invite est-elle à montrer maintenant ? Tient compte du refus de 30 jours. */
  bannerVisible: ComputedRef<boolean>
  /** iOS Safari, seul cas où l'installation passe par des instructions à nous. */
  isIOS: Ref<boolean>
  stepsOpen: Ref<boolean>
  installed: ComputedRef<boolean>
  install: () => Promise<void>
  dismiss: () => void
}

export const useInstallPrompt = (): InstallPrompt => {
  const { $pwa } = useNuxtApp()

  const refused = useCookie<boolean>('trace-install-refuse', { maxAge: DISMISS_MAX_AGE })

  /* `useState` et non `ref` : le bandeau et le menu de la bibliothèque appellent
     tous deux ce composable, et l'un doit pouvoir ouvrir la feuille d'instructions
     que l'autre rend. Deux `ref` locaux ne se seraient jamais vus. */
  const stepsOpen = useState('install-steps', () => false)
  const isIOS = ref(false)
  const forced = ref(false)

  /* `userAgent`, `matchMedia` et `location` n'existent qu'au navigateur, et ce
     composable est appelé depuis des composants — d'où `onMounted` plutôt qu'une
     lecture au setup. */
  onMounted(() => {
    isIOS.value = isIOSSafari(navigator.userAgent, 'ontouchend' in document)
    forced.value = new URLSearchParams(location.search).has(FORCE_PARAM)
  })

  const installed = computed(() =>
    Boolean($pwa?.isPWAInstalled)
    || isStandalone(
      import.meta.client && window.matchMedia('(display-mode: standalone)').matches,
      import.meta.client
        ? (navigator as Navigator & { standalone?: boolean }).standalone
        : undefined,
    ),
  )

  const context = computed(() => ({
    installed: installed.value,
    promptable: Boolean($pwa?.showInstallPrompt),
    isIOS: isIOS.value,
    forced: forced.value,
    refused: Boolean(refused.value),
  }))

  const canInstall = computed(() => canOfferInstall(context.value))

  const install = async () => {
    // Pas d'invite native sur iOS : on explique le geste. Réservé à iOS — les
    // étapes parlent du bouton Partager de Safari, elles n'ont aucun sens ailleurs.
    if (isIOS.value) {
      stepsOpen.value = true
      return
    }

    if ($pwa?.showInstallPrompt) await $pwa.install()

    /* Bandeau visible sans invite disponible : c'est le cas de `?pwa-force`, et
       celui du dev, où `devOptions.enabled: false` ne pose aucun service worker —
       or Chrome n'émet `beforeinstallprompt` que s'il y en a un. Rien à déclencher,
       et rien à afficher qui serait vrai. */
  }

  /**
   * **Ne pas appeler `$pwa.cancelInstall()` ici.** Il écrit un drapeau
   * `localStorage` *sans péremption*, et au chargement suivant le plugin du module
   * saute tout son bloc d'installation : plus aucune écoute de
   * `beforeinstallprompt`, `install()` devient un no-op. Le refus serait donc
   * définitif, ce qui annulerait le cookie de 30 jours.
   */
  const dismiss = () => {
    refused.value = true
  }

  const bannerVisible = computed(() => shouldShowBanner(context.value))

  return { canInstall, bannerVisible, isIOS, stepsOpen, installed, install, dismiss }
}
