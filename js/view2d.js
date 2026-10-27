import { numericalDerivative1D, formatNum } from "./math-engine.js";

const TEAL = "#0d9f94";
const CORAL = "#e85d3b";
const AXIS = "rgba(40, 80, 100, 0.35)";
const GRID = "rgba(40, 80, 100, 0.08)";

export class View2D {
  constructor(canvas, onHud) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onHud = onHud;
    this.f = (x) => x * x;
    this.centerX = 0;
    this.centerY = 0;
    this.scale = 60; // pixels per unit
    this.p1 = 0.4;
    this.p2 = 2.2;
    this.drag = null; // 'p1' | 'p2' | 'pan'
    this.panStart = null;
    this._raf = 0;
    this._bound = false;
    this.resize();
  }

  setFunction(f) {
    this.f = f;
    this.requestDraw();
  }

  activate() {
    if (!this._bound) {
      this._bind();
      this._bound = true;
    }
    this.resize();
    this.requestDraw();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
    this.requestDraw();
  }

  panBy(dxUnits) {
    this.centerX += dxUnits;
    this.requestDraw();
  }

  reset() {
    this.centerX = 0;
    this.centerY = 0;
    this.scale = 60;
    this.p1 = 0.4;
    this.p2 = 2.2;
    this.requestDraw();
  }

  snapCloser() {
    const mid = (this.p1 + this.p2) / 2;
    const gap = Math.max(Math.abs(this.p2 - this.p1) * 0.35, 0.04);
    this.p1 = mid - gap / 2;
    this.p2 = mid + gap / 2;
    this.requestDraw();
  }

  worldToScreen(x, y) {
    return {
      sx: this.w / 2 + (x - this.centerX) * this.scale,
      sy: this.h / 2 - (y - this.centerY) * this.scale,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: this.centerX + (sx - this.w / 2) / this.scale,
      y: this.centerY - (sy - this.h / 2) / this.scale,
    };
  }

  pointOnCurve(x) {
    const y = this.f(x);
    return { x, y: Number.isFinite(y) ? y : 0 };
  }

  hitTest(sx, sy) {
    const a = this.pointOnCurve(this.p1);
    const b = this.pointOnCurve(this.p2);
    const sa = this.worldToScreen(a.x, a.y);
    const sb = this.worldToScreen(b.x, b.y);
    const r = 14;
    if ((sx - sa.sx) ** 2 + (sy - sa.sy) ** 2 <= r * r) return "p1";
    if ((sx - sb.sx) ** 2 + (sy - sb.sy) ** 2 <= r * r) return "p2";
    return null;
  }

  requestDraw() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this.draw());
  }

  draw() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    this._drawGrid();
    this._drawAxes();
    this._drawCurve();

    const A = this.pointOnCurve(this.p1);
    const B = this.pointOnCurve(this.p2);
    const sa = this.worldToScreen(A.x, A.y);
    const sb = this.worldToScreen(B.x, B.y);

    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const secantSlope = Math.abs(dx) < 1e-12 ? NaN : dy / dx;
    const midX = (A.x + B.x) / 2;
    const trueSlope = numericalDerivative1D(this.f, midX);
    const delta = Math.abs(dx);

    // Overlap: 0 when far, 1 when nearly coincident with derivative
    const slopeDiff = Math.abs(secantSlope - trueSlope);
    const overlap = Number.isFinite(slopeDiff)
      ? Math.max(0, Math.min(1, 1 - slopeDiff / (Math.abs(trueSlope) + 1.5) - delta * 0.15))
      : 0;
    const proximity = Math.max(0, Math.min(1, 1 - delta / 3));
    const blend = Math.max(overlap, proximity * proximity);

    // Secant line through A and B (extends)
    if (Number.isFinite(A.y) && Number.isFinite(B.y) && Math.abs(dx) > 1e-12) {
      this._drawLineThrough(A.x, A.y, secantSlope, CORAL, 2.25, 1, false);
    } else if (Number.isFinite(A.y) && Number.isFinite(B.y)) {
      // vertical-ish fallback: draw chord only
      ctx.strokeStyle = CORAL;
      ctx.lineWidth = 2.25;
      ctx.beginPath();
      ctx.moveTo(sa.sx, sa.sy);
      ctx.lineTo(sb.sx, sb.sy);
      ctx.stroke();
    }

    // Chord highlight
    ctx.strokeStyle = `rgba(255, 107, 74, ${0.55 + blend * 0.2})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(sa.sx, sa.sy);
    ctx.lineTo(sb.sx, sb.sy);
    ctx.stroke();
    ctx.setLineDash([]);

    this._drawHandle(sa.sx, sa.sy, "A");
    this._drawHandle(sb.sx, sb.sy, "B");

    if (this.onHud) {
      this.onHud({
        secant: formatNum(secantSlope),
        deriv: formatNum(trueSlope),
        derivLabel: `f′(${formatNum(midX, 2)})`,
        delta: formatNum(delta, 4),
        overlap: blend,
        caption:
          blend > 0.92
            ? "Secant ≈ derivative (overlapping)"
            : blend > 0.55
              ? "Approaching the tangent…"
              : "Pull points together",
      });
    }
  }

  _drawGrid() {
    const { ctx, w, h, scale, centerX, centerY } = this;
    const left = centerX - w / 2 / scale;
    const right = centerX + w / 2 / scale;
    const bottom = centerY - h / 2 / scale;
    const top = centerY + h / 2 / scale;
    const step = niceStep(80 / scale);

    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
      const { sx } = this.worldToScreen(x, 0);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) {
      const { sy } = this.worldToScreen(0, y);
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();
  }

  _drawAxes() {
    const { ctx, w, h } = this;
    const o = this.worldToScreen(0, 0);
    ctx.strokeStyle = AXIS;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(0, o.sy);
    ctx.lineTo(w, o.sy);
    ctx.moveTo(o.sx, 0);
    ctx.lineTo(o.sx, h);
    ctx.stroke();
  }

  _drawCurve() {
    const { ctx, w, scale, centerX } = this;
    const left = centerX - w / 2 / scale;
    const right = centerX + w / 2 / scale;
    const samples = Math.max(200, Math.floor(w));
    const dx = (right - left) / samples;

    ctx.strokeStyle = TEAL;
    ctx.lineWidth = 2.75;
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(13, 159, 148, 0.25)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= samples; i++) {
      const x = left + i * dx;
      const y = this.f(x);
      if (!Number.isFinite(y) || Math.abs(y) > 1e4) {
        started = false;
        continue;
      }
      const { sx, sy } = this.worldToScreen(x, y);
      if (!started) {
        ctx.moveTo(sx, sy);
        started = true;
      } else {
        ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  _drawLineThrough(x0, y0, slope, color, width, alpha, dashed) {
    const { ctx, w } = this;
    const left = this.centerX - w / 2 / this.scale;
    const right = this.centerX + w / 2 / this.scale;
    const yL = y0 + slope * (left - x0);
    const yR = y0 + slope * (right - x0);
    const a = this.worldToScreen(left, yL);
    const b = this.worldToScreen(right, yR);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dashed) ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
    ctx.restore();
  }

  _drawHandle(sx, sy, label) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.arc(sx, sy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = CORAL;
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = CORAL;
    ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(26, 43, 54, 0.85)";
    ctx.font = "600 11px Outfit, sans-serif";
    ctx.fillText(label, sx + 12, sy - 10);
  }

  _bind() {
    const el = this.canvas;

    const pos = (e) => {
      const rect = el.getBoundingClientRect();
      return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
    };

    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      const { sx, sy } = pos(e);
      const hit = this.hitTest(sx, sy);
      if (hit) {
        this.drag = hit;
      } else {
        this.drag = "pan";
        this.panStart = { sx, sy, cx: this.centerX, cy: this.centerY };
      }
    });

    el.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      const { sx, sy } = pos(e);
      if (this.drag === "pan" && this.panStart) {
        this.centerX = this.panStart.cx - (sx - this.panStart.sx) / this.scale;
        this.centerY = this.panStart.cy + (sy - this.panStart.sy) / this.scale;
        this.requestDraw();
        return;
      }
      const world = this.screenToWorld(sx, sy);
      if (this.drag === "p1") this.p1 = world.x;
      if (this.drag === "p2") this.p2 = world.x;
      this.requestDraw();
    });

    const end = () => {
      this.drag = null;
      this.panStart = null;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);

    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const { sx, sy } = pos(e);
        const before = this.screenToWorld(sx, sy);
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        this.scale = Math.min(400, Math.max(18, this.scale * factor));
        const after = this.screenToWorld(sx, sy);
        this.centerX += before.x - after.x;
        this.centerY += before.y - after.y;
        this.requestDraw();
      },
      { passive: false }
    );
  }
}

function niceStep(raw) {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  let nice = 1;
  if (n > 5) nice = 10;
  else if (n > 2) nice = 5;
  else if (n > 1) nice = 2;
  return nice * pow;
}
