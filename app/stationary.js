'use strict';
// macOS: keeps the overlay in place when the desktop is revealed (clicking the wallpaper on macOS 14+, Show Desktop).
// macOS sweeps every window it "manages" to the screen edge; Electron always marks its windows as managed and has no
// option to undo that, so the NSWindow's collection behaviour is set directly through the Objective-C runtime.
// Same flags as the original Swift version: on every Space, stationary, out of the window cycle, over full-screen apps.

const NS_COLLECTION = {
  canJoinAllSpaces: 1 << 0,
  stationary: 1 << 4,
  ignoresCycle: 1 << 6,
  fullScreenAuxiliary: 1 << 8,
};
const STATIONARY_OVERLAY = BigInt(
  NS_COLLECTION.canJoinAllSpaces | NS_COLLECTION.stationary | NS_COLLECTION.ignoresCycle | NS_COLLECTION.fullScreenAuxiliary,
);

let runtime = null;

/** Loads the Objective-C runtime calls once (koffi is only required on macOS). */
function objcRuntime() {
  if (runtime) return runtime;
  const koffi = require('koffi');
  const objc = koffi.load('/usr/lib/libobjc.A.dylib');
  runtime = {
    koffi,
    selector: objc.func('void* sel_registerName(const char*)'),
    sendPointer: objc.func('objc_msgSend', 'void*', ['void*', 'void*']),
    sendU64: objc.func('objc_msgSend', 'uint64', ['void*', 'void*']),
    sendSetU64: objc.func('objc_msgSend', 'void', ['void*', 'void*', 'uint64']),
  };
  return runtime;
}

/** Makes `win` stay put when macOS reveals the desktop. Call after setAlwaysOnTop / setVisibleOnAllWorkspaces.
 *  Returns true when the flags were applied; on failure the window keeps working, it just moves aside like others. */
function makeStationary(win) {
  if (process.platform !== 'darwin') return false;
  try {
    const rt = objcRuntime();
    const view = rt.koffi.decode(win.getNativeWindowHandle(), 'void*');           // NSView*
    const nsWindow = rt.sendPointer(view, rt.selector('window'));
    if (!nsWindow) throw new Error('the view has no NSWindow yet');
    rt.sendSetU64(nsWindow, rt.selector('setCollectionBehavior:'), STATIONARY_OVERLAY);
    const applied = BigInt(rt.sendU64(nsWindow, rt.selector('collectionBehavior')));   // koffi may return a Number
    if (applied !== STATIONARY_OVERLAY) throw new Error(`collection behaviour is ${applied}, expected ${STATIONARY_OVERLAY}`);
    return true;
  } catch (err) {
    console.error('Could not keep the mascot window in place on desktop reveal:', err.message);
    return false;
  }
}

module.exports = { makeStationary };
