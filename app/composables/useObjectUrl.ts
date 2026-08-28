import type { MaybeRefOrGetter } from 'vue'

/**
 * Expose un `Blob` comme URL, et **révoque l'ancienne** à chaque changement comme
 * au démontage.
 *
 * Sans révocation, chaque URL retient son blob en mémoire pour toute la durée de
 * vie du document : une bibliothèque de vingt photos parcourue plusieurs fois
 * retiendrait des centaines de mégaoctets que le ramasse-miettes ne peut pas
 * libérer, l'URL comptant comme une référence forte.
 */
export const useObjectUrl = (source: MaybeRefOrGetter<Blob | null | undefined>): Ref<string | null> => {
  const url = ref<string | null>(null)

  const revoke = () => {
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = null
  }

  watch(() => toValue(source), (blob) => {
    revoke()
    if (blob) url.value = URL.createObjectURL(blob)
  }, { immediate: true })

  onScopeDispose(revoke)

  return url
}
