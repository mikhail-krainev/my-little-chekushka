'use strict';
// Flings the system cursor along an arc: the mascot throws it away. Uses CGWarpMouseCursorPosition on macOS (needs no
// permission) and SetCursorPos on Windows, both through koffi. Points are Electron global DIP, y down.

const STEP_MS = 8;

let native = null;
let leftButton = null;

/** The platform call that puts the cursor at a global DIP point, or null when there is none. */
function loadWarp(screen) {
  if (native) return native;
  const koffi = require('koffi');
  if (process.platform === 'darwin') {
    const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
    const CGPoint = koffi.struct('CGPoint', { x: 'double', y: 'double' });
    leftButton = cg.func('bool CGEventSourceButtonState(int32, uint32)');
    const warp = cg.func('int32 CGWarpMouseCursorPosition(CGPoint)');
    const associate = cg.func('int32 CGAssociateMouseAndMouseCursorPosition(int32)');
    native = (p) => {
      warp({ x: p.x, y: p.y });
      associate(1);              // otherwise the real mouse is ignored for a quarter second after every warp
    };
  } else if (process.platform === 'win32') {
    const user32 = koffi.load('user32.dll');
    const getKeyState = user32.func('int16 __stdcall GetAsyncKeyState(int vKey)');
    leftButton = () => (getKeyState(1) & 0x8000) !== 0;
    const setCursorPos = user32.func('int __stdcall SetCursorPos(int x, int y)');
    native = (p) => {
      const px = screen.dipToScreenPoint(p);
      setCursorPos(Math.round(px.x), Math.round(px.y));
    };
  }
  return native;
}

const easeOut = (k) => 1 - (1 - k) ** 3;

/**
 * Moves the cursor from `from` to `to` over `duration` seconds along an arc that rises by `lift` px.
 * Resolves when done; rejects if the platform cannot move the cursor.
 */
function flingCursor(screen, { from, to, duration, lift }) {
  const warp = loadWarp(screen);
  if (!warp) return Promise.reject(new Error(`moving the cursor is not supported on ${process.platform}`));
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const k = Math.min(1, (Date.now() - started) / (duration * 1000));
      const e = easeOut(k);
      try {
        warp({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - lift * Math.sin(Math.PI * e) });
      } catch (err) {
        clearInterval(timer);
        reject(err);
        return;
      }
      if (k >= 1) { clearInterval(timer); resolve(); }
    }, STEP_MS);
  });
}

/** Global button state also works over Finder / Explorer, outside the transparent layer. */
function isLeftDown(screen) {
  loadWarp(screen);
  return leftButton ? Boolean(leftButton(0, 0)) : false;
}

/** An immediate relative step leaves no animation running after the button is released. */
function wobbleCursor(screen, { dx, dy }) {
  if (!isLeftDown(screen)) return;
  const from = screen.getCursorScreenPoint();
  const b = screen.getDisplayNearestPoint(from).bounds;
  loadWarp(screen)({
    x: Math.max(b.x + 2, Math.min(b.x + b.width - 2, from.x + dx)),
    y: Math.max(b.y + 2, Math.min(b.y + b.height - 2, from.y - dy)),
  });
}

module.exports = { flingCursor, isLeftDown, wobbleCursor };
