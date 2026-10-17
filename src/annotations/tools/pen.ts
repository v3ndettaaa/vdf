/**
 * Professional Freehand Pen Tool
 * Ultra-smooth, low-latency, pressure-sensitive drawing.
 */

import { StrokePoint, PenAnnotation, BoundingBox } from '../../core/types';
import { renderLiveStroke, buildInkRibbonPath2D, smoothStrokePoints } from '../spline';
import { computePointsBoundingBox } from '../../utils/geometry';

const CHUNK_SIZE = 44;
const CHUNK_OVERLAP = 3;

export class PenTool {
  private _activePoints: StrokePoint[] = [];
  private _pageIndex: number = 0;
  private _color: string = '#4f46e5';
  private _width: number = 3;
  private _pressureCurve: 'linear' | 'soft' | 'firm' | 'exponential' = 'linear';
  private _pressureEnabled: boolean = true;
  private _strength: 'light' | 'balanced' | 'strong' = 'balanced';
  private _smoothing: 'none' | 'subtle' | 'medium' | 'high' = 'medium';

  // O(1) incremental bounding box & Path2D chunk cache for long continuous strokes
  private _minX: number = Infinity;
  private _minY: number = Infinity;
  private _maxX: number = -Infinity;
  private _maxY: number = -Infinity;
  private _frozenChunks: Path2D[] = [];
  private _frozenUpToIndex: number = 0;

  public start(
    point: StrokePoint,
    pageIndex: number,
    color: string,
    width: number,
    curve: 'linear' | 'soft' | 'firm' | 'exponential',
    pressureEnabled: boolean = true,
    strength: 'light' | 'balanced' | 'strong' = 'balanced',
    smoothing: 'none' | 'subtle' | 'medium' | 'high' = 'medium'
  ) {
    this._activePoints = [point];
    this._pageIndex = pageIndex;
    this._color = color;
    this._width = width;
    this._pressureCurve = curve;
    this._pressureEnabled = pressureEnabled;
    this._strength = strength;
    this._smoothing = smoothing;
    this._minX = point.x;
    this._minY = point.y;
    this._maxX = point.x;
    this._maxY = point.y;
    this._frozenChunks = [];
    this._frozenUpToIndex = 0;
  }

  public move(point: StrokePoint, zoom: number = 1): void {
    const len = this._activePoints.length;
    if (len > 0) {
      const prev = this._activePoints[len - 1];
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      const effZoom = Math.max(1, zoom);
      // Filter redundant sub-pixel hardware jitter (< 0.60 screen px) in zoom-normalized page units
      const minDist = 0.60 / effZoom;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDist * minDist) {
        prev.pressure = prev.pressure * 0.5 + point.pressure * 0.5;
        return;
      }
      // Sub-pixel bounded tremor damper:
      // Absorbs slow hand micro-tremors (< 2 screen px) while strictly capping displacement
      // to <= 0.45 screen px so fast strokes and rapid direction changes have zero lag
      // and never cut or morph corners.
      if (this._smoothing !== 'none' && len >= 2) {
        const dist = Math.sqrt(distSq);
        const screenStep = dist * effZoom;
        if (screenStep < 4.5) {
          const slowRatio = 1 - screenStep / 4.5;
          const maxScreenOffset =
            this._smoothing === 'subtle' ? 0.28 : (this._smoothing === 'medium' ? 0.42 : 0.58);
          const maxOffsetPage = (maxScreenOffset * slowRatio) / effZoom;
          const dampFraction =
            this._smoothing === 'subtle' ? 0.12 : (this._smoothing === 'medium' ? 0.18 : 0.24);
          const pull = Math.min(dist * dampFraction * slowRatio, maxOffsetPage);
          const ratio = (dist - pull) / dist;
          point = {
            x: prev.x + dx * ratio,
            y: prev.y + dy * ratio,
            pressure: prev.pressure * 0.35 + point.pressure * 0.65
          };
        } else {
          point = {
            ...point,
            pressure: prev.pressure * 0.35 + point.pressure * 0.65
          };
        }
      }
    }
    if (point.x < this._minX) this._minX = point.x;
    if (point.y < this._minY) this._minY = point.y;
    if (point.x > this._maxX) this._maxX = point.x;
    if (point.y > this._maxY) this._maxY = point.y;
    this._activePoints.push(point);

    // Freeze settled prefix into a cached Path2D whenever the active tail grows past CHUNK_SIZE + 12
    const activeLen = this._activePoints.length;
    if (
      typeof Path2D !== 'undefined' &&
      activeLen - this._frozenUpToIndex >= CHUNK_SIZE + 12
    ) {
      const sliceStart = Math.max(0, this._frozenUpToIndex - CHUNK_OVERLAP);
      const sliceEnd = this._frozenUpToIndex + CHUNK_SIZE;
      const chunkPts = smoothStrokePoints(
        this._activePoints.slice(sliceStart, sliceEnd + 2),
        this._smoothing
      );
      const chunkPath = buildInkRibbonPath2D(
        chunkPts,
        this._width,
        this._pressureCurve,
        this._pressureEnabled,
        this._strength
      );
      if (chunkPath) {
        this._frozenChunks.push(chunkPath);
        this._frozenUpToIndex = sliceEnd;
      }
    }
  }

  /** Live stroke points for draw-and-hold recognition (read-only snapshot). */
  public getActivePoints(): readonly StrokePoint[] {
    return this._activePoints;
  }

  /** Returns O(1) page-space bounding box of the in-progress stroke for dirty-rect clearing. */
  public getLiveBoundingBox(): BoundingBox | null {
    if (this._activePoints.length === 0) return null;
    const pad = this._width * 3 + 6;
    return {
      x: this._minX - pad,
      y: this._minY - pad,
      width: (this._maxX - this._minX) + pad * 2,
      height: (this._maxY - this._minY) + pad * 2
    };
  }

  public renderScratchpad(ctx: CanvasRenderingContext2D, scale: number): void {
    if (this._activePoints.length === 0) return;

    ctx.save();
    ctx.scale(scale, scale);

    if (
      this._frozenChunks.length > 0 &&
      typeof HTMLCanvasElement !== 'undefined' &&
      ctx.canvas instanceof HTMLCanvasElement
    ) {
      ctx.fillStyle = this._color;
      for (let i = 0; i < this._frozenChunks.length; i++) {
        ctx.fill(this._frozenChunks[i]);
      }
      const tailStart = Math.max(0, this._frozenUpToIndex - CHUNK_OVERLAP);
      const tailPoints = this._activePoints.slice(tailStart);
      renderLiveStroke(
        ctx,
        tailPoints,
        this._color,
        this._width,
        this._pressureCurve,
        this._pressureEnabled,
        this._strength,
        this._smoothing
      );
    } else {
      renderLiveStroke(
        ctx,
        this._activePoints,
        this._color,
        this._width,
        this._pressureCurve,
        this._pressureEnabled,
        this._strength,
        this._smoothing
      );
    }
    ctx.restore();
  }

  public finish(layerId: string): PenAnnotation | null {
    if (this._activePoints.length === 0) return null;

    // The points are already smoothly filtered in real-time as drawn;
    // preserve the exact points and smoothing setting so there is ZERO morphing / snapping on pen release
    const finalizedPoints = [...this._activePoints];
    const box: BoundingBox = computePointsBoundingBox(finalizedPoints, this._width);

    const annotation: PenAnnotation = {
      id: Math.random().toString(36).substring(2, 9),
      pageIndex: this._pageIndex,
      layerId,
      type: 'pen',
      box,
      points: finalizedPoints,
      color: this._color,
      strokeWidth: this._width,
      pressureEnabled: this._pressureEnabled,
      pressureCurve: this._pressureCurve,
      pressureStrength: this._strength,
      strokeSmoothing: this._smoothing,
      opacity: 1.0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.cancel();
    return annotation;
  }

  public cancel(): void {
    this._activePoints = [];
    this._frozenChunks = [];
    this._frozenUpToIndex = 0;
    this._minX = Infinity;
    this._minY = Infinity;
    this._maxX = -Infinity;
    this._maxY = -Infinity;
  }
}

export const penTool = new PenTool();
