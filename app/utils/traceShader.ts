/**
 * Le calque, en un seul passage GPU.
 *
 * **Le rendu n'est pas une boucle.** La photo est statique : le shader ne tourne
 * qu'au chargement de l'image et à chaque changement de réglage. Le calage, lui, est
 * un `transform: matrix3d` composé par le GPU sans repeindre. C'est ce qui permet à
 * l'écran de travail de ne rien consommer au repos pendant une séance d'une heure —
 * et c'est pourquoi le flux caméra reste un `<video>` natif plutôt que d'être
 * recomposé ici à 60 images par seconde.
 *
 * La sortie porte un **alpha**, jamais une image opaque : sur un calque de
 * décalquage il faut voir le papier entre les traits.
 */
import type { RenderMode, RenderParams } from './session'

const VERTEX_SRC = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  // Le quad couvre [-1,1] ; l'UV se déduit sans second attribut.
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const FRAGMENT_SRC = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uTexel;
uniform int uMode;
uniform float uContrast;
uniform float uGamma;
uniform float uThreshold;
uniform float uLevels;
uniform float uInvert;
uniform vec3 uStroke;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 grade(vec3 c) {
  vec3 v = pow(clamp(c, 0.0, 1.0), vec3(1.0 / uGamma));
  v = clamp((v - 0.5) * (1.0 + uContrast) + 0.5, 0.0, 1.0);
  return mix(v, 1.0 - v, uInvert);
}

float toneAt(vec2 uv) {
  return luma(grade(texture2D(uImage, uv).rgb));
}

void main() {
  // Photo : la chaîne tonale s'applique par canal pour conserver la couleur.
  if (uMode == 0) {
    gl_FragColor = vec4(grade(texture2D(uImage, vUv).rgb), 1.0);
    return;
  }

  // Contours : Sobel 3x3 sur la luminance déjà étalonnée.
  if (uMode == 1) {
    float tl = toneAt(vUv + uTexel * vec2(-1.0, -1.0));
    float tm = toneAt(vUv + uTexel * vec2( 0.0, -1.0));
    float tr = toneAt(vUv + uTexel * vec2( 1.0, -1.0));
    float ml = toneAt(vUv + uTexel * vec2(-1.0,  0.0));
    float mr = toneAt(vUv + uTexel * vec2( 1.0,  0.0));
    float bl = toneAt(vUv + uTexel * vec2(-1.0,  1.0));
    float bm = toneAt(vUv + uTexel * vec2( 0.0,  1.0));
    float br = toneAt(vUv + uTexel * vec2( 1.0,  1.0));

    float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
    float gy = (bl + 2.0 * bm + br) - (tl + 2.0 * tm + tr);

    // Le noyau sature à 4 par axe : la division ramène la magnitude vers 0-1.
    float mag = clamp(length(vec2(gx, gy)) / 4.0, 0.0, 1.0);

    /* Un seuil franc crénellerait chaque trait. La rampe étroite au-dessus du
       seuil rend un antialiasing gratuit, et c'est elle qui fait la différence
       entre un contour lisible et un pointillé sur une photo bruitée. */
    gl_FragColor = vec4(uStroke, smoothstep(uThreshold, uThreshold + 0.08, mag));
    return;
  }

  /* Aplats : quantification de la luminance. L'encre marque les zones **sombres**,
     donc l'alpha est l'inverse du niveau — les hautes lumières laissent le papier. */
  float v = toneAt(vUv);
  float steps = max(uLevels - 1.0, 1.0);
  float q = floor(v * steps + 0.5) / steps;

  gl_FragColor = vec4(uStroke, 1.0 - q);
}
`

const MODE_INDEX: Record<RenderMode, number> = { photo: 0, edges: 1, posterize: 2 }

const hexToRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16)

  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
}

const compile = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Compilation du shader échouée : ${log}`)
  }

  return shader
}

export interface TraceRenderOptions {
  render: RenderMode
  params: RenderParams
  invert: boolean
  strokeColor: string
}

/**
 * Pilote le canvas de calque. Un seul par écran de travail.
 *
 * Le cycle de vie compte autant que le rendu : `dispose()` libère la texture, et la
 * perte de contexte est traitée — sans elle, le calque devient noir au retour d'un
 * appel téléphonique et ne revient jamais.
 */
export class TraceRenderer {
  private gl: WebGLRenderingContext | null = null
  private program: WebGLProgram | null = null
  private texture: WebGLTexture | null = null
  private buffer: WebGLBuffer | null = null
  private uniforms = new Map<string, WebGLUniformLocation | null>()

  private source: ImageBitmap | null = null
  private last: TraceRenderOptions | null = null
  private readonly listeners = new AbortController()

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener('webglcontextlost', (event) => {
      // Sans `preventDefault`, le navigateur ne tentera jamais de restaurer.
      event.preventDefault()
      this.gl = null
      this.program = null
      this.texture = null
    }, { signal: this.listeners.signal })

    canvas.addEventListener('webglcontextrestored', () => {
      this.init()
      if (this.source) this.setImage(this.source)
      if (this.last) this.render(this.last)
    }, { signal: this.listeners.signal })

    this.init()
  }

  private init() {
    /* `premultipliedAlpha: false` : le shader sort un alpha droit. Avec la valeur
       par défaut, les traits colorés seraient assombris par le compositeur.
       `preserveDrawingBuffer: false` laisse le pilote libérer le tampon entre deux
       rendus — on ne relit jamais le canvas. */
    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    })

    if (!gl) throw new Error('WebGL indisponible sur cet appareil.')

    const program = gl.createProgram()!
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC)

    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Édition de liens du programme échouée : ${gl.getProgramInfoLog(program)}`)
    }

    // Les shaders sont référencés par le programme : les objets peuvent partir.
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

    const aPos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    gl.useProgram(program)

    this.uniforms = new Map(
      ['uImage', 'uTexel', 'uMode', 'uContrast', 'uGamma', 'uThreshold', 'uLevels', 'uInvert', 'uStroke']
        .map(name => [name, gl.getUniformLocation(program, name)]),
    )

    this.gl = gl
    this.program = program
    this.buffer = buffer
  }

  /** Téléverse la photo. Le canvas prend la définition de l'image. */
  setImage(bitmap: ImageBitmap) {
    const { gl } = this
    if (!gl) return

    this.source = bitmap
    this.canvas.width = bitmap.width
    this.canvas.height = bitmap.height

    this.texture ??= gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)

    /* `CLAMP_TO_EDGE` + `LINEAR` sans mipmap : obligatoire en WebGL 1 pour une
       texture dont les côtés ne sont pas des puissances de deux, ce qui est le cas
       de toute photo. Le répétitif ferait par ailleurs déborder le Sobel d'un bord
       à l'autre de l'image. */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
  }

  render(options: TraceRenderOptions) {
    this.last = options

    const { gl } = this
    if (!gl || !this.program || !this.texture) return

    const u = (name: string) => this.uniforms.get(name) ?? null
    const { params } = options

    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.uniform1i(u('uImage'), 0)

    gl.uniform2f(u('uTexel'), 1 / this.canvas.width, 1 / this.canvas.height)
    gl.uniform1i(u('uMode'), MODE_INDEX[options.render])
    gl.uniform1f(u('uContrast'), params.contrast)
    gl.uniform1f(u('uGamma'), params.gamma)
    gl.uniform1f(u('uThreshold'), params.threshold)
    gl.uniform1f(u('uLevels'), params.levels)
    gl.uniform1f(u('uInvert'), options.invert ? 1 : 0)
    gl.uniform3fv(u('uStroke'), hexToRgb(options.strokeColor))

    // Un seul triangle qui déborde du cadre plutôt que deux : moins de sommets, et
    // aucune couture sur la diagonale.
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose() {
    this.listeners.abort()

    const { gl } = this
    if (gl) {
      gl.deleteTexture(this.texture)
      gl.deleteBuffer(this.buffer)
      gl.deleteProgram(this.program)
      // Rend la mémoire GPU tout de suite au lieu d'attendre le ramasse-miettes,
      // qui peut tarder plusieurs secondes sur un contexte de 2000 × 2000.
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }

    this.source?.close()
    this.source = null
    this.gl = null
  }
}
