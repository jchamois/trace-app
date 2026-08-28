export default defineNuxtConfig({
  modules: [
    '@vite-pwa/nuxt',
    '@nuxt/fonts',
    '@nuxt/eslint',
  ],

  // PWA installable servie en statique sur Firebase Hosting : aucun runtime serveur,
  // et aucune donnée hors de l'appareil. Toute la persistance vit dans IndexedDB.
  ssr: false,

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: 'trace-app',
      titleTemplate: '%s — trace-app',
      meta: [
        /* `viewport-fit=cover` : le flux caméra occupe tout le viewport, encoches
           comprises. Les retraits sont traités par `env(safe-area-inset-*)` —
           cf. les jetons `--safe-*` / `--pad-*` du handoff. */
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#0A0A0B' },
        {
          name: 'description',
          content: 'Décalquez une photo sur une feuille de papier en la superposant au flux de votre caméra.',
        },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'trace-app' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/icons/icon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/pwa-32.png' },
        // `@vite-pwa/nuxt` génère le fichier mais n'injecte pas le lien : sans lui
        // l'application n'est pas installable.
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      ],
    },
  },

  css: ['~/assets/css/tokens.css', '~/assets/css/base.css'],

  compatibilityDate: '2026-08-28',

  typescript: {
    strict: true,
    // Assuré par `npm run typecheck`, pas à chaque HMR.
    typeCheck: false,
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  fonts: {
    /* Téléchargées et auto-hébergées au build : aucune requête vers un CDN tiers.
       C'est ce qui permet de garder `connect-src 'self'` dans la CSP, et c'est ce
       qui fait fonctionner la typographie hors ligne — le cas d'usage nominal.

       Archivo porte l'interface, IBM Plex Mono tout ce qui est chiffré (valeurs de
       curseurs, dimensions en cm, métadonnées) — cf. le handoff. */
    families: [
      { name: 'Archivo', provider: 'google', weights: [400, 500, 600, 700] },
      { name: 'IBM Plex Mono', provider: 'google', weights: [400, 500] },
    ],
  },

  pwa: {
    /* `prompt` et non `autoUpdate` : en `autoUpdate` le module pose `skipWaiting`
       + `clientsClaim`, le nouveau service worker s'active seul et recharge la
       page — quitte à le faire au milieu d'une séance de décalquage, ce qui perdrait
       le calage en cours. Ici il attend, `needRefresh` passe à vrai et
       `AppUpdateBanner` laisse le choix du moment. */
    registerType: 'prompt',
    client: {
      // C'est lui qui fait capter `beforeinstallprompt` par le plugin du module et
      // alimente `$pwa.showInstallPrompt` / `install()`.
      installPrompt: true,
      // En secondes. À 0 (le défaut) rien n'est vérifié tant que la page n'est pas
      // rechargée : une PWA installée reprise depuis l'arrière-plan ne verrait
      // jamais la nouvelle version.
      periodicSyncForUpdates: 3600,
    },
    manifest: {
      name: 'trace-app',
      short_name: 'trace-app',
      description: 'Décalquez une photo sur une feuille de papier en la superposant au flux de votre caméra.',
      lang: 'fr',
      // L'identité de l'application installée. Sans `id`, elle est déduite du
      // `start_url` : le changer créerait une seconde installation au lieu de
      // mettre à jour la première.
      id: '/',
      start_url: '/',
      scope: '/',
      /* `standalone` et non `fullscreen`, contre la recommandation du handoff : ses
         maquettes de bibliothèque **dessinent** la barre d'état système (heure,
         batterie), que `fullscreen` masquerait — et iOS ignore `fullscreen` de toute
         façon. L'écran de travail, lui, demande le plein écran par la Fullscreen API
         au moment où il en a besoin : on obtient les deux comportements au lieu d'un
         compromis. */
      display: 'standalone',
      // `any` et non `portrait` : le décalquage en paysage est un cas prévu, le
      // handoff en donne la maquette.
      orientation: 'any',
      background_color: '#0A0A0B',
      theme_color: '#0A0A0B',
      icons: [
        { src: '/icons/pwa-32.png', sizes: '32x32', type: 'image/png' },
        { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/icons/maskable-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/icons/maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      /* `autoUpdate` le posait, `prompt` non : sans lui le service worker ne
         contrôle la page qu'à la navigation suivante, donc rien n'est mis en cache
         lors de la toute première visite. Il ne provoque aucune activation
         prématurée tant que `skipWaiting` reste faux. */
      clientsClaim: true,
      // Indispensable en SPA : toute route inconnue retombe sur le shell.
      navigateFallback: '/',
      /* Tout le shell est précaché, polices comprises : l'application doit démarrer
         en mode avion. Il n'y a aucun `runtimeCaching` — rien n'est chargé depuis le
         réseau une fois installée. */
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
    },
    // Un service worker en dev ne sert qu'à masquer les changements de code.
    devOptions: { enabled: false },
  },
})
