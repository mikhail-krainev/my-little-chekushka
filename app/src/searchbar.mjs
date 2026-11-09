// A search bar drawn on the overlay, in the look of the system one: the mascot opens it, types into it and gets
// zapped off it. It is only a picture: nothing is typed into the real system search.

const POP_TIME = 0.25;
const FLASH_TIME = 0.18;
const SHAKE_TIME = 0.45;
const FADE_START = 0.55;
const FADE_TIME = 0.4;
const CARET_BLINK = 0.5;
const RADIUS = 14;
const FONT_PX = 22;
const PLACEHOLDER = 'Поиск';
/** How far (px, before scaling) things reach outside the box: the zap sparks to the left, the shaking, the shadow. */
const SPARK_REACH = 28;
const SHAKE_MAX = 9;
const SHADOW_BLUR = 18;
const SHADOW_OFFSET = 6;
const SHADOW_REACH = SHADOW_BLUR * 1.5 + SHADOW_OFFSET;
const SAFETY = 4;
/** The bar vanishes when the scene stops feeding it text this long (the mascot was grabbed or called away). */
const ABANDON_TIME = 0.5;

const easeOutBack = (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export class SearchBar {
  constructor() {
    this.rect = null;          // y up: { x, y (bottom), w, h }
    this.text = '';
    this.openedAt = 0;
    this.zappedAt = null;
    this.touchedAt = 0;
  }

  /** Shows the bar at `rect` (y up), empty. */
  open(rect, now) {
    this.rect = { ...rect };
    this.text = '';
    this.openedAt = now;
    this.touchedAt = now;
    this.zappedAt = null;
  }

  setText(text, now) { this.text = text; this.touchedAt = now; }

  /** Flashes, shakes and closes. */
  zap(now) { if (this.rect && this.zappedAt === null) this.zappedAt = now; }

  isVisible(now) {
    if (!this.rect) return false;
    if (this.zappedAt === null && now - this.touchedAt > ABANDON_TIME) { this.rect = null; return false; }
    if (this.zappedAt !== null && now - this.zappedAt > FADE_START + FADE_TIME) { this.rect = null; return false; }
    return true;
  }

  /** Draws in CSS pixels, y down. Returns the rect it painted (y down) or null. */
  draw(ctx, screenHeight, now) {
    if (!this.isVisible(now)) return null;
    const { x, y, w, h } = this.rect;
    const top = screenHeight - y - h;
    const pop = easeOutBack(clamp01((now - this.openedAt) / POP_TIME));
    const since = this.zappedAt === null ? null : now - this.zappedAt;
    const flash = since === null ? 0 : 1 - clamp01(since / FLASH_TIME);
    const shake = since === null ? 0 : (1 - clamp01(since / SHAKE_TIME)) * Math.sin(since * 70) * SHAKE_MAX;
    const alpha = since === null ? 1 : 1 - clamp01((since - FADE_START) / FADE_TIME);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + w / 2 + shake, top + h / 2);
    ctx.scale(pop, pop);
    ctx.translate(-w / 2, -h / 2);
    this.#drawBox(ctx, w, h, flash);
    this.#drawLens(ctx, h);
    this.#drawText(ctx, w, h, now, since === null);
    if (flash > 0) this.#drawSparks(ctx, w, h, flash);
    ctx.restore();
    // Everything painted this frame, so the next frame clears all of it (the pop-in overshoots the box size).
    const halfW = (w / 2) * pop, halfH = (h / 2) * pop, cx = x + w / 2, cy = top + h / 2;
    const pad = Math.max(SPARK_REACH * pop, SHADOW_REACH) + SHAKE_MAX + SAFETY;
    return { x: cx - halfW - pad, y: cy - halfH - pad, w: 2 * (halfW + pad), h: 2 * (halfH + pad) };
  }

  #drawBox(ctx, w, h, flash) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = SHADOW_BLUR;
    ctx.shadowOffsetY = SHADOW_OFFSET;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, RADIUS);
    ctx.fillStyle = flash > 0 ? `rgba(${Math.round(40 + 215 * flash)},${Math.round(40 + 60 * flash)},${Math.round(44 + 40 * flash)},0.95)` : 'rgba(40,40,44,0.92)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.stroke();
  }

  #drawLens(ctx, h) {
    const cx = h * 0.5, cy = h * 0.47, r = h * 0.17;
    ctx.strokeStyle = 'rgba(235,235,240,0.75)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.moveTo(cx + r * 0.72, cy + r * 0.72);
    ctx.lineTo(cx + r * 1.65, cy + r * 1.65);
    ctx.stroke();
  }

  #drawText(ctx, w, h, now, caretOn) {
    const left = h * 0.95;
    ctx.font = `${FONT_PX}px -apple-system, "Segoe UI", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, 0, w - left - 12, h);
    ctx.clip();
    if (this.text) {
      ctx.fillStyle = 'rgba(245,245,247,0.96)';
      ctx.fillText(this.text, left, h / 2);
    } else {
      ctx.fillStyle = 'rgba(200,200,205,0.45)';
      ctx.fillText(PLACEHOLDER, left, h / 2);
    }
    if (caretOn && Math.floor(now / CARET_BLINK) % 2 === 0) {
      const cx = left + (this.text ? ctx.measureText(this.text).width : 0) + 2;
      ctx.fillStyle = 'rgba(120,170,255,0.95)';
      ctx.fillRect(cx, h * 0.24, 2, h * 0.52);
    }
    ctx.restore();
  }

  /** Little lightning bolts off the left end, where the mascot stood. */
  #drawSparks(ctx, w, h, flash) {
    ctx.strokeStyle = `rgba(255,240,120,${flash})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const y0 = h * (0.15 + i * 0.18);
      ctx.moveTo(0, y0);
      ctx.lineTo(-14, y0 - 6);
      ctx.lineTo(-8, y0 + 4);
      ctx.lineTo(-(SPARK_REACH - 2), y0 - 2);
    }
    ctx.stroke();
  }
}
