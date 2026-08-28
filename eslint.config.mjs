import a11y from 'eslint-plugin-vuejs-accessibility'

import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    /* Le handoff de design est une référence versionnée, pas du code source : ses
       prototypes HTML et le runtime `support.js` de l'outil de maquettage sont à
       recréer, jamais à intégrer. Sans cet ignore, `support.js` seul noierait le
       rapport de lint. */
    ignores: ['docs/**'],
  },
  // Sans cette extension, une balise interactive sans nom accessible ou un
  // `aria-*` inventé passerait le lint sans un mot.
  ...a11y.configs['flat/recommended'],
  {
    rules: {
      /* La règle traite `<output>` comme un contrôle de formulaire à étiqueter.
         Il n'en est pas un : il restitue un résultat, il ne reçoit aucune saisie —
         et l'app en emploie pour les valeurs de curseurs et les dimensions en cm.
         Les vrais contrôles restent couverts par `label-has-for` juste dessous. */
      'vuejs-accessibility/form-control-has-label': 'off',

      /* Par défaut la règle réclame `every: ['nesting', 'id']`, c'est-à-dire un
         `<label>` qui enveloppe le contrôle *et* porte `for`. Ni HTML ni WCAG ne
         l'exigent : `<label for>` pointant vers l'`id` du contrôle est
         l'association canonique. */
      'vuejs-accessibility/label-has-for': [
        'error',
        { required: { some: ['nesting', 'id'] } },
      ],

      /* `role="list"` sur un `<ul>` n'est redondant que sur le papier : le reset
         global pose `list-style: none`, ce qui fait perdre le rôle `list` à
         Safari/VoiceOver — et emporte avec lui les `aria-label` de ces listes. */
      'vuejs-accessibility/no-redundant-roles': ['error', { ul: ['list'] }],
    },
  },
  {
    rules: {
      // Arrow functions exclusivement.
      'func-style': ['error', 'expression'],
      'prefer-arrow-callback': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      // Le code mort se supprime, il ne se commente pas.
      'no-unused-vars': 'off',
      /* `ignoreRestSiblings` : le motif `const { image, ...fields } = session` sert
         à **retirer** une propriété, la variable n'a pas vocation à être lue.
         `argsIgnorePattern` ne couvre que les paramètres, pas les déstructurations. */
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // Sécurité : pas d'exécution dynamique de chaîne.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'vue/no-v-html': 'error',
      'vue/require-explicit-emits': 'error',
      'vue/multi-word-component-names': 'error',
    },
  },
  {
    // Le nom de ces fichiers est imposé par Nuxt : la règle ne vaut que pour les
    // composants.
    files: ['app/pages/**/*.vue', 'app/layouts/**/*.vue', 'app/error.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // Scripts Node hors application : pas de contexte Nuxt.
    files: ['scripts/**/*.{ts,mjs}'],
    rules: {
      'no-console': 'off',
    },
  },
)
