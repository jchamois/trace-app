import { describe, expect, it } from 'vitest'
import type { InstallContext } from '~/utils/installPrompt'
import { canOfferInstall, isIOSSafari, isStandalone, shouldShowBanner } from '~/utils/installPrompt'

/**
 * Ce fichier aurait dû exister dès l'origine : l'en-tête d'`installPrompt.ts`
 * annonce que ses fonctions sont paramétrées « plutôt que lisant `window` » pour
 * être vérifiables, et que chaque règle est « verrouillée par un test ». Aucune ne
 * l'était. Le coût de l'abstraction avait été payé, le bénéfice jamais encaissé.
 */

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  macDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  chromeIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120 Mobile/15E148 Safari/604.1',
  firefoxIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
}

const context = (over: Partial<InstallContext> = {}): InstallContext => ({
  installed: false,
  promptable: false,
  isIOS: false,
  forced: false,
  refused: false,
  earned: true,
  ...over,
})

describe('isIOSSafari', () => {
  it('reconnaît un iPhone', () => {
    expect(isIOSSafari(UA.iphone, true)).toBe(true)
  })

  it('reconnaît un iPad récent, qui s’annonce comme un Mac', () => {
    // Depuis iPadOS 13, le `userAgent` ne contient plus « iPad » : c'est l'écran
    // tactile qui fait la différence avec un Mac de bureau.
    expect(isIOSSafari(UA.ipadOS, true)).toBe(true)
  })

  it('ne prend pas un Mac de bureau pour un iPad', () => {
    expect(isIOSSafari(UA.macDesktop, false)).toBe(false)
    // Même agent que l'iPad, sans le tactile : c'est le seul discriminant.
    expect(isIOSSafari(UA.ipadOS, false)).toBe(false)
  })

  it('exclut Chrome et Firefox sur iOS, qui portent aussi « Safari »', () => {
    /* Tous deux sont bâtis sur WebKit et gardent « Safari » dans leur agent. Sans
       l'exclusion, on leur montrerait les instructions de partage de Safari, qui ne
       correspondent pas à leur menu. */
    expect(isIOSSafari(UA.chromeIOS, true)).toBe(false)
    expect(isIOSSafari(UA.firefoxIOS, true)).toBe(false)
  })

  it('ne reconnaît pas Android', () => {
    expect(isIOSSafari(UA.androidChrome, true)).toBe(false)
  })
})

describe('isStandalone', () => {
  it('accepte chacun des deux signaux séparément', () => {
    // `display-mode: standalone` est la forme standard ; `navigator.standalone` la
    // forme propriétaire d'iOS, seule disponible là où l'invite manque justement.
    expect(isStandalone(true, undefined)).toBe(true)
    expect(isStandalone(false, true)).toBe(true)
  })

  it('rend faux quand aucun ne l’indique', () => {
    expect(isStandalone(false, false)).toBe(false)
    expect(isStandalone(false, undefined)).toBe(false)
  })
})

describe('canOfferInstall', () => {
  it('propose quand le navigateur a une invite prête', () => {
    expect(canOfferInstall(context({ promptable: true }))).toBe(true)
  })

  it('propose sur iOS, où rien ne le proposera jamais', () => {
    expect(canOfferInstall(context({ isIOS: true }))).toBe(true)
  })

  it('ne propose rien sans invite ni iOS', () => {
    expect(canOfferInstall(context())).toBe(false)
  })

  it('ne propose jamais quand l’application est déjà installée', () => {
    /* La seule condition qui ne souffre aucune exception, `?pwa-force` compris :
       il n'y a rien à installer deux fois. */
    for (const over of [{ promptable: true }, { isIOS: true }, { forced: true }]) {
      expect(canOfferInstall(context({ ...over, installed: true }))).toBe(false)
    }
  })

  it('`?pwa-force` suffit à rendre éligible', () => {
    expect(canOfferInstall(context({ forced: true }))).toBe(true)
  })
})

describe('shouldShowBanner', () => {
  it('montre le bandeau dès qu’on est éligible', () => {
    expect(shouldShowBanner(context({ promptable: true }))).toBe(true)
  })

  it('se tait après un refus', () => {
    expect(shouldShowBanner(context({ promptable: true, refused: true }))).toBe(false)
  })

  it('`?pwa-force` passe outre le refus', () => {
    expect(shouldShowBanner(context({ promptable: true, refused: true, forced: true }))).toBe(true)
  })

  it('`?pwa-force` ne passe pas outre l’installation', () => {
    // Il sert à voir le bandeau, pas à en inventer un.
    expect(shouldShowBanner(context({ forced: true, installed: true }))).toBe(false)
  })

  it('ne montre rien quand l’installation est impossible', () => {
    expect(shouldShowBanner(context())).toBe(false)
  })
})
