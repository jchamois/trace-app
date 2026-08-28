<script setup lang="ts">
/**
 * L'empilement du décalquage : le flux caméra en fond, le calque par-dessus.
 *
 * Le `<video>` reste un élément natif — il n'est **pas** recomposé en WebGL. Le
 * faire imposerait une boucle à 60 images par seconde pendant les trente à quatre-
 * vingt-dix minutes d'une séance : chauffe, batterie, et throttling thermique qui
 * dégraderait justement le flux qu'on cherche à afficher. Le shader ne traite que
 * la photo, qui est statique, et le calage est un `matrix3d` composé par le GPU.
 */
import { edgeRamp, SAMPLE_STEP, sobelMagnitudes } from '~/utils/edgeStats'
import { placeOverlay } from '~/utils/overlay'
import type { TraceSession } from '~/utils/session'
import { applyTone, lumaFrom } from '~/utils/tone'
import { TraceRenderer } from '~/utils/traceShader'

const { stream, session, size, hidden = false } = defineProps<{
  stream: MediaStream | null
  session: TraceSession
  size: { w: number, h: number }
  /** Appui long : on efface le calque pour juger le tracé au crayon seul. */
  hidden?: boolean
}>()

/* La taille de l'image remonte à la page : la calibration papier en a besoin pour
   convertir en centimètres, et c'est ici qu'on la connaît — décoder la photo une
   seconde fois ailleurs coûterait plusieurs dizaines de mégaoctets. */
const emit = defineEmits<{ loaded: [{ w: number, h: number }] }>()

const video = useTemplateRef<HTMLVideoElement>('video')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

let renderer: TraceRenderer | null = null
const imageSize = ref({ w: 0, h: 0 })

/**
 * Où poser le calque. Toute la chaîne vit dans `utils/overlay.ts`, qui rend la
 * matrice **et** la taille CSS : les deux viennent du même calcul, donc elles ne
 * peuvent plus diverger.
 */
const placement = computed(() => placeOverlay({
  corners: session.corners,
  viewport: size,
  paperSizeCm: session.paperSizeCm,
  targetWidthCm: session.targetWidthCm,
  imageSize: imageSize.value,
}))

/**
 * Distribution des magnitudes de Sobel, triée — ce qui convertit la « quantité de
 * trait » voulue en bornes absolues pour le shader.
 *
 * `shallowRef` : ces tableaux font des centaines de milliers de flottants, ils
 * n'ont rien à faire dans un proxy réactif profond et ne sont jamais mutés.
 */
const magnitudes = shallowRef<Float32Array>(new Float32Array(0))

/**
 * Luminance **brute** pleine définition, gardée entre deux calibrations.
 *
 * Elle ne dépend pas des réglages : seul l'étalonnage en dépend. La conserver
 * évite de redécoder l'image et de refaire un `getImageData` de 12 Mo à chaque
 * mouvement de curseur.
 */
let rawLuma: Float32Array | null = null
let lumaSize = { w: 0, h: 0 }

/**
 * Recalcule la distribution pour l'étalonnage courant.
 *
 * **Le Sobel tourne sur la tonalité, pas sur la luminance brute** — comme le
 * shader. C'était le bug : la calibration mesurait le brut, le shader mesurait
 * l'étalonné, et pousser le contraste multipliait les gradients du shader par trois
 * pendant que les bornes décrivaient toujours l'autre distribution.
 */
const recalibrate = () => {
  if (!rawLuma) return

  const toned = applyTone(rawLuma, {
    contrast: session.params.contrast,
    gamma: session.params.gamma,
    invert: session.invert,
  })

  magnitudes.value = sobelMagnitudes(toned, lumaSize.w, lumaSize.h, SAMPLE_STEP)
}

/**
 * Lit l'image **à la définition à laquelle le shader travaille**, une seule fois.
 *
 * Ne pas réduire pour aller plus vite : un Sobel mesure l'écart entre pixels
 * voisins, donc sa magnitude dépend de la définition. Une vignette produit des
 * gradients bien plus forts, et les bornes qu'on en tire ne laissent presque rien
 * passer au rendu. L'échantillonnage d'un pixel sur seize donne le même coût sans
 * fausser les unités.
 */
const readLuma = (bitmap: ImageBitmap) => {
  const { width: w, height: h } = bitmap

  const probe = document.createElement('canvas')
  probe.width = w
  probe.height = h

  const ctx = probe.getContext('2d', { willReadFrequently: false })!
  ctx.drawImage(bitmap, 0, 0)

  rawLuma = lumaFrom(ctx.getImageData(0, 0, w, h).data)
  lumaSize = { w, h }

  // Rend tout de suite les ~12 Mo du tampon : le canvas de mesure ne resservira pas.
  probe.width = 0
  probe.height = 0
}

const paint = () => {
  renderer?.render({
    render: session.render,
    params: session.params,
    edge: edgeRamp(magnitudes.value, session.params.inkRatio),
    invert: session.invert,
    strokeColor: session.strokeColor,
  })
}

watch(() => stream, (media) => {
  if (video.value) video.value.srcObject = media
}, { immediate: true })

onMounted(async () => {
  renderer = new TraceRenderer(canvas.value!)

  const bitmap = await createImageBitmap(session.image)
  imageSize.value = { w: bitmap.width, h: bitmap.height }
  emit('loaded', imageSize.value)

  // Avant le premier `paint()` : sans distribution, les bornes vaudraient 0 et le
  // rendu Contours encrerait toute l'image le temps d'une image.
  readLuma(bitmap)
  recalibrate()

  renderer.setImage(bitmap)
  paint()
})

/* Deux observateurs, et la distinction est le fond du correctif.

   L'étalonnage — contraste, gamma, inversion — change **la distribution des
   gradients**, donc les bornes doivent être recalculées avant de repeindre. Les
   autres réglages ne touchent qu'au rendu.

   `flush: 'post'` et pas de débounce : la recalibration coûte un Sobel sur un
   pixel sur seize, quelques millisecondes, et la faire attendre rendrait le
   curseur mensonger le temps du délai. */
watch(
  () => [session.params.contrast, session.params.gamma, session.invert],
  () => {
    recalibrate()
    paint()
  },
  { flush: 'post' },
)

watch(
  () => [
    session.render,
    session.params.opacity,
    session.params.inkRatio,
    session.params.levels,
    session.strokeColor,
  ],
  paint,
)

onScopeDispose(() => {
  renderer?.dispose()
  // Une douzaine de mégaoctets : les rendre en sortant plutôt qu'au bon vouloir
  // du ramasse-miettes.
  rawLuma = null
})
</script>

<template>
  <div class="stack">
    <!-- `playsinline` est impératif : sans lui, iOS Safari passe la vidéo en
         lecteur plein écran natif et l'application disparaît. `muted` est ce qui
         autorise la lecture automatique. -->
    <video
      ref="video"
      class="stack__video"
      autoplay
      muted
      playsinline
      disablepictureinpicture
    />

    <!-- Taille CSS et matrice viennent toutes deux de `placeOverlay` : c'est
         structurel, l'homographie envoie le rectangle `0,0 → imageSize` sur le
         quadrilatère de l'écran. Déduite de l'attribut, la boîte devenait tributaire
         du reset global (`canvas { max-inline-size: 100% }`) qui la rabotait, et le
         calque s'affichait au tiers de sa taille. -->
    <canvas
      ref="canvas"
      class="stack__overlay"
      :class="{ 'stack__overlay--hidden': hidden }"
      :style="{
        inlineSize: `${placement?.cssSize.w ?? 0}px`,
        blockSize: `${placement?.cssSize.h ?? 0}px`,
        transform: placement?.matrix ?? 'scale(0)',
        opacity: session.params.opacity,
      }"
    />
  </div>
</template>

<style scoped>
.stack {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* Fond noir tant que le flux n'est pas là : un conteneur transparent laisserait
     apparaître un blanc de rendu, qui se refléterait sur la feuille. */
  background-color: #000;
}

.stack__video {
  inline-size: 100%;
  block-size: 100%;
  /* `cover` : la feuille doit remplir l'écran, une bande noire volerait de la
     surface de travail. Le débordement est sans conséquence, le calage étant
     exprimé dans le repère du conteneur. */
  object-fit: cover;
}

.stack__overlay {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  /* Annule le plafond du reset : la boîte de ce canvas est une donnée géométrique,
     pas une contrainte de mise en page. */
  max-inline-size: none;
  /* Impératif avec `matrix3d` : l'homographie est calculée depuis le coin
     haut-gauche du canvas, pas depuis son centre. */
  transform-origin: 0 0;
  /* Le calque ne capte rien : les gestes appartiennent à la surface au-dessus. */
  pointer-events: none;
  transition: opacity var(--dur-fast) var(--ease);
}

.stack__overlay--hidden {
  opacity: 0 !important;
}
</style>
