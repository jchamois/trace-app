import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    /* `happy-dom` partout : les greffons Vite du projet sont déjà appliqués par
       `defineVitestConfig`, donc les auto-imports et les alias résolvent au
       montage. L'environnement `nuxt` construirait une application de test
       complète pour le même résultat, en cent fois le temps. */
    environment: 'happy-dom',
    include: ['tests/**/*.spec.ts'],
  },
})
