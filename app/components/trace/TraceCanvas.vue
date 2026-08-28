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
import type { Quad } from '~/utils/homography'
import { applyToPoint, solveHomography, toMatrix3d, UNIT_SQUARE } from '~/utils/homography'
import { placementOf, placementQuad, subjectSizeCm } from '~/utils/paper'
import type { TraceSession } from '~/utils/session'
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
 * La chaîne complète : carré unité → feuille à l'écran, puis rectangle de l'image
 * sur la feuille → écran. Deux homographies composées, et non une seule, parce que
 * la position de l'image **sur le papier** dépend du format et de la taille cible,
 * qui changent sans que le calage bouge.
 */
const transform = computed(() => {
  if (!size.w || !size.h || !imageSize.value.w || !session.corners) return null

  const paperQuad = session.corners
    .map(c => ({ x: c.x * size.w, y: c.y * size.h })) as unknown as Quad

  const paper = solveHomography(UNIT_SQUARE, paperQuad)
  const subject = subjectSizeCm(session.paperSizeCm, imageSize.value, session.targetWidthCm)
  const onPaper = placementQuad(placementOf(session.paperSizeCm, subject))

  const onScreen = onPaper.map(p => applyToPoint(paper, p)) as unknown as Quad
  const { w, h } = imageSize.value
  const canvasRect: Quad = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]

  return toMatrix3d(solveHomography(canvasRect, onScreen))
})

const paint = () => {
  renderer?.render({
    render: session.render,
    params: session.params,
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
  renderer.setImage(bitmap)
  paint()
})

/* Un seul observateur sur tout ce que le shader consomme : chaque déplacement de
   curseur repeint, et rien d'autre ne le déclenche. `deep` parce que `params` est
   un objet muté champ par champ par les curseurs. */
watch(
  () => [session.render, session.params, session.invert, session.strokeColor],
  paint,
  { deep: true },
)

onScopeDispose(() => renderer?.dispose())
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

    <!-- La taille CSS est imposée explicitement, et c'est structurel : l'homographie
         envoie le rectangle `0,0 → imageSize` sur le quadrilatère de l'écran, donc la
         boîte CSS **doit** valoir exactement la définition de l'image. La laisser
         déduite de l'attribut la rendait tributaire du reset global
         (`canvas { max-inline-size: 100% }`), qui la rabotait à la largeur du
         conteneur — le calque s'affichait alors au tiers de sa taille. -->
    <canvas
      ref="canvas"
      class="stack__overlay"
      :class="{ 'stack__overlay--hidden': hidden }"
      :style="{
        inlineSize: `${imageSize.w}px`,
        blockSize: `${imageSize.h}px`,
        transform: transform ?? 'scale(0)',
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
