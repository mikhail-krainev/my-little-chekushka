// Cartoon speech bubble with a tail. Click on the mascot shows a phrase, system events show a short caption.
// Drawn in y-DOWN screen coordinates (plain canvas space); the mascot frame comes in y-up and is converted.
import { Config } from './geometry.mjs';

const FONT = 'bold 13px ui-monospace, Menlo, Consolas, "Courier New", monospace';
const LINE_HEIGHT = 17;
const TAIL_HEIGHT = 9;
const PADDING = { x: 14, y: 8 };
const TEXT_COLOR = 'rgb(33,26,26)';
const OUTLINE_COLOR = 'rgb(51,51,61)';

/** Splits `text` into lines no wider than `maxWidth` (words first, single long words by characters). */
export function wrapText(measure, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) { line = candidate; continue; }
    if (line) lines.push(line);
    line = '';
    let chunk = '';
    for (const ch of word) {
      if (measure(chunk + ch) > maxWidth && chunk) { lines.push(chunk); chunk = ''; }
      chunk += ch;
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export class Bubble {
  constructor(clock) {
    this.clock = clock;
    this.visibleUntil = 0;
    this.text = '';
    this.lines = [];
    this.size = { width: 0, height: 0 };
    this.following = null;
  }

  get isVisible() { return this.following !== null && this.clock() < this.visibleUntil; }

  /** `following` returns the mascot's visible rect (y up) every frame, so the bubble moves with it. */
  show(ctx, text, following, duration = Config.bubbleDuration) {
    ctx.font = FONT;
    const measure = (s) => ctx.measureText(s).width;
    this.lines = wrapText(measure, text, Config.bubbleMaxTextWidth);
    const textWidth = Math.max(...this.lines.map(measure));
    this.size = {
      width: Math.max(52, Math.ceil(textWidth) + 2 * PADDING.x + 3),
      height: this.lines.length * LINE_HEIGHT + 2 * PADDING.y + TAIL_HEIGHT + 3,
    };
    this.text = text;
    this.following = following;
    this.visibleUntil = this.clock() + duration;
  }

  hide() { this.following = null; }

  /** Draws the bubble above the mascot (below it when there is no room) with its tail pointing at it. */
  draw(ctx, screen) {
    if (!this.isVisible) { this.following = null; return null; }
    const f = this.following();
    const top = screen.height - (f.y + f.h);                     // mascot rect in y-down space
    const { width: w, height: h } = this.size;
    const work = { left: screen.work.minX, right: screen.work.maxX, top: screen.height - screen.work.maxY, bottom: screen.height - screen.work.minY };
    let x = f.x + f.w / 2 - w / 2, y = top - h - 2;
    const above = y >= work.top;
    if (!above) y = top + f.h + 2;
    x = Math.max(work.left, Math.min(work.right - w, x));
    y = Math.min(Math.max(work.top, y), work.bottom - h);
    const tailX = f.x + f.w / 2 - x;

    ctx.save();
    ctx.translate(x, y);
    this.#paint(ctx, w, h, tailX, above);
    ctx.restore();
    return { x, y, w, h };
  }

  #paint(ctx, w, h, tailX, tailAtBottom) {
    const bodyTop = tailAtBottom ? 1.5 : TAIL_HEIGHT + 1.5;
    const body = { x: 1.5, y: bodyTop, w: w - 3, h: h - TAIL_HEIGHT - 3 };
    const tx = Math.min(Math.max(tailX, body.x + 18), body.x + body.w - 18);
    const baseY = tailAtBottom ? body.y + body.h : body.y;
    const tipY = tailAtBottom ? baseY + TAIL_HEIGHT - 1 : baseY - TAIL_HEIGHT + 1;

    ctx.beginPath();
    ctx.roundRect(body.x, body.y, body.w, body.h, 12);
    ctx.moveTo(tx - 6, baseY); ctx.lineTo(tx, tipY); ctx.lineTo(tx + 6, baseY); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = OUTLINE_COLOR; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    // hide the outline where the tail joins the body
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(tx - 5, baseY); ctx.lineTo(tx + 5, baseY); ctx.stroke();

    ctx.font = FONT; ctx.fillStyle = TEXT_COLOR; ctx.textBaseline = 'top';
    this.lines.forEach((line, i) => ctx.fillText(line, body.x + PADDING.x, body.y + PADDING.y + i * LINE_HEIGHT));
  }
}
