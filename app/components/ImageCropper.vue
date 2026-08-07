<script lang="ts">
// ── Crop geometry ───────────────────────────────────────────────────────────
// These live in a plain <script> block (not <script setup>) on purpose: they are
// exported so the maths can be unit-tested on its own. A bug here doesn't throw,
// it silently ships product photos with empty corners, so it needs to be provable
// rather than "looks right in the browser".

/**
 * The storefront renders every product photo in a frame with Tailwind's
 * `aspect-[5/4]` — see the `.card-image` div in
 * app/components/products/ProductCard.vue. The editor crops to exactly that
 * shape so what the owner frames inside the grid is what the card shows.
 * Change the card frame → change this one constant.
 */
export const CROP_ASPECT_W = 5
export const CROP_ASPECT_H = 4
export const CROP_ASPECT = CROP_ASPECT_W / CROP_ASPECT_H

/** Longest exported edge. Mirrors MAX_EDGE in server/api/admin/upload.post.ts —
 *  anything bigger is thrown away by the server's resize anyway. */
export const MAX_EXPORT_EDGE = 1600

export interface CropGeometry {
  /** Source image size in its own pixels. */
  imageW: number
  imageH: number
  /** Crop window size, in whatever units the offsets are expressed in. */
  cropW: number
  cropH: number
  /** Image rotation in radians. */
  angle: number
}

/**
 * The image is drawn as: q = R(angle) · (scale · p) + offset, where `p` is a
 * point relative to the image centre and `q` is relative to the crop-window
 * centre. Pushing the four crop corners back through that transform gives the
 * two containment constraints used everywhere below:
 *
 *   |A| + cropHalfW·|cos| + cropHalfH·|sin| ≤ scale · imageW / 2
 *   |B| + cropHalfW·|sin| + cropHalfH·|cos| ≤ scale · imageH / 2
 *
 * with (A, B) = R(-angle) · (-offset), i.e. the offset expressed in the image's
 * own (rotated) frame. Because A and B are independent, clamping is exact —
 * no iterative fitting.
 */
function axisSpans(g: CropGeometry) {
  const c = Math.abs(Math.cos(g.angle))
  const s = Math.abs(Math.sin(g.angle))
  const hw = g.cropW / 2
  const hh = g.cropH / 2
  return { spanX: hw * c + hh * s, spanY: hw * s + hh * c }
}

/** Smallest scale at which the rotated image still fully covers the crop rect. */
export function minCoverScale(g: CropGeometry): number {
  if (!(g.imageW > 0) || !(g.imageH > 0)) return 1
  const { spanX, spanY } = axisSpans(g)
  return Math.max(spanX / (g.imageW / 2), spanY / (g.imageH / 2))
}

/**
 * Largest scale at which the whole rotated image still fits INSIDE the crop
 * rect — the "contain" counterpart of minCoverScale.
 *
 * The editor deliberately allows zooming out this far, past the point where the
 * photo stops covering the frame. Product shots are taken on black and the card
 * frame is black too, so the letterboxed area blends in and the owner can keep
 * a whole piece in shot instead of being forced to crop into it.
 */
export function maxContainScale(g: CropGeometry): number {
  if (!(g.imageW > 0) || !(g.imageH > 0)) return 1
  const c = Math.abs(Math.cos(g.angle))
  const s = Math.abs(Math.sin(g.angle))
  // Bounding box of the rotated image must fit within the crop rect.
  const rotW = g.imageW * c + g.imageH * s
  const rotH = g.imageW * s + g.imageH * c
  return Math.min(g.cropW / rotW, g.cropH / rotH)
}

/** How far the image may travel along its own axes before a gap opens up. */
export function offsetLimits(g: CropGeometry, scale: number): { x: number; y: number } {
  const { spanX, spanY } = axisSpans(g)
  return {
    x: Math.max(0, (scale * g.imageW) / 2 - spanX),
    y: Math.max(0, (scale * g.imageH) / 2 - spanY),
  }
}

function clampTo(v: number, limit: number): number {
  return v < -limit ? -limit : v > limit ? limit : v
}

/** Nearest offset to (tx, ty) that keeps the crop rect fully covered. */
export function clampOffset(
  g: CropGeometry,
  scale: number,
  tx: number,
  ty: number,
): { x: number; y: number } {
  const cos = Math.cos(g.angle)
  const sin = Math.sin(g.angle)
  const lim = offsetLimits(g, scale)
  // (A, B) = R(-angle) · (-offset)
  const A = clampTo(-tx * cos - ty * sin, lim.x)
  const B = clampTo(tx * sin - ty * cos, lim.y)
  // …and back: -offset = R(angle) · (A, B)
  return { x: -(A * cos - B * sin), y: -(A * sin + B * cos) }
}

/** True when the crop rect contains no empty space. */
export function isCropCovered(
  g: CropGeometry,
  scale: number,
  tx: number,
  ty: number,
  eps = 1e-6,
): boolean {
  const cos = Math.cos(g.angle)
  const sin = Math.sin(g.angle)
  const { spanX, spanY } = axisSpans(g)
  const a = -tx
  const b = -ty
  const reachX = Math.abs(a * cos + b * sin) + spanX
  const reachY = Math.abs(-a * sin + b * cos) + spanY
  return reachX <= (scale * g.imageW) / 2 + eps && reachY <= (scale * g.imageH) / 2 + eps
}

/**
 * Output pixel size. `cropW / scale` is exactly how many source pixels the crop
 * window spans, so using it as the ceiling means we never upscale; the long edge
 * is then capped at `maxEdge`.
 */
export function exportSize(
  cropW: number,
  scale: number,
  maxEdge = MAX_EXPORT_EDGE,
): { width: number; height: number } {
  const naturalW = cropW / scale
  const naturalH = naturalW / CROP_ASPECT
  const longest = Math.max(naturalW, naturalH)
  const factor = longest > maxEdge ? maxEdge / longest : 1
  return {
    width: Math.max(1, Math.round(naturalW * factor)),
    height: Math.max(1, Math.round(naturalH * factor)),
  }
}
</script>

<script setup lang="ts">
export interface CropperResult {
  blob: Blob
  /** Object URL for the result — the CONSUMER owns it and must revoke it. */
  previewUrl: string
  fileName: string
  sourceFile: File
  index: number
}

const props = withDefaults(
  defineProps<{
    /** Files to edit, one after another. */
    files: File[]
    title?: string
  }>(),
  { title: 'Úprava fotky' },
)

const emit = defineEmits<{
  apply: [result: CropperResult]
  skip: [index: number]
  close: []
}>()

const MAX_ZOOM = 6
const FINE_ANGLE_LIMIT = 45 // degrees each way
// Re-exposed as a setup binding so the template can render it (module-scope
// consts from the plain <script> block aren't part of the render context).
const aspectLabel = `${CROP_ASPECT_W}:${CROP_ASPECT_H}`

// ── Element refs ────────────────────────────────────────────────────────────
const panelEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

// ── Editing state ───────────────────────────────────────────────────────────
const index = ref(0)
const loading = ref(false)
const busy = ref(false)
const errorMsg = ref('')

const source = shallowRef<ImageBitmap | HTMLImageElement | null>(null)
const natW = ref(0)
const natH = ref(0)

const zoom = ref(1) // multiplier over the "just covers" scale
const quarterTurns = ref(0) // 0..3, the 90° buttons
const fineAngle = ref(0) // degrees, the fine slider
const tx = ref(0)
const ty = ref(0)

const stageW = ref(0)
const stageH = ref(0)

const currentFile = computed<File | null>(() => props.files[index.value] ?? null)
const total = computed(() => props.files.length)

const angle = computed(() => ((quarterTurns.value * 90 + fineAngle.value) * Math.PI) / 180)

// Crop window, sized to fill the stage with a little breathing room so the
// dimmed surroundings stay visible.
const STAGE_PADDING = 26
const cropW = computed(() => {
  const availW = Math.max(0, stageW.value - STAGE_PADDING * 2)
  const availH = Math.max(0, stageH.value - STAGE_PADDING * 2)
  return Math.max(0, Math.min(availW, availH * CROP_ASPECT))
})
const cropH = computed(() => cropW.value / CROP_ASPECT)

const geometry = computed<CropGeometry>(() => ({
  imageW: natW.value,
  imageH: natH.value,
  cropW: cropW.value,
  cropH: cropH.value,
  angle: angle.value,
}))
const coverScale = computed(() => minCoverScale(geometry.value))
const containScale = computed(() => maxContainScale(geometry.value))
// `zoom` is a multiplier over "just covers". 1 means the frame is exactly
// filled; anything below that letterboxes, down to the whole photo fitting.
const MIN_ZOOM = computed(() =>
  coverScale.value > 0 ? Math.min(1, containScale.value / coverScale.value) : 1,
)
const scale = computed(() => coverScale.value * zoom.value)

const isReady = computed(() => !!source.value && cropW.value > 0)

// ── Transform helpers ───────────────────────────────────────────────────────
function reclamp() {
  if (!isReady.value) return
  const next = clampOffset(geometry.value, scale.value, tx.value, ty.value)
  tx.value = next.x
  ty.value = next.y
}

function panBy(dx: number, dy: number) {
  if (!isReady.value) return
  const next = clampOffset(geometry.value, scale.value, tx.value + dx, ty.value + dy)
  tx.value = next.x
  ty.value = next.y
}

/** Zoom by `ratio` while keeping the image point under `anchor` (stage-centre
 *  coordinates) stationary. */
function zoomAt(anchor: { x: number; y: number }, ratio: number) {
  if (!isReady.value) return
  const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM.value, zoom.value * ratio))
  const applied = target / zoom.value
  if (applied === 1) return
  zoom.value = target
  const nx = anchor.x - applied * (anchor.x - tx.value)
  const ny = anchor.y - applied * (anchor.y - ty.value)
  const next = clampOffset(geometry.value, scale.value, nx, ny)
  tx.value = next.x
  ty.value = next.y
}

function resetTransform() {
  // Start at "whole image visible" rather than "frame filled": the owner asked
  // to be able to fit a complete piece into the card, and starting zoomed in
  // means every upload begins by hiding part of the photo.
  zoom.value = MIN_ZOOM.value
  quarterTurns.value = 0
  fineAngle.value = 0
  tx.value = 0
  ty.value = 0
}

function rotateQuarter(dir: 1 | -1) {
  quarterTurns.value = (quarterTurns.value + dir + 4) % 4
  reclamp()
}

// Any change to zoom or rotation can open a gap — always re-clamp.
watch([scale, angle], reclamp)
// The zoom floor depends on the crop window, which is only known once the stage
// has been measured, and on the rotation. Without this, an image reset before
// the first measure would keep a stale floor of 1 and could not be zoomed out.
watch(MIN_ZOOM, (min) => {
  if (zoom.value < min) zoom.value = min
  else if (zoom.value > MAX_ZOOM) zoom.value = MAX_ZOOM
})
// The offsets live in stage pixels, so a resize (or a tablet being rotated)
// would otherwise shift the framing. Rescale them with the crop window.
watch(cropW, (next, prev) => {
  if (prev && prev > 0 && next > 0) {
    const ratio = next / prev
    tx.value *= ratio
    ty.value *= ratio
  }
  reclamp()
})

// ── Loading the source image ────────────────────────────────────────────────
function releaseSource() {
  const s = source.value
  if (s && typeof ImageBitmap !== 'undefined' && s instanceof ImageBitmap) s.close()
  source.value = null
}

/**
 * createImageBitmap is preferred because `imageOrientation: 'from-image'` bakes
 * EXIF rotation into the bitmap. With a plain <img> the browsers disagree about
 * whether naturalWidth is the pre- or post-rotation size, which silently flips
 * the crop on phone photos.
 */
async function decodeFile(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Older Safari rejects the options bag — fall through to <img>.
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const el = new Image()
    el.onload = () => {
      URL.revokeObjectURL(url)
      resolve(el)
    }
    el.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode failed'))
    }
    el.src = url
  })
}

// Guards against a slow decode of image #1 landing after the user already moved
// to image #2.
let loadToken = 0

async function loadCurrent() {
  const file = currentFile.value
  releaseSource()
  natW.value = 0
  natH.value = 0
  resetTransform()
  if (!file) return
  loading.value = true
  errorMsg.value = ''
  const token = ++loadToken
  try {
    const decoded = await decodeFile(file)
    if (token !== loadToken) {
      if (typeof ImageBitmap !== 'undefined' && decoded instanceof ImageBitmap) decoded.close()
      return
    }
    natW.value = decoded instanceof HTMLImageElement ? decoded.naturalWidth : decoded.width
    natH.value = decoded instanceof HTMLImageElement ? decoded.naturalHeight : decoded.height
    source.value = decoded
    resetTransform()
  } catch {
    if (token === loadToken) errorMsg.value = 'Obrázek se nepodařilo načíst.'
  } finally {
    if (token === loadToken) loading.value = false
  }
}

watch(() => [props.files, index.value] as const, loadCurrent, { immediate: false })

// ── Painting ────────────────────────────────────────────────────────────────
let rafId = 0
function schedulePaint() {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    paint()
  })
}

function paint() {
  const cv = canvasEl.value
  const w = stageW.value
  const h = stageH.value
  if (!cv || w <= 0 || h <= 0) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const pw = Math.round(w * dpr)
  const ph = Math.round(h * dpr)
  if (cv.width !== pw) cv.width = pw
  if (cv.height !== ph) cv.height = ph
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const img = source.value
  if (!img || !natW.value || !natH.value) return
  // Paint the crop window black BEFORE the photo. Zooming out past "covers" is
  // allowed, so the frame can legitimately contain empty space — and the export
  // fills that with black. Showing the same black here means the preview is an
  // honest picture of the result rather than the stage backdrop showing through.
  ctx.fillStyle = '#000000'
  ctx.fillRect((w - cropW.value) / 2, (h - cropH.value) / 2, cropW.value, cropH.value)
  ctx.save()
  // Stage centre == crop-window centre, which is the origin of the transform.
  ctx.translate(w / 2 + tx.value, h / 2 + ty.value)
  ctx.rotate(angle.value)
  ctx.scale(scale.value, scale.value)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, -natW.value / 2, -natH.value / 2, natW.value, natH.value)
  ctx.restore()
}

watchEffect(() => {
  // Read every dependency so any state change repaints on the next frame.
  void [stageW.value, stageH.value, tx.value, ty.value, scale.value, angle.value, source.value]
  schedulePaint()
})

// ── Pointer input (mouse, touch, pen) ───────────────────────────────────────
const pointers = new Map<number, { x: number; y: number }>()

function stagePoint(e: PointerEvent | WheelEvent): { x: number; y: number } {
  const rect = stageEl.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return { x: e.clientX - (rect.left + rect.width / 2), y: e.clientY - (rect.top + rect.height / 2) }
}

function onPointerDown(e: PointerEvent) {
  if (!isReady.value) return
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  pointers.set(e.pointerId, stagePoint(e))
}

function onPointerMove(e: PointerEvent) {
  const prev = pointers.get(e.pointerId)
  if (!prev) return
  const cur = stagePoint(e)
  if (pointers.size === 1) {
    pointers.set(e.pointerId, cur)
    panBy(cur.x - prev.x, cur.y - prev.y)
    return
  }
  // Two fingers: pinch-zoom around the midpoint, and pan by how the midpoint moved.
  const otherId = [...pointers.keys()].find((id) => id !== e.pointerId)
  if (otherId === undefined) {
    pointers.set(e.pointerId, cur)
    return
  }
  const other = pointers.get(otherId)!
  const prevDist = Math.hypot(prev.x - other.x, prev.y - other.y)
  const prevMid = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 }
  pointers.set(e.pointerId, cur)
  const nextDist = Math.hypot(cur.x - other.x, cur.y - other.y)
  const nextMid = { x: (cur.x + other.x) / 2, y: (cur.y + other.y) / 2 }
  if (prevDist > 0 && nextDist > 0) zoomAt(nextMid, nextDist / prevDist)
  panBy(nextMid.x - prevMid.x, nextMid.y - prevMid.y)
}

function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  } catch {
    // pointercancel can fire after the capture is already gone — nothing to do.
  }
}

function onWheel(e: WheelEvent) {
  if (!isReady.value) return
  zoomAt(stagePoint(e), Math.exp(-e.deltaY * 0.0015))
}

// ── Keyboard ────────────────────────────────────────────────────────────────
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableNodes(): HTMLElement[] {
  const root = panelEl.value
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    cancelAll()
    return
  }
  if (e.key === 'Tab') {
    const nodes = focusableNodes()
    if (nodes.length === 0) return
    const first = nodes[0]!
    const last = nodes[nodes.length - 1]!
    const active = document.activeElement as HTMLElement | null
    if (e.shiftKey && (active === first || !panelEl.value?.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
    return
  }
  // Arrow keys nudge the photo — but not while a slider has focus, where the
  // browser's own arrow handling is what the user expects.
  const tag = (e.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  const step = e.shiftKey ? 24 : 6
  if (e.key === 'ArrowLeft') { e.preventDefault(); panBy(-step, 0) }
  else if (e.key === 'ArrowRight') { e.preventDefault(); panBy(step, 0) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); panBy(0, -step) }
  else if (e.key === 'ArrowDown') { e.preventDefault(); panBy(0, step) }
}

// ── Encoding ────────────────────────────────────────────────────────────────
let webpSupported: boolean | null = null
function canvasSupportsWebp(): boolean {
  if (webpSupported !== null) return webpSupported
  try {
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    webpSupported = probe.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    webpSupported = false
  }
  return webpSupported
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function encodeCanvas(canvas: HTMLCanvasElement): Promise<{ blob: Blob; ext: string }> {
  if (canvasSupportsWebp()) {
    // Double-check the produced type: some browsers advertise webp but hand back
    // a PNG, which would blow the 12 MB upload limit.
    const webp = await toBlob(canvas, 'image/webp', 0.92)
    if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp' }
  }
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.92)
  if (!jpeg) throw new Error('encode failed')
  return { blob: jpeg, ext: 'jpg' }
}

function baseName(name: string): string {
  const cleaned = name.replace(/\.[^./\\]+$/, '').replace(/[^\w\-.]+/g, '-')
  return cleaned.slice(0, 60) || 'foto'
}

// ── Actions ─────────────────────────────────────────────────────────────────
function advance() {
  if (index.value + 1 < total.value) index.value += 1
  else emit('close')
}

async function applyCrop() {
  const img = source.value
  const file = currentFile.value
  if (!img || !file || !isReady.value || busy.value) return
  busy.value = true
  errorMsg.value = ''
  try {
    const { width, height } = exportSize(cropW.value, scale.value, MAX_EXPORT_EDGE)
    // Everything so far is in stage pixels; k converts to export pixels. Taking
    // the max of both axes matters: width/height are rounded to whole pixels
    // independently, so a single k derived from width alone can leave a
    // sub-pixel strip of the output outside the image.
    const k = Math.max(width / cropW.value, height / cropH.value)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    // Opaque backdrop: JPEG has no alpha, and this guarantees no transparent
    // fringe even if a rounding error leaves a sub-pixel sliver.
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)
    ctx.translate(width / 2 + tx.value * k, height / 2 + ty.value * k)
    ctx.rotate(angle.value)
    ctx.scale(scale.value * k, scale.value * k)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, -natW.value / 2, -natH.value / 2, natW.value, natH.value)

    const { blob, ext } = await encodeCanvas(canvas)
    emit('apply', {
      blob,
      previewUrl: URL.createObjectURL(blob),
      fileName: `${baseName(file.name)}.${ext}`,
      sourceFile: file,
      index: index.value,
    })
    advance()
  } catch {
    errorMsg.value = 'Výřez se nepodařilo vytvořit.'
  } finally {
    busy.value = false
  }
}

function skipCurrent() {
  emit('skip', index.value)
  advance()
}

function cancelAll() {
  emit('close')
}

// ── Lifecycle ───────────────────────────────────────────────────────────────
let resizeObserver: ResizeObserver | null = null
let previouslyFocused: HTMLElement | null = null

function measure() {
  const el = stageEl.value
  if (!el) return
  stageW.value = el.clientWidth
  stageH.value = el.clientHeight
}

onMounted(async () => {
  previouslyFocused = document.activeElement as HTMLElement | null
  await nextTick()
  measure()
  if (stageEl.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(stageEl.value)
  } else {
    window.addEventListener('resize', measure)
  }
  await loadCurrent()
  panelEl.value?.focus()
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  resizeObserver?.disconnect()
  window.removeEventListener('resize', measure)
  releaseSource()
  pointers.clear()
  // Give focus back to whatever opened the editor.
  previouslyFocused?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <div class="cropper-overlay" @keydown="onKeydown">
      <div
        ref="panelEl"
        class="admin-modal cropper-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Úprava fotky produktu"
        tabindex="-1"
      >
        <div class="modal-header">
          <h3 class="modal-title">
            {{ props.title }}
            <span v-if="total > 1" class="cr-counter">{{ index + 1 }} z {{ total }}</span>
          </h3>
          <button type="button" class="modal-close" aria-label="Zavřít" @click="cancelAll">
            <Icon name="lucide:x" height="18" />
          </button>
        </div>

        <div class="cropper-body">
          <p class="cr-hint">
            Táhni fotkou (myší nebo prstem), kolečkem nebo posuvníkem přiblížíš.
            Co zůstane uvnitř rámečku, to uvidí zákazník na kartě produktu.
          </p>

          <div
            ref="stageEl"
            class="cr-stage"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @wheel.prevent="onWheel"
          >
            <canvas ref="canvasEl" class="cr-canvas" />

            <!-- Crop frame: bright solid border = the cut line, thirds = guides -->
            <div
              class="cr-window"
              :style="{ width: cropW + 'px', height: cropH + 'px' }"
              aria-hidden="true"
            >
              <span class="cr-grid-line cr-v1" />
              <span class="cr-grid-line cr-v2" />
              <span class="cr-grid-line cr-h1" />
              <span class="cr-grid-line cr-h2" />
              <span class="cr-ratio">{{ aspectLabel }}</span>
            </div>

            <div v-if="loading" class="cr-status">
              <Icon name="lucide:loader-2" height="20" class="spin" /> Načítání fotky…
            </div>
          </div>

          <div class="cr-controls">
            <div class="cr-control">
              <label class="cr-label" for="cr-zoom">Přiblížení</label>
              <div class="cr-slider-row">
                <Icon name="lucide:zoom-out" height="14" />
                <input
                  id="cr-zoom"
                  v-model.number="zoom"
                  class="cr-range"
                  type="range"
                  :min="MIN_ZOOM"
                  :max="MAX_ZOOM"
                  step="0.01"
                  :disabled="!isReady"
                />
                <Icon name="lucide:zoom-in" height="14" />
                <span class="cr-value">{{ zoom.toFixed(1) }}×</span>
              </div>
            </div>

            <div class="cr-control">
              <label class="cr-label" for="cr-angle">Jemné natočení</label>
              <div class="cr-slider-row">
                <input
                  id="cr-angle"
                  v-model.number="fineAngle"
                  class="cr-range"
                  type="range"
                  :min="-FINE_ANGLE_LIMIT"
                  :max="FINE_ANGLE_LIMIT"
                  step="0.5"
                  :disabled="!isReady"
                />
                <span class="cr-value">{{ fineAngle.toFixed(1) }}°</span>
              </div>
            </div>

            <div class="cr-buttons">
              <button type="button" class="cr-tool" :disabled="!isReady" @click="rotateQuarter(-1)">
                <Icon name="lucide:rotate-ccw" height="14" /> Otočit doleva
              </button>
              <button type="button" class="cr-tool" :disabled="!isReady" @click="rotateQuarter(1)">
                <Icon name="lucide:rotate-cw" height="14" /> Otočit doprava
              </button>
              <button type="button" class="cr-tool" :disabled="!isReady" @click="resetTransform">
                <Icon name="lucide:refresh-ccw" height="14" /> Obnovit
              </button>
            </div>
          </div>

          <p v-if="errorMsg" class="cr-error">{{ errorMsg }}</p>

          <div class="modal-footer cr-footer">
            <button type="button" class="btn-ghost" @click="cancelAll">Zrušit</button>
            <button
              v-if="total > 1"
              type="button"
              class="btn-ghost"
              :disabled="busy"
              @click="skipCurrent"
            >
              Přeskočit
            </button>
            <button type="button" class="btn-primary" :disabled="!isReady || busy" @click="applyCrop">
              <Icon v-if="busy" name="lucide:loader-2" height="14" class="spin" />
              Použít
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ══════════════════════════════════════════════════════════════════════════
   The editor renders inside .admin-modal, so its chrome follows the ADMIN
   palette (--adx-*, declared globally in app/layouts/admin.vue) and not the
   storefront's --pop-* tokens: the modal sheet is #FFFFFF in light and #2B1E3F
   in dark, which is why every hardcoded ink below had to move onto a token —
   #14231a on a #2B1E3F sheet is unreadable.

   The exceptions are everything that lands ON THE PHOTO — the stage, the crop
   frame, the thirds guides, the ratio badge, the loading veil. Those are dark
   with light markings in both themes on purpose: they sit over the picture,
   not over the sheet, and the picture does not change with the theme.
   ══════════════════════════════════════════════════════════════════════════ */

/* Sits above the product modal (.admin-modal-overlay is z-index 200). */
.cropper-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  /* No --adx token holds a scrim; 55% green ink over the violet ground barely
     separates the editor from the page behind it, so dark mode goes deeper. */
  background: rgba(20, 35, 26, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
@supports (color: light-dark(#fff, #000)) {
  .cropper-overlay { background: light-dark(rgba(20, 35, 26, 0.55), rgba(9, 5, 17, 0.66)); }
}
.cropper-panel {
  max-width: 860px;
  outline: none;
}
.cropper-body { padding: 1.1rem 1.4rem 1.3rem; }

.cr-counter {
  margin-left: 0.5rem;
  font-family: var(--font-body), sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--adx-accent, #b3324c);
  background: var(--adx-accent-10, rgba(179, 50, 76, 0.1));
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  vertical-align: middle;
}

.cr-hint {
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
  line-height: 1.45;
  /* --adx-label is the modal's muted-text token (0.65 ink, where this was 0.60
     — the same green ink, five points apart). */
  color: var(--adx-label, rgba(20, 35, 26, 0.65));
}

/* ── Stage ── */
.cr-stage {
  position: relative;
  width: 100%;
  height: min(46vh, 380px);
  min-height: 220px;
  border-radius: 12px;
  overflow: hidden;
  /* Deliberately NOT tokenised: this is the surround for a photograph, and the
     canvas paints the crop window itself black to match the exported file. A
     stage that lightened in one theme would misrepresent the result. */
  background: #14231a;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.cr-stage:active { cursor: grabbing; }
.cr-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

/* Everything from here to .cr-status lies OVER THE PHOTO, inside the black
   stage — white cut line, white thirds, a dark chip for the ratio, a dark veil
   while decoding. All constant in both themes by design: they have to read
   against the picture, which does not know what a theme is. */
.cr-window {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  border: 2px solid #ffffff;
  border-radius: 3px;
  /* Everything outside the crop is dimmed by this one giant shadow. */
  box-shadow: 0 0 0 9999px rgba(10, 18, 13, 0.62), 0 0 0 3px rgba(179, 50, 76, 0.9);
}
.cr-grid-line {
  position: absolute;
  background: rgba(255, 255, 255, 0.32);
}
.cr-v1, .cr-v2 { top: 0; bottom: 0; width: 1px; }
.cr-v1 { left: 33.333%; }
.cr-v2 { left: 66.666%; }
.cr-h1, .cr-h2 { left: 0; right: 0; height: 1px; }
.cr-h1 { top: 33.333%; }
.cr-h2 { top: 66.666%; }

.cr-ratio {
  position: absolute;
  right: 4px;
  bottom: 4px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.75);
  background: rgba(10, 18, 13, 0.5);
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
}

.cr-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.85rem;
  background: rgba(20, 35, 26, 0.6);
}

/* ── Controls ── */
.cr-controls {
  margin-top: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.cr-control { display: flex; flex-direction: column; gap: 0.3rem; }
/* Same token as .admin-modal .form-label — this control block is a sibling of
   the modal's own form rows and now matches them exactly. */
.cr-label {
  font-size: 0.66rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--adx-label, rgba(20, 35, 26, 0.65));
}
.cr-slider-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  /* Zoom glyphs — the modal's muted-icon token (0.55 where this was 0.50). */
  color: var(--adx-icon-mute, rgba(20, 35, 26, 0.55));
}
.cr-range {
  flex: 1;
  accent-color: var(--adx-accent, #b3324c);
  height: 22px;
  cursor: pointer;
}
.cr-range:disabled { opacity: 0.45; cursor: default; }
.cr-value {
  min-width: 3.2rem;
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.78rem;
  color: var(--adx-label, rgba(20, 35, 26, 0.65));
}

.cr-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.cr-tool {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.8rem;
  background: var(--adx-surface-2, #FAF1F4);
  border: 1px solid var(--adx-line-field, rgba(20, 35, 26, 0.15));
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--adx-ink, #14231a);
  transition: all 0.15s ease;
}
.cr-tool:hover:not(:disabled) {
  border-color: var(--adx-accent, #b3324c);
  color: var(--adx-accent, #b3324c);
  background: var(--adx-accent-06, rgba(179, 50, 76, 0.06));
}
.cr-tool:disabled { opacity: 0.5; cursor: default; }

.cr-error {
  margin: 0.6rem 0 0;
  color: var(--adx-accent, #b3324c);
  font-size: 0.82rem;
  font-style: italic;
}

.cr-footer { margin-top: 1rem; }

.spin { animation: cr-spin 0.8s linear infinite; }
@keyframes cr-spin { to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .cropper-overlay { padding: 0.5rem; }
  .cropper-body { padding: 0.9rem 1rem 1.1rem; }
  .cr-stage { height: min(42vh, 300px); }
  .cr-footer .btn-primary,
  .cr-footer .btn-ghost { flex: 1; justify-content: center; }
}
</style>
