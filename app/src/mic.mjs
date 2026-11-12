// The microphone button next to the mascot: shows up after a click on him and stays while the microphone is on.
// Clicking it turns listening on and off (voice/index.js in the main process does the work).

const SIZE = 30;                    // px, a round button
const GAP = 6;                      // from the mascot's visible frame
/** After a click on the mascot the button waits this long for a click of its own. */
export const MIC_REVEAL_SECONDS = 8;
const COLORS = {
  off: { fill: '#f4efe6', ink: '#33333d' },
  downloading: { fill: '#f0d49a', ink: '#3a2a08' },
  loading: { fill: '#f0d49a', ink: '#3a2a08' },
  listening: { fill: '#e0533f', ink: '#ffffff' },
  error: { fill: '#8e8a84', ink: '#ffffff' },
};
const OUTLINE = 'rgb(51,51,61)';

export class MicButton {
  constructor(clock) {
    this.clock = clock;
    this.status = { state: 'off' };
    this.revealedUntil = 0;
  }

  get isOn() { return ['downloading', 'loading', 'listening'].includes(this.status.state); }
  get isListening() { return this.status.state === 'listening'; }
  get isVisible() { return this.isOn || this.clock() < this.revealedUntil; }

  reveal(seconds = MIC_REVEAL_SECONDS) {
    this.revealedUntil = Math.max(this.revealedUntil, this.clock() + seconds);
  }

  setStatus(status) {
    this.status = status;
    if (!this.isOn) this.reveal(3);                  // a moment to see that it is off now, or what went wrong
  }

  /** The button's rect in y-up screen space next to the mascot's `frame`, kept inside the work area. */
  rect(frame, work) {
    let x = frame.x + frame.w + GAP;
    if (x + SIZE > work.maxX) x = frame.x - GAP - SIZE;
    const y = Math.min(Math.max(frame.y + frame.h - SIZE - 20, work.minY), work.maxY - SIZE);
    return { x, y, w: SIZE, h: SIZE };
  }

  /** Draws in y-down space (`top` already flipped); returns the painted rect for clearing next frame. */
  draw(ctx, x, top) {
    const { state, progress = 0 } = this.status;
    const colors = COLORS[state] ?? COLORS.off;
    const r = SIZE / 2, cx = x + r, cy = top + r, t = this.clock();
    ctx.save();
    if (state === 'listening') {                     // a ring that breathes while he listens
      const pulse = (Math.sin(t * 5) + 1) / 2;
      ctx.beginPath(); ctx.arc(cx, cy, r + 3 + pulse * 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(224,83,63,${0.25 + 0.35 * (1 - pulse)})`; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = colors.fill; ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    if (state === 'downloading' || state === 'loading') {
      const sweep = state === 'downloading' ? progress * Math.PI * 2 : Math.PI / 2;
      const start = state === 'downloading' ? -Math.PI / 2 : t * 6;
      ctx.beginPath(); ctx.arc(cx, cy, r - 3, start, start + sweep);
      ctx.strokeStyle = '#b07a12'; ctx.lineWidth = 3; ctx.stroke();
    }
    drawGlyph(ctx, cx, cy, colors.ink);
    if (state === 'off' || state === 'error') {      // crossed out while not listening
      ctx.beginPath(); ctx.moveTo(cx - 8, cy + 8); ctx.lineTo(cx + 8, cy - 8);
      ctx.strokeStyle = colors.ink; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.restore();
    const pad = 9;
    return { x: x - pad, y: top - pad, w: SIZE + 2 * pad, h: SIZE + 2 * pad };
  }
}

function drawGlyph(ctx, cx, cy, ink) {
  ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.roundRect(cx - 3.5, cy - 9, 7, 12, 3.5); ctx.fill();          // capsule
  ctx.beginPath(); ctx.arc(cx, cy - 1, 6.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();   // holder
  ctx.beginPath(); ctx.moveTo(cx, cy + 5.5); ctx.lineTo(cx, cy + 8.5); ctx.stroke();   // stand
}
