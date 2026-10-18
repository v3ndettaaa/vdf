/**
 * Display / render DPI helpers.
 *
 * The PDF point grid is 72 DPI, so a page rendered at `scale = 1` maps one
 * PDF point to one CSS pixel. `targetDPI` is the user-facing render
 * resolution; the backing-store multiplier over CSS pixels is therefore
 * `targetDPI / 72`. When unset it falls back to the physical system DPI
 * (72 * devicePixelRatio), which keeps HiDPI displays native.
 */

export const BASE_PDF_DPI = 72;

/**
 * Maximum canvas backing-store dimension, capped to protect VRAM.
 * 6144 keeps pages sharp to ~5x zoom on HiDPI displays; beyond the cap the
 * browser upscales, which is where visible aliasing would begin.
 */
export const MAX_RENDER_DIMENSION = 6144;

/**
 * Adaptive interactive canvas dimension ceiling (4096px GPU texture limit) and
 * area budget (~9.4 megapixels = 3072x3072) so integrated GPUs and Linux
 * WebKitGTK never stall or OOM when allocating page backing stores.
 */
export const ADAPTIVE_CANVAS_MAX_DIMENSION = 2048;
export const ADAPTIVE_CANVAS_MAX_PIXELS = 2048 * 2048;

export function getDevicePixelRatio(): number {
  if (typeof window !== 'undefined' && window.devicePixelRatio) {
    return window.devicePixelRatio;
  }
  return 1;
}

/** Physical system DPI inferred from the display's device pixel ratio. */
export function getSystemDpi(): number {
  return Math.round(BASE_PDF_DPI * getDevicePixelRatio());
}

/**
 * Backing-store pixels per CSS pixel for a given target DPI.
 * Defaults to the system DPI when `targetDPI` is missing/invalid.
 */
export function resolveRenderDpr(targetDPI?: number): number {
  const dpi = typeof targetDPI === 'number' && Number.isFinite(targetDPI) && targetDPI > 0
    ? targetDPI
    : getSystemDpi();
  return dpi / BASE_PDF_DPI;
}

export function resolveAnnotationDpr(targetDPI?: number): number {
  return Math.max(2, getDevicePixelRatio(), resolveRenderDpr(targetDPI));
}

/**
 * Clamp a backing-store multiplier so neither canvas dimension exceeds
 * `maxDimension` (defaults to `MAX_RENDER_DIMENSION`). CSS size is unaffected;
 * the browser upscales.
 */
export function clampRenderMultiplier(
  cssWidth: number,
  cssHeight: number,
  multiplier: number,
  maxDimension: number = MAX_RENDER_DIMENSION
): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return 1;
  const largest = Math.max(cssWidth * multiplier, cssHeight * multiplier);
  if (largest > maxDimension && largest > 0) {
    return multiplier * (maxDimension / largest);
  }
  return multiplier;
}

/**
 * Smart hardware-friendly backing-store multiplier for live interactive
 * canvases (annotations + scratchpad). Balances crisp 150–200 DPI rendering
 * with a strict 4K dimension/area cap so weak GPUs stay at a locked 60fps.
 */
export function resolveAdaptiveCanvasDpr(
  cssWidth: number,
  cssHeight: number,
  targetDPI?: number
): number {
  const rawDpr = Math.min(2.5, Math.max(1.5, getDevicePixelRatio(), resolveRenderDpr(targetDPI)));
  let mult = clampRenderMultiplier(cssWidth, cssHeight, rawDpr, ADAPTIVE_CANVAS_MAX_DIMENSION);
  const area = (cssWidth * mult) * (cssHeight * mult);
  if (area > ADAPTIVE_CANVAS_MAX_PIXELS && area > 0) {
    mult *= Math.sqrt(ADAPTIVE_CANVAS_MAX_PIXELS / area);
  }
  return mult;
}
