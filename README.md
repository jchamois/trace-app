# trace-app

**[trace-app-decalque.web.app](https://trace-app-decalque.web.app)** — installable
depuis le navigateur, fonctionne hors ligne.

PWA mobile pour **décalquer une photo sur une feuille de papier**.

Le téléphone est fixé sur un support au-dessus d'une feuille, sa caméra arrière la
filme en plein écran, et la photo est superposée en semi-transparence par-dessus ce
flux. On regarde l'écran, la main dessine sous le téléphone.

> **Un téléphone ne projette pas de lumière.** Aucune API web ne peut créer un
> faisceau : l'application simule la projection par superposition caméra. Corollaire
> à assumer — **sans support (bras articulé, pince col-de-cygne), elle est
> inutilisable**, l'image bougeant à chaque respiration. C'est le seul prérequis
> matériel, et il est rappelé dans l'écran d'accueil.

## Démarrer

```bash
nvm use                # 24.19.0 — Nuxt 4 refuse Node < 20.19
npm install
npm run dev            # http://localhost:3000
npm run dev:https      # HTTPS + LAN, pour essayer la caméra depuis un téléphone
```

| Commande | Rôle |
| --- | --- |
| `npm run lint` / `lint:fix` | ESLint (stylistique + a11y Vue) |
| `npm run typecheck` | `vue-tsc` en mode strict |
| `npm test` | Vitest — modules purs uniquement |
| `npm run generate` | Build statique dans `.output/public` |
| `npm run icons` | Réexporte les PNG du manifeste depuis les SVG sources |
| `npm run deploy` | `generate` + Firebase Hosting (production) |
| `npm run preview:channel` | Canal de préversion Firebase, URL HTTPS jetable |

**`generate` et jamais `build`** : `build` produit un serveur Nitro et laisse
`.output/public` sans le moindre HTML — un site déployé et vide, sans qu'aucune
étape n'échoue.

## Architecture

Le point qui porte tout : **rien n'est redessiné par frame.** La photo est statique,
donc le shader ne tourne qu'au chargement et à chaque changement de réglage ; le
calage est un `transform: matrix3d` composé par le GPU. Le flux caméra reste un
`<video>` natif, jamais recomposé en WebGL — le faire imposerait une boucle à 60 Hz
pendant les 30 à 90 minutes d'une séance, avec la chauffe et le throttling qui
dégraderaient justement l'image qu'on cherche à afficher.

```
app/
├── utils/
│   ├── homography.ts     # le calage, en algèbre pure — testé en premier
│   ├── traceShader.ts    # pipeline image en un fragment shader (WebGL)
│   ├── paper.ts          # feuille ↔ centimètres réels
│   ├── imageImport.ts    # décodage, plafonnement, vignette
│   ├── libraryArchive.ts # export / import ZIP, et sa validation
│   └── session.ts        # le modèle d'un tracé
├── composables/          # caméra, wake lock, gestes, persistance
├── components/{app,base,library,trace}/
└── pages/                # `/` bibliothèque · `/trace/[id]` écran de travail
```

### Trois invariants à ne pas casser

- **Les coins de la feuille sont stockés normalisés, jamais la matrice.** La matrice
  se dérive en un calcul ; exprimée en pixels écran elle deviendrait fausse au
  premier redimensionnement — barre d'URL de Safari comprise.
- **Le calage par défaut a besoin du viewport.** Les coins sont normalisés, l'écran
  ne l'est pas : un rectangle « carré » en unités normalisées est étiré en pixels.
  D'où `corners: null` à la création, posé au premier montage de l'écran de travail.
- **La boîte CSS du canvas vaut exactement la définition de l'image.** L'homographie
  envoie `0,0 → imageSize` sur le quadrilatère de l'écran ; la laisser déduire de
  l'attribut la rendait tributaire du reset global (`canvas { max-inline-size: 100% }`),
  qui la rabotait — le calque s'affichait au tiers de sa taille.

### Le mode simple est le mode calage

Glisser / pincer / pivoter n'est pas un chemin de code séparé : c'est la même liste
de quatre coins, à laquelle on applique une similitude au lieu de déplacer un coin
isolément. Basculer vers le calage 4 coins ne déplace donc rien à l'écran, ça
déverrouille les poignées là où elles sont.

## Données

**Tout reste sur l'appareil.** IndexedDB pour les tracés (photo, vignette, calage,
réglages), aucun compte, aucun serveur — `connect-src 'self'` dans la CSP en est la
garantie vérifiable : en mode avion, l'onglet réseau doit rester vide.

La sauvegarde passe par un **fichier**, pas par un cloud : « Sauvegarder » exporte la
bibliothèque en ZIP (manifeste + photos), « Restaurer » la réimporte en **fusionnant
par `id`** — jamais en écrasant un tracé plus récent, et sans doublon si la même
archive est importée deux fois. C'est le seul endroit où une donnée vient de
l'extérieur, donc le seul qui valide ses entrées.

## Déploiement

Firebase Hosting, statique (`ssr: false`). Push sur `main` → production ; pull
request → canal de préversion, qui fournit **une URL HTTPS à certificat valide** —
la seule façon fiable d'essayer la caméra depuis un iPhone, Safari étant capricieux
derrière un certificat auto-signé.

Trois réglages sont vitaux dans `firebase.json`, qui n'accepte pas de commentaires :

- **`Permissions-Policy: camera=(self)`** — la valeur héritée de `charge-app`,
  `camera=()`, **interdirait la caméra** et rendrait l'application entièrement
  inopérante. Rien dans le build ne le signalerait.
- **`connect-src 'self'`** — aucune requête tierce, polices auto-hébergées
  comprises. C'est la garantie vérifiable que rien ne quitte l'appareil.
- **`script-src` doit garder `'unsafe-inline'`.** En `ssr: false`, Nuxt émet deux
  scripts inline non négociables — l'`importmap` et `window.__NUXT__.config` — et
  les bloquer empêche l'application de démarrer, sur une page blanche muette. Des
  hachages ne tiendraient pas : le `buildId` du bloc de configuration change à
  chaque build. Le risque est contenu ailleurs — aucun script tiers, `connect-src
  'self'`, et `vue/no-v-html` en erreur dans la configuration ESLint.

Ces en-têtes ne s'appliquent **pas** au serveur de dev. Les vérifier demande soit
l'émulateur (`npx firebase emulators:start --only hosting`), soit un déploiement.

### Mise en place, une fois

1. Créer le projet Firebase et le site d'hébergement.
2. `npx firebase init hosting:github` — génère le compte de service et pose le
   secret `FIREBASE_SERVICE_ACCOUNT` dans le dépôt, avec les bons rôles.
3. Renseigner `.firebaserc` (`{ "projects": { "default": "<projet>" } }`) et, si le
   site n'est pas le site par défaut, ajouter `"site"` dans `firebase.json`.

## Design

Le handoff Claude Design — spécification écran par écran, jetons, icônes sources et
captures — vit **localement** dans `docs/handoff/` et n'est **pas versionné** : ce
sont des prototypes de plusieurs mégaoctets, pas du code source.

Ce qui en est issu est bien dans le dépôt : les jetons dans
[`app/assets/css/tokens.css`](app/assets/css/tokens.css), repris tels quels, et les
icônes sources dans [`public/icons/`](public/icons/). Haute fidélité — couleurs,
espacements, cibles tactiles et **copies** sont définitifs.

Trois écarts assumés par rapport à ses recommandations techniques, chacun documenté
dans le code :

| Handoff | Ici | Pourquoi |
| --- | --- | --- |
| `facingMode: { exact: 'environment' }` | `ideal` | `exact` lève sur tout appareil sans caméra arrière et affiche « aucune caméra » alors qu'une caméra existe |
| Vidéo composée en WebGL | `<video>` natif | une boucle 60 Hz d'une heure : chauffe, batterie, throttling |
| `display: 'fullscreen'` | `standalone` + Fullscreen API | ses maquettes dessinent la barre d'état système, que `fullscreen` masquerait ; iOS l'ignore de toute façon |

## Contraintes non négociables (issues de l'usage réel)

1. Interface quasi noire — un écran clair se reflète sur la feuille et fausse la
   perception du tracé.
2. Caméra en plein viewport ; toute l'UI flotte par-dessus et reste escamotable.
3. Aucun contrôle ne compte sur le fond : derrière chaque bouton, une vidéo
   imprévisible. Chacun porte son propre fond opaque.
4. Commandes dans le tiers bas en portrait, sur le côté en paysage.
5. Cibles tactiles ≥ 48 px — doigts couverts de graphite.
6. `env(safe-area-inset-*)` partout.
7. L'écran ne doit pas s'éteindre pendant une séance (Screen Wake Lock).
