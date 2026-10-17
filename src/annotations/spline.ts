/**
 * High-Precision Ink & Spline Smoothing Engine
 * Generates organic, fluid, pressure-sensitive strokes using Centripetal Catmull-Rom splines.
 */

import { StrokePoint, Point } from '../core/types';

export interface CurveSegment {
  p0: StrokePoint;
  p1: StrokePoint;
  cp1: Point;
  cp2: Point;
  widthStart: number;
  widthEnd: number;
}

/**
 * Calculates stroke width dynamically from pressure, base width, and velocity.
 */
export function calculateStrokeWidth(
  baseWidth: number,
  pressure: number = 0.5,
  pressureCurve: 'linear' | 'soft' | 'firm' | 'exponential' = 'linear',
  pressureEnabled: boolean = true,
  strength: 'light' | 'balanced' | 'strong' = 'balanced'
): number {
  if (!pressureEnabled) {
    return baseWidth;
  }

  let mappedPressure = pressure;
  if (pressureCurve === 'soft') {
    mappedPressure = Math.sqrt(pressure);
  } else if (pressureCurve === 'firm') {
    mappedPressure = pressure * pressure;
  } else if (pressureCurve === 'exponential') {
    mappedPressure = Math.pow(pressure, 3);
  }

  let minFactor = 0.3;
  let maxFactor = 1.8;
  if (strength === 'light') {
    minFactor = 0.6;
    maxFactor = 1.4;
  } else if (strength === 'strong') {
    minFactor = 0.1;
    maxFactor = 2.4;
  }

  const factor = minFactor + (maxFactor - minFactor) * mappedPressure;
  return Math.max(0.5, baseWidth * factor);
}

/**
 * Filters micro-jitter, deduplicates overlapping sample points,
 * smoothes stylus pressure transitions, and applies a single-pass
 * sub-pixel tremor damper (< 0.20 pt max offset) so slow hand tremors
 * are absorbed without ever shifting or morphing corners across frames.
 */
export function smoothStrokePoints(
  points: StrokePoint[],
  smoothing: 'none' | 'subtle' | 'medium' | 'high' = 'medium'
): StrokePoint[] {
  if (points.length <= 2) return points;

  // 1. Filter out micro-jitter (< 0.18 page pts) while preserving fine handwriting at high zoom
  const minDistance = 0.18;
  const deduped: StrokePoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = deduped[deduped.length - 1];
    const dist = Math.hypot(points[i].x - last.x, points[i].y - last.y);
    if (dist >= minDistance) {
      deduped.push(points[i]);
    }
  }
  const lastInput = points[points.length - 1];
  const lastKept = deduped[deduped.length - 1];
  if (Math.hypot(lastInput.x - lastKept.x, lastInput.y - lastKept.y) >= 0.02 || deduped.length === 1) {
    deduped.push(lastInput);
  } else {
    deduped[deduped.length - 1] = lastInput;
  }

  if (deduped.length <= 2) return deduped;

  // 2. Smooth pressure with 5-point Gaussian kernel [0.06, 0.24, 0.40, 0.24, 0.06]
  // to prevent abrupt width bulges at corners
  const n = deduped.length;
  const smoothedPressure: StrokePoint[] = deduped.map((pt, i, arr) => {
    if (i === 0 || i === n - 1) return { ...pt };
    const pM2 = arr[Math.max(0, i - 2)].pressure ?? 0.5;
    const pM1 = arr[Math.max(0, i - 1)].pressure ?? 0.5;
    const p0 = pt.pressure ?? 0.5;
    const pP1 = arr[Math.min(n - 1, i + 1)].pressure ?? 0.5;
    const pP2 = arr[Math.min(n - 1, i + 2)].pressure ?? 0.5;
    const p = pM2 * 0.06 + pM1 * 0.24 + p0 * 0.40 + pP1 * 0.24 + pP2 * 0.06;
    return { ...pt, pressure: p };
  });

  if (smoothing === 'none') return smoothedPressure;

  // 3. Single-pass sub-pixel micro-tremor filter:
  // Strictly capped to <= 0.18 page points max displacement and active only on
  // very short slow-moving chords so fast strokes and turns never shift or morph
  // after being drawn on screen.
  const maxTremorOffset = smoothing === 'subtle' ? 0.10 : (smoothing === 'medium' ? 0.16 : 0.22);
  const weight = smoothing === 'subtle' ? 0.08 : (smoothing === 'medium' ? 0.12 : 0.16);

  const out: StrokePoint[] = [smoothedPressure[0]];
  for (let i = 1; i < smoothedPressure.length - 1; i++) {
    const prev = smoothedPressure[i - 1];
    const curr = smoothedPressure[i];
    const after = smoothedPressure[i + 1];

    const len1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const len2 = Math.hypot(after.x - curr.x, after.y - curr.y);
    const maxChord = Math.max(len1, len2);

    if (maxChord < 3.5 && len1 > 1e-4 && len2 > 1e-4) {
      const slowFactor = 1 - maxChord / 3.5;
      const midX = (prev.x + after.x) * 0.5;
      const midY = (prev.y + after.y) * 0.5;
      let dx = (midX - curr.x) * weight * slowFactor;
      let dy = (midY - curr.y) * weight * slowFactor;
      const shift = Math.hypot(dx, dy);
      if (shift > maxTremorOffset) {
        const scale = maxTremorOffset / shift;
        dx *= scale;
        dy *= scale;
      }
      out.push({
        ...curr,
        x: curr.x + dx,
        y: curr.y + dy
      });
    } else {
      out.push(curr);
    }
  }
  out.push(smoothedPressure[smoothedPressure.length - 1]);

  return out;
}

/**
 * Generates smooth G1-continuous Cubic Bezier curve segments from discrete sampled points.
 * Uses exact Barry-Goldman Centripetal Catmull-Rom tangents on gentle curves and inserts
 * local G1 tangential circular-arc fillets right at sharp direction changes so turns are
 * immediately round on the first frame they appear, without bending incoming segments or
 * pulling vertices away from the user's handwriting.
 */
export function generateSmoothSegments(
  points: StrokePoint[],
  baseWidth: number,
  pressureCurve: 'linear' | 'soft' | 'firm' | 'exponential' = 'linear',
  pressureEnabled: boolean = true,
  strength: 'light' | 'balanced' | 'strong' = 'balanced'
): CurveSegment[] {
  if (points.length < 2) return [];

  const segments: CurveSegment[] = [];

  if (points.length === 2) {
    const p0 = points[0];
    const p1 = points[1];
    const w0 = calculateStrokeWidth(baseWidth, p0.pressure, pressureCurve, pressureEnabled, strength);
    const w1 = calculateStrokeWidth(baseWidth, p1.pressure, pressureCurve, pressureEnabled, strength);
    segments.push({
      p0,
      p1,
      cp1: { x: (p0.x * 2 + p1.x) / 3, y: (p0.y * 2 + p1.y) / 3 },
      cp2: { x: (p0.x + p1.x * 2) / 3, y: (p0.y + p1.y * 2) / 3 },
      widthStart: w0,
      widthEnd: w1
    });
    return segments;
  }

  const alpha = 0.5;
  const count = points.length;
  const segChord = new Float64Array(count - 1);
  const segParam = new Float64Array(count - 1);
  const unitX = new Float64Array(count - 1);
  const unitY = new Float64Array(count - 1);
  const knotWidth = new Float64Array(count);

  for (let i = 0; i < count; i++) {
    knotWidth[i] = calculateStrokeWidth(baseWidth, points[i].pressure, pressureCurve, pressureEnabled, strength);
  }

  for (let i = 0; i < count - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const c = Math.hypot(dx, dy);
    segChord[i] = c;
    segParam[i] = Math.max(1e-3, Math.pow(c, alpha));
    if (c > 1e-6) {
      unitX[i] = dx / c;
      unitY[i] = dy / c;
    } else {
      unitX[i] = i > 0 ? unitX[i - 1] : 1;
      unitY[i] = i > 0 ? unitY[i - 1] : 0;
    }
  }

  const inAnchorX = new Float64Array(count);
  const inAnchorY = new Float64Array(count);
  const outAnchorX = new Float64Array(count);
  const outAnchorY = new Float64Array(count);
  const inDirX = new Float64Array(count);
  const inDirY = new Float64Array(count);
  const outDirX = new Float64Array(count);
  const outDirY = new Float64Array(count);
  const filletRadius = new Float64Array(count);

  // Maximum corner trim radius in page units: keeps the circular fillet midpoint
  // within ~0.35-0.55pt of the raw vertex (inside the pen tip cap) so the user
  // never perceives any shape alteration.
  const maxFilletR = Math.min(1.55, Math.max(0.75, baseWidth * 0.42));

  inAnchorX[0] = outAnchorX[0] = points[0].x;
  inAnchorY[0] = outAnchorY[0] = points[0].y;
  inDirX[0] = outDirX[0] = unitX[0];
  inDirY[0] = outDirY[0] = unitY[0];

  const lastIdx = count - 1;
  inAnchorX[lastIdx] = outAnchorX[lastIdx] = points[lastIdx].x;
  inAnchorY[lastIdx] = outAnchorY[lastIdx] = points[lastIdx].y;
  inDirX[lastIdx] = outDirX[lastIdx] = unitX[lastIdx - 1];
  inDirY[lastIdx] = outDirY[lastIdx] = unitY[lastIdx - 1];

  for (let i = 1; i < lastIdx; i++) {
    const ux = unitX[i - 1];
    const uy = unitY[i - 1];
    const vx = unitX[i];
    const vy = unitY[i];
    const len1 = segChord[i - 1];
    const len2 = segChord[i];

    const dPrev = segParam[i - 1];
    const dNext = segParam[i];
    const dSum = dPrev + dNext;

    // Barry-Goldman chord-weighted tangent vector, normalized so sharp turns never collapse handles
    let bgX = (dNext / dSum) * ux + (dPrev / dSum) * vx;
    let bgY = (dNext / dSum) * uy + (dPrev / dSum) * vy;
    const bgLen = Math.hypot(bgX, bgY);
    if (bgLen > 1e-5) {
      bgX /= bgLen;
      bgY /= bgLen;
    } else {
      bgX = -uy;
      bgY = ux;
    }

    const cosTheta = Math.max(-1, Math.min(1, ux * vx + uy * vy));
    const sharpness = (1 - cosTheta) * 0.5;

    // Activate local tangential fillet smoothly for turns > ~18 degrees (sharpness > 0.025)
    const tTurn = Math.min(1, Math.max(0, (sharpness - 0.025) / 0.22));
    const r = tTurn > 0 ? Math.min(len1 * 0.44, len2 * 0.44, maxFilletR) * tTurn : 0;
    filletRadius[i] = r;

    inAnchorX[i] = points[i].x - r * ux;
    inAnchorY[i] = points[i].y - r * uy;
    outAnchorX[i] = points[i].x + r * vx;
    outAnchorY[i] = points[i].y + r * vy;

    // Blend knot tangents from Barry-Goldman (on gentle curves) to exact leg directions
    // (on sharp turns) so incoming segments never swing sideways when a turn occurs.
    const idx = bgX * (1 - tTurn) + ux * tTurn;
    const idy = bgY * (1 - tTurn) + uy * tTurn;
    const ilen = Math.hypot(idx, idy);
    inDirX[i] = ilen > 1e-6 ? idx / ilen : ux;
    inDirY[i] = ilen > 1e-6 ? idy / ilen : uy;

    const odx = bgX * (1 - tTurn) + vx * tTurn;
    const ody = bgY * (1 - tTurn) + vy * tTurn;
    const olen = Math.hypot(odx, ody);
    outDirX[i] = olen > 1e-6 ? odx / olen : vx;
    outDirY[i] = olen > 1e-6 ? ody / olen : vy;
  }

  const KAPPA = 0.55228475;

  for (let i = 0; i < lastIdx; i++) {
    if (i > 0 && filletRadius[i] > 1e-3) {
      const r = filletRadius[i];
      const fStart: StrokePoint = {
        x: inAnchorX[i],
        y: inAnchorY[i],
        pressure: points[i].pressure
      };
      const fEnd: StrokePoint = {
        x: outAnchorX[i],
        y: outAnchorY[i],
        pressure: points[i].pressure
      };
      const handleLen = r * KAPPA;
      segments.push({
        p0: fStart,
        p1: fEnd,
        cp1: {
          x: fStart.x + inDirX[i] * handleLen,
          y: fStart.y + inDirY[i] * handleLen
        },
        cp2: {
          x: fEnd.x - outDirX[i] * handleLen,
          y: fEnd.y - outDirY[i] * handleLen
        },
        widthStart: knotWidth[i],
        widthEnd: knotWidth[i]
      });
    }

    const pStart: StrokePoint = {
      x: outAnchorX[i],
      y: outAnchorY[i],
      pressure: points[i].pressure
    };
    const pEnd: StrokePoint = {
      x: inAnchorX[i + 1],
      y: inAnchorY[i + 1],
      pressure: points[i + 1].pressure
    };

    const spanLen = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);
    if (spanLen < 1e-4) continue;

    const prevSpan = i > 0 ? segChord[i - 1] : spanLen;
    const nextSpan = i + 1 < lastIdx ? segChord[i + 1] : spanLen;
    const h1Len = Math.min(spanLen * 0.42, Math.min(spanLen, prevSpan * 1.35) / 3);
    const h2Len = Math.min(spanLen * 0.42, Math.min(spanLen, nextSpan * 1.35) / 3);

    segments.push({
      p0: pStart,
      p1: pEnd,
      cp1: {
        x: pStart.x + outDirX[i] * h1Len,
        y: pStart.y + outDirY[i] * h1Len
      },
      cp2: {
        x: pEnd.x - inDirX[i + 1] * h2Len,
        y: pEnd.y - inDirY[i + 1] * h2Len
      },
      widthStart: knotWidth[i],
      widthEnd: knotWidth[i + 1]
    });
  }

  return segments;
}

/**
 * Sub-pixel width floor for the ink ribbon. A stroke whose pressure/taper tail
 * drops below one device pixel rasterises as a broken line of grey dashes —
 * the "chalky" look — so the outline never narrows past this.
 */
const MIN_INK_WIDTH = 0.35;

/**
 * Half-width floor for a single point, so a tap still stamps a visible dot.
 */
const MIN_DOT_WIDTH = 1.0;

interface RibbonSample {
  x: number;
  y: number;
  w: number;
}

/**
 * Flattens the cubic segments into a polyline of centerline samples, each
 * carrying the interpolated stroke width at that parameter. Curvature-adaptive
 * sampling density ensures small handwriting and tight turns at 100%-800% zoom
 * remain mathematically smooth with zero polygonal faceting.
 */
function sampleRibbonCenterline(segments: CurveSegment[]): RibbonSample[] {
  const samples: RibbonSample[] = [];

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    const chord = Math.hypot(seg.p1.x - seg.p0.x, seg.p1.y - seg.p0.y);
    // Estimate control polygon excess to boost subdivision on curved segments
    const ctrlLen =
      Math.hypot(seg.cp1.x - seg.p0.x, seg.cp1.y - seg.p0.y) +
      Math.hypot(seg.cp2.x - seg.cp1.x, seg.cp2.y - seg.cp1.y) +
      Math.hypot(seg.p1.x - seg.cp2.x, seg.p1.y - seg.cp2.y);
    const curvatureBoost = Math.max(0, ctrlLen - chord) * 18;
    const steps = Math.max(12, Math.min(64, Math.ceil(chord * 3.5 + curvatureBoost)));
    // Skip the first sample of every segment after the first: it duplicates the
    // previous segment's endpoint and would produce a zero-length tangent.
    const from = s === 0 ? 0 : 1;

    for (let i = from; i <= steps; i++) {
      const t = i / steps;
      const it = 1 - t;
      const a = it * it * it;
      const b = 3 * it * it * t;
      const c = 3 * it * t * t;
      const d = t * t * t;
      // Smooth Hermite interpolation for width to avoid sharp width corners at knots
      const smoothT = t * t * (3 - 2 * t);
      samples.push({
        x: a * seg.p0.x + b * seg.cp1.x + c * seg.cp2.x + d * seg.p1.x,
        y: a * seg.p0.y + b * seg.cp1.y + c * seg.cp2.y + d * seg.p1.y,
        w: seg.widthStart + (seg.widthEnd - seg.widthStart) * smoothT
      });
    }
  }

  return samples;
}

/**
 * Emits a sampled round cap as line segments. The swept arc runs from the
 * ribbon's `n` edge, around the tip along `d`, to the opposite edge.
 */
function emitRoundCapToTarget(
  target: CanvasPath,
  cx: number,
  cy: number,
  half: number,
  nx: number,
  ny: number,
  dx: number,
  dy: number
): void {
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    target.lineTo(cx + half * (cos * nx + sin * dx), cy + half * (cos * ny + sin * dy));
  }
}

/**
 * Traces the closed variable-width ribbon outline onto any `CanvasPath`
 * (`CanvasRenderingContext2D` or `Path2D`) with normal-field smoothing
 * and inner-edge anti-pinch protection on tight turns.
 */
export function traceInkRibbonPath(target: CanvasPath, segments: CurveSegment[]): boolean {
  const samples = sampleRibbonCenterline(segments);
  if (samples.length === 0) return false;

  if (samples.length === 1) {
    const s = samples[0];
    target.arc(s.x, s.y, Math.max(MIN_DOT_WIDTH, s.w) / 2, 0, Math.PI * 2);
    return true;
  }

  const count = samples.length;
  const leftX = new Float64Array(count);
  const leftY = new Float64Array(count);
  const rightX = new Float64Array(count);
  const rightY = new Float64Array(count);
  const dirX = new Float64Array(count);
  const dirY = new Float64Array(count);

  for (let i = 0; i < count; i++) {
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(count - 1, i + 1)];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      dx = i > 0 ? dirX[i - 1] : 1;
      dy = i > 0 ? dirY[i - 1] : 0;
    } else {
      dx /= len;
      dy /= len;
    }
    dirX[i] = dx;
    dirY[i] = dy;
  }

  // Smooth the unit tangent/normal vectors across neighboring samples so rapid
  // curvature changes rotate the ribbon normal smoothly without sharp edge spikes
  if (count >= 4) {
    const tmpX = new Float64Array(count);
    const tmpY = new Float64Array(count);
    for (let pass = 0; pass < 2; pass++) {
      tmpX[0] = dirX[0];
      tmpY[0] = dirY[0];
      tmpX[count - 1] = dirX[count - 1];
      tmpY[count - 1] = dirY[count - 1];
      for (let i = 1; i < count - 1; i++) {
        const sx = dirX[i - 1] * 0.25 + dirX[i] * 0.5 + dirX[i + 1] * 0.25;
        const sy = dirY[i - 1] * 0.25 + dirY[i] * 0.5 + dirY[i + 1] * 0.25;
        const slen = Math.hypot(sx, sy);
        if (slen > 1e-6) {
          tmpX[i] = sx / slen;
          tmpY[i] = sy / slen;
        } else {
          tmpX[i] = dirX[i];
          tmpY[i] = dirY[i];
        }
      }
      dirX.set(tmpX);
      dirY.set(tmpY);
    }
  }

  for (let i = 0; i < count; i++) {
    const half = Math.max(MIN_INK_WIDTH, samples[i].w) / 2;
    const nx = -dirY[i];
    const ny = dirX[i];
    let lx = samples[i].x + nx * half;
    let ly = samples[i].y + ny * half;
    let rx = samples[i].x - nx * half;
    let ry = samples[i].y - ny * half;

    // Anti-pinch: when the radius of curvature is tighter than half the stroke width,
    // the inner offset edge can step backward against the stroke direction and form a
    // sharp protruding spike. Blend backward-stepping inner edges to keep turns round.
    if (i > 0) {
      const centerStep = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
      if (centerStep < half * 2.5) {
        const lDot = (lx - leftX[i - 1]) * dirX[i] + (ly - leftY[i - 1]) * dirY[i];
        if (lDot < 0) {
          lx = leftX[i - 1] * 0.75 + lx * 0.25;
          ly = leftY[i - 1] * 0.75 + ly * 0.25;
        }
        const rDot = (rx - rightX[i - 1]) * dirX[i] + (ry - rightY[i - 1]) * dirY[i];
        if (rDot < 0) {
          rx = rightX[i - 1] * 0.75 + rx * 0.25;
          ry = rightY[i - 1] * 0.75 + ry * 0.25;
        }
      }
    }

    leftX[i] = lx;
    leftY[i] = ly;
    rightX[i] = rx;
    rightY[i] = ry;
  }

  const last = count - 1;

  // Left edge, forward.
  target.moveTo(leftX[0], leftY[0]);
  for (let i = 1; i < count; i++) {
    target.lineTo(leftX[i], leftY[i]);
  }

  // End cap: left edge -> tip -> right edge.
  emitRoundCapToTarget(
    target,
    samples[last].x,
    samples[last].y,
    Math.max(MIN_INK_WIDTH, samples[last].w) / 2,
    -dirY[last],
    dirX[last],
    dirX[last],
    dirY[last]
  );

  // Right edge, backward.
  for (let i = last; i >= 0; i--) {
    target.lineTo(rightX[i], rightY[i]);
  }

  // Start cap: right edge -> tail -> left edge.
  emitRoundCapToTarget(
    target,
    samples[0].x,
    samples[0].y,
    Math.max(MIN_INK_WIDTH, samples[0].w) / 2,
    dirY[0],
    -dirX[0],
    -dirX[0],
    -dirY[0]
  );

  target.closePath();
  return true;
}

function buildInkRibbon(ctx: CanvasRenderingContext2D, segments: CurveSegment[]): boolean {
  ctx.beginPath();
  return traceInkRibbonPath(ctx, segments);
}

/**
 * Builds a reusable `Path2D` for a slice of stroke points. Used by `PenTool`
 * to freeze completed 48-point chunks of a long live stroke into O(1) GPU paths
 * and by `renderSmoothStroke` to cache committed annotations across repaints.
 */
export function buildInkRibbonPath2D(
  points: StrokePoint[],
  baseWidth: number,
  pressureCurve: 'linear' | 'soft' | 'firm' | 'exponential' = 'linear',
  pressureEnabled = true,
  strength: 'light' | 'balanced' | 'strong' = 'balanced'
): Path2D | null {
  if (typeof Path2D === 'undefined' || points.length === 0) return null;
  const path = new Path2D();
  if (points.length === 1) {
    const p = points[0];
    const w = calculateStrokeWidth(baseWidth, p.pressure, pressureCurve, pressureEnabled, strength);
    path.arc(p.x, p.y, Math.max(MIN_DOT_WIDTH, w) / 2, 0, Math.PI * 2);
    return path;
  }
  const segments = generateSmoothSegments(points, baseWidth, pressureCurve, pressureEnabled, strength);
  if (!traceInkRibbonPath(path, segments)) return null;
  return path;
}

interface CachedStrokePath {
  key: string;
  path: Path2D;
}

const committedStrokePathCache = new WeakMap<StrokePoint[], CachedStrokePath>();

function canUsePath2D(ctx: CanvasRenderingContext2D): boolean {
  return (
    typeof Path2D !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    ctx.canvas instanceof HTMLCanvasElement
  );
}

/**
 * Draws variable-width ink as a single filled ribbon. Shared by the committed
 * and live renderers so the preview and the final ink are identical.
 */
export function renderInkRibbon(
  ctx: CanvasRenderingContext2D,
  points: StrokePoint[],
  color: string,
  baseWidth: number,
  pressureCurve: 'linear' | 'soft' | 'firm' | 'exponential' = 'linear',
  pressureEnabled = true,
  strength: 'light' | 'balanced' | 'strong' = 'balanced'
): void {
  if (points.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = color;

  if (points.length === 1) {
    const p = points[0];
    const w = calculateStrokeWidth(baseWidth, p.pressure, pressureCurve, pressureEnabled, strength);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(MIN_DOT_WIDTH, w) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const segments = generateSmoothSegments(points, baseWidth, pressureCurve, pressureEnabled, strength);
  if (buildInkRibbon(ctx, segments)) {
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Normalizes a highlighter color to a translucent rgba string so text stays
 * legible. Solid hex picks from the toolbar (e.g. `#fef08a`) become
 * `rgba(..., 0.4)`; existing rgba colors keep their alpha (clamped).
 *
 * This matters because annotations live on their own transparent canvas
 * stacked above the PDF canvas — `multiply` cannot blend across separate
 * canvas elements, so translucency must come from alpha + `source-over`.
 */
export function normalizeHighlighterColor(color: string, alpha = 0.3): string {
  const c = color.trim();
  const clampedAlpha = Math.min(0.95, Math.max(0.05, alpha));
  const hexMatch = c.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex.split('').map(ch => ch + ch).join('');
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
  }
  const rgbaMatch = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (rgbaMatch) {
    const r = rgbaMatch[1];
    const g = rgbaMatch[2];
    const b = rgbaMatch[3];
    const a = rgbaMatch[4] !== undefined ? Math.min(0.95, Math.max(0.05, parseFloat(rgbaMatch[4]))) : clampedAlpha;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return c;
}

/**
 * Draws smooth stroke segments onto a canvas context with variable or uniform line width.
 * Uses a `WeakMap<StrokePoint[], Path2D>` cache on real canvases so repainting hundreds
 * of existing strokes during selection, eraser drags, or zoom takes O(1) time per stroke.
 */
export function renderSmoothStroke(
  ctx: CanvasRenderingContext2D,
  points: StrokePoint[],
  color: string,
  baseWidth: number,
  pressureCurve: 'linear' | 'soft' | 'firm' | 'exponential' = 'linear',
  isHighlighter = false,
  pressureEnabled = true,
  strength: 'light' | 'balanced' | 'strong' = 'balanced',
  tipShape: 'chisel' | 'round' = 'round',
  smoothing: 'none' | 'subtle' | 'medium' | 'high' = 'medium'
): void {
  if (points.length === 0) return;

  if (canUsePath2D(ctx) && points.length >= 2) {
    const first = points[0];
    const last = points[points.length - 1];
    const cacheKey = `${points.length}|${first.x.toFixed(2)},${first.y.toFixed(2)}|${last.x.toFixed(2)},${last.y.toFixed(2)}|${baseWidth}|${pressureCurve}|${isHighlighter ? 1 : 0}|${pressureEnabled ? 1 : 0}|${strength}|${tipShape}|${smoothing}`;
    let cached = committedStrokePathCache.get(points);
    if (!cached || cached.key !== cacheKey) {
      const pts = smoothStrokePoints(
        points,
        isHighlighter && smoothing !== 'none' ? 'subtle' : smoothing
      );
      const path = new Path2D();
      if (pts.length === 1) {
        const w = isHighlighter
          ? baseWidth
          : calculateStrokeWidth(baseWidth, pts[0].pressure, pressureCurve, pressureEnabled, strength);
        path.arc(pts[0].x, pts[0].y, (isHighlighter ? w : Math.max(MIN_DOT_WIDTH, w)) / 2, 0, Math.PI * 2);
      } else if (isHighlighter) {
        const segs = generateSmoothSegments(pts, baseWidth, pressureCurve, false, strength);
        if (segs.length > 0) {
          path.moveTo(segs[0].p0.x, segs[0].p0.y);
          for (const seg of segs) {
            path.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p1.x, seg.p1.y);
          }
        }
      } else {
        const segs = generateSmoothSegments(pts, baseWidth, pressureCurve, pressureEnabled, strength);
        traceInkRibbonPath(path, segs);
      }
      cached = { key: cacheKey, path };
      committedStrokePathCache.set(points, cached);
    }

    ctx.save();
    ctx.lineCap = tipShape === 'chisel' ? 'square' : 'round';
    ctx.lineJoin = tipShape === 'chisel' ? 'miter' : 'round';
    ctx.imageSmoothingEnabled = true;
    if (isHighlighter) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = normalizeHighlighterColor(color);
      ctx.lineWidth = baseWidth;
      ctx.stroke(cached.path);
    } else {
      ctx.fillStyle = color;
      ctx.fill(cached.path);
    }
    ctx.restore();
    return;
  }

  // Fallback for single-point taps or unit-test mock contexts without Path2D
  const pts = smoothStrokePoints(
    points,
    isHighlighter && smoothing !== 'none' ? 'subtle' : smoothing
  );

  ctx.save();
  ctx.lineCap = tipShape === 'chisel' ? 'square' : 'round';
  ctx.lineJoin = tipShape === 'chisel' ? 'miter' : 'round';
  ctx.imageSmoothingEnabled = true;

  if (pts.length === 1) {
    const w = isHighlighter
      ? baseWidth
      : calculateStrokeWidth(baseWidth, pts[0].pressure, pressureCurve, pressureEnabled, strength);
    ctx.fillStyle = isHighlighter ? normalizeHighlighterColor(color) : color;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, (isHighlighter ? w : Math.max(MIN_DOT_WIDTH, w)) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (isHighlighter) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = normalizeHighlighterColor(color);
    ctx.lineWidth = baseWidth;
    const segs = generateSmoothSegments(pts, baseWidth, pressureCurve, false, strength);
    ctx.beginPath();
    ctx.moveTo(segs[0].p0.x, segs[0].p0.y);
    for (const seg of segs) {
      ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p1.x, seg.p1.y);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.restore();
  renderInkRibbon(ctx, pts, color, baseWidth, pressureCurve, pressureEnabled, strength);
}

/**
 * Live stroke renderer for active drawing feedback. Delegates to the same
 * ribbon builder as the committed renderer, so the ink under the pen and the
 * ink left on the page are pixel-identical and nothing "snaps" on release.
 */
export function renderLiveStroke(
  ctx: CanvasRenderingContext2D,
  points: StrokePoint[],
  color: string,
  baseWidth: number,
  pressureCurve: 'linear' | 'soft' | 'firm' | 'exponential' = 'linear',
  pressureEnabled = true,
  strength: 'light' | 'balanced' | 'strong' = 'balanced',
  smoothing: 'none' | 'subtle' | 'medium' | 'high' = 'medium'
): void {
  renderInkRibbon(
    ctx,
    smoothStrokePoints(points, smoothing),
    color,
    baseWidth,
    pressureCurve,
    pressureEnabled,
    strength
  );
}

