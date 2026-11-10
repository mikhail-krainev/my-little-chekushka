'use strict';
// The desktop as the mascot sees it: folder windows the user opens (Finder / Explorer) and folder icons on the desktop.
// All rectangles and points leave this module in Electron's global DIP coordinates, y down.
//
// macOS: window frames come from CGWindowListCopyWindowInfo through JXA (no permission needed: names are not read);
//        icons are read and moved through Finder scripting, which asks the user once for "control Finder" access.
// Windows: one long-lived PowerShell helper answers JSON requests: Explorer windows (class CabinetWClass) and the
//          desktop list view (SysListView32 of SHELLDLL_DefView), read across processes and moved with LVM_SETITEMPOSITION.
const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const WINDOW_POLL_MS = 1000;
const OSASCRIPT_TIMEOUT_MS = 8000;
const HELPER_TIMEOUT_MS = 10_000;
const HELPER_RESTART_MS = 5000;
/** Windows reports the top-left of the icon cell; this is the middle of the icon in a 100 % scale cell. */
const WIN_ICON_CENTER = { x: 37, y: 28 };

// MARK: macOS

const MAC_FOLDER_WINDOWS = `
ObjC.import('CoreGraphics');
function run() {
  const list = ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1 | 16, 0));   // on screen only, no desktop elements
  const out = [];
  for (let i = 0; i < list.count; i++) {
    const w = list.objectAtIndex(i);
    if (ObjC.unwrap(w.objectForKey('kCGWindowOwnerName')) !== 'Finder') continue;
    if (ObjC.unwrap(w.objectForKey('kCGWindowLayer')) !== 0) continue;
    const b = w.objectForKey('kCGWindowBounds');
    out.push({ id: ObjC.unwrap(w.objectForKey('kCGWindowNumber')), x: ObjC.unwrap(b.objectForKey('X')),
      y: ObjC.unwrap(b.objectForKey('Y')), width: ObjC.unwrap(b.objectForKey('Width')), height: ObjC.unwrap(b.objectForKey('Height')) });
  }
  return JSON.stringify(out);
}`;

const MAC_LIST_FOLDERS = `
function run() {
  const folders = Application('Finder').desktop.folders;
  const names = folders.name(), positions = folders.desktopPosition();
  return JSON.stringify(names.map((name, i) => ({ name, x: positions[i].x, y: positions[i].y })));
}`;

const MAC_MOVE_FOLDER = `
function run(argv) {
  Application('Finder').desktop.folders.byName(argv[0]).desktopPosition = { x: Number(argv[1]), y: Number(argv[2]) };
  return 'ok';
}`;

function jxa(script, args = []) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', script, ...args], { timeout: OSASCRIPT_TIMEOUT_MS }, (err, out, errOut) => {
      if (err) reject(new Error(`osascript: ${(errOut || err.message).trim()}`)); else resolve(out.trim());
    });
  });
}

function macBackend() {
  return {
    listFolderWindows: async () => JSON.parse(await jxa(MAC_FOLDER_WINDOWS)),
    // Finder's desktop position is the middle of the icon, in the main screen's points: already global DIP.
    listDesktopFolders: async () => JSON.parse(await jxa(MAC_LIST_FOLDERS)),
    moveDesktopFolder: async (name, x, y) => { await jxa(MAC_MOVE_FOLDER, [name, String(Math.round(x)), String(Math.round(y))]); },
    dispose() {},
  };
}

/** Reads only the system drag pasteboard, never the user's copy/paste clipboard.
 *  Finder publishes file URLs here when dragging really begins, including drags out of folder windows. */
function createMacFolderDragReader(boardName = 'Apple CFPasteboard drag') {
  const koffi = require('koffi');
  const { fileURLToPath } = require('node:url');
  const appkit = koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit');
  const objc = koffi.load('/usr/lib/libobjc.A.dylib');
  const getClass = objc.func('void* objc_getClass(const char*)');
  const selector = objc.func('void* sel_registerName(const char*)');
  const send = objc.func('objc_msgSend', 'void*', ['void*', 'void*']);
  const sendArg = objc.func('objc_msgSend', 'void*', ['void*', 'void*', 'void*']);
  const sendText = objc.func('objc_msgSend', 'void*', ['void*', 'void*', 'str']);
  const sendIndex = objc.func('objc_msgSend', 'void*', ['void*', 'void*', 'uint64']);
  const integer = objc.func('objc_msgSend', 'int64', ['void*', 'void*']);
  const text = objc.func('objc_msgSend', 'str', ['void*', 'void*']);
  const release = objc.func('objc_msgSend', 'void', ['void*', 'void*']);
  const sel = Object.fromEntries(['new', 'drain', 'retain', 'stringWithUTF8String:', 'pasteboardWithName:',
    'changeCount', 'pasteboardItems', 'count', 'objectAtIndex:', 'stringForType:', 'UTF8String'].map((s) => [s, selector(s)]));
  const nsString = (s) => sendText(getClass('NSString'), sel['stringWithUTF8String:'], s);
  const poolClass = getClass('NSAutoreleasePool');
  const initialPool = send(poolClass, sel.new);
  const board = send(sendArg(getClass('NSPasteboard'), sel['pasteboardWithName:'], nsString(boardName)), sel.retain);
  const fileType = send(nsString('public.file-url'), sel.retain);
  release(initialPool, sel.drain);
  let cached = null;
  return () => {
    void appkit; // Keep AppKit loaded for the lifetime of the reader.
    const changeCount = Number(integer(board, sel.changeCount));
    if (cached?.changeCount === changeCount) return cached;
    const pool = send(poolClass, sel.new);
    try {
      const items = send(board, sel.pasteboardItems);
      const count = items ? Math.min(64, Number(integer(items, sel.count))) : 0;
      let isFolder = false;
      for (let i = 0; i < count && !isFolder; i++) {
        const item = sendIndex(items, sel['objectAtIndex:'], i);
        const value = sendArg(item, sel['stringForType:'], fileType);
        if (!value) continue;
        const url = text(value, sel.UTF8String);
        try { isFolder = fs.statSync(fileURLToPath(url)).isDirectory(); } catch { /* Non-file URLs and inaccessible files are ignored. */ }
      }
      cached = { changeCount, isFolder };
      return cached;
    } finally { release(pool, sel.drain); }
  };
}

/** A new drag payload plus a held left button identifies a live drag, without guessing at icon coordinates. */
class PasteboardFolderDragTracker {
  constructor(read, onDrag) {
    this.read = read;
    this.onDrag = onDrag;
    this.changeCount = read().changeCount;
    this.chasing = false;
  }

  update(point, down) {
    const payload = this.read();
    if (!down) {
      if (this.chasing) this.onDrag(null);
      this.chasing = false;
    } else {
      if (payload.changeCount !== this.changeCount) {
        if (this.chasing && !payload.isFolder) this.onDrag(null);
        this.chasing = payload.isFolder;
      }
      if (this.chasing) this.onDrag({ ...point });
    }
    this.changeCount = payload.changeCount;
  }
}

// MARK: Windows

const WIN_HELPER = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class ChekushkaDesktop {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string c, string n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr p, IntPtr a, string c, string n);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] static extern IntPtr VirtualAllocEx(IntPtr p, IntPtr a, UIntPtr size, uint type, uint protect);
  [DllImport("kernel32.dll")] static extern bool VirtualFreeEx(IntPtr p, IntPtr a, UIntPtr size, uint type);
  [DllImport("kernel32.dll")] static extern bool WriteProcessMemory(IntPtr p, IntPtr a, byte[] b, UIntPtr size, out UIntPtr done);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr p, IntPtr a, byte[] b, UIntPtr size, out UIntPtr done);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

  const uint LVM_GETITEMCOUNT = 0x1004, LVM_SETITEMPOSITION = 0x100F, LVM_GETITEMPOSITION = 0x1010, LVM_GETITEMTEXTW = 0x1073;
  const int TEXT_OFFSET = 512, TEXT_CHARS = 260, ITEM_OFFSET = 16, ITEM_SIZE = 88;

  static string Quote(string s) {
    var sb = new StringBuilder("\"");
    foreach (char c in s) {
      if (c == '"' || c == '\\') sb.Append('\\').Append(c);
      else if (c < ' ') sb.AppendFormat("\\u{0:x4}", (int)c);
      else sb.Append(c);
    }
    return sb.Append('"').ToString();
  }

  public static string FolderWindows() {
    var parts = new List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      var cls = new StringBuilder(64);
      GetClassName(h, cls, 64);
      if (cls.ToString() != "CabinetWClass") return true;
      RECT r;
      if (!GetWindowRect(h, out r)) return true;
      parts.Add("{\"id\":" + h.ToInt64() + ",\"x\":" + r.L + ",\"y\":" + r.T + ",\"width\":" + (r.R - r.L) + ",\"height\":" + (r.B - r.T) + "}");
      return true;
    }, IntPtr.Zero);
    return "[" + string.Join(",", parts) + "]";
  }

  static IntPtr DesktopListView() {
    IntPtr view = FindWindowEx(FindWindow("Progman", null), IntPtr.Zero, "SHELLDLL_DefView", null);
    if (view == IntPtr.Zero) {
      EnumWindows((h, l) => {
        IntPtr v = FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (v == IntPtr.Zero) return true;
        view = v;
        return false;
      }, IntPtr.Zero);
    }
    IntPtr list = FindWindowEx(view, IntPtr.Zero, "SysListView32", null);
    if (list == IntPtr.Zero) throw new Exception("desktop list view not found");
    return list;
  }

  static byte[] Read(IntPtr proc, IntPtr at, int size) {
    var buf = new byte[size];
    UIntPtr done;
    if (!ReadProcessMemory(proc, at, buf, (UIntPtr)size, out done)) throw new Exception("ReadProcessMemory failed");
    return buf;
  }

  /** Every desktop icon: label and the top-left of its cell in physical pixels. */
  public static string Icons() {
    IntPtr list = DesktopListView();
    uint pid;
    GetWindowThreadProcessId(list, out pid);
    IntPtr proc = OpenProcess(0x0008 | 0x0010 | 0x0020, false, pid);
    if (proc == IntPtr.Zero) throw new Exception("cannot open Explorer");
    IntPtr mem = VirtualAllocEx(proc, IntPtr.Zero, (UIntPtr)4096, 0x1000 | 0x2000, 0x04);
    try {
      if (mem == IntPtr.Zero) throw new Exception("VirtualAllocEx failed");
      int count = SendMessage(list, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero).ToInt32();
      var item = new byte[ITEM_SIZE];
      BitConverter.GetBytes(mem.ToInt64() + TEXT_OFFSET).CopyTo(item, 24);   // LVITEMW.pszText (x64 layout)
      BitConverter.GetBytes(TEXT_CHARS).CopyTo(item, 32);                     // LVITEMW.cchTextMax
      UIntPtr done;
      var parts = new List<string>();
      for (int i = 0; i < count; i++) {
        SendMessage(list, LVM_GETITEMPOSITION, (IntPtr)i, mem);
        byte[] pt = Read(proc, mem, 8);
        if (!WriteProcessMemory(proc, mem + ITEM_OFFSET, item, (UIntPtr)ITEM_SIZE, out done)) throw new Exception("WriteProcessMemory failed");
        SendMessage(list, LVM_GETITEMTEXTW, (IntPtr)i, mem + ITEM_OFFSET);
        string name = Encoding.Unicode.GetString(Read(proc, mem + TEXT_OFFSET, TEXT_CHARS * 2));
        int end = name.IndexOf('\0');
        if (end >= 0) name = name.Substring(0, end);
        parts.Add("{\"name\":" + Quote(name) + ",\"x\":" + BitConverter.ToInt32(pt, 0) + ",\"y\":" + BitConverter.ToInt32(pt, 4) + "}");
      }
      return "[" + string.Join(",", parts) + "]";
    } finally {
      if (mem != IntPtr.Zero) VirtualFreeEx(proc, mem, UIntPtr.Zero, 0x8000);
      CloseHandle(proc);
    }
  }

  public static void Move(int index, int x, int y) {
    IntPtr list = DesktopListView();
    SendMessage(list, LVM_SETITEMPOSITION, (IntPtr)index, (IntPtr)((y << 16) | (x & 0xFFFF)));
  }
}
"@

while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    $req = $line | ConvertFrom-Json
    switch ($req.op) {
      'windows' { $out = [ChekushkaDesktop]::FolderWindows() }
      'icons' { $out = [ChekushkaDesktop]::Icons() }
      'move' { [ChekushkaDesktop]::Move([int]$req.index, [int]$req.x, [int]$req.y); $out = 'null' }
      default { throw "unknown op $($req.op)" }
    }
    [Console]::Out.WriteLine('{"ok":true,"result":' + $out + '}')
  } catch {
    [Console]::Out.WriteLine((@{ ok = $false; error = "$_" } | ConvertTo-Json -Compress))
  }
  [Console]::Out.Flush()
}
`;

/** Runs the PowerShell helper and sends it one request at a time; restarts it if it dies. */
class WindowsHelper {
  constructor() {
    this.proc = null;
    this.queue = [];          // { request, resolve, reject }
    this.busy = null;
    this.buffer = '';
    this.disposed = false;
    this.restartAt = 0;
  }

  request(request) {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.#pump();
    });
  }

  dispose() {
    this.disposed = true;
    this.proc?.kill();
    this.#failAll(new Error('desktop helper stopped'));
  }

  #start() {
    if (Date.now() < this.restartAt) throw new Error('desktop helper is restarting');
    const encoded = Buffer.from(WIN_HELPER, 'utf16le').toString('base64');
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => this.#onData(chunk));
    proc.stderr.on('data', (chunk) => console.error('desktop helper:', String(chunk).trim()));
    proc.on('error', (err) => console.error('desktop helper failed to start:', err.message));
    proc.on('exit', (code) => {
      if (this.proc !== proc) return;
      this.proc = null;
      this.restartAt = Date.now() + HELPER_RESTART_MS;
      if (!this.disposed) console.error(`desktop helper exited (${code})`);
      this.#failAll(new Error('desktop helper exited'));
    });
    this.proc = proc;
  }

  #pump() {
    if (this.busy || this.queue.length === 0 || this.disposed) return;
    try {
      if (!this.proc) this.#start();
    } catch (err) {
      this.#failAll(err);
      return;
    }
    this.busy = this.queue.shift();
    this.busy.timer = setTimeout(() => this.proc?.kill(), HELPER_TIMEOUT_MS);
    this.proc.stdin.write(`${JSON.stringify(this.busy.request)}\n`);
  }

  #onData(chunk) {
    this.buffer += chunk;
    let nl;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line || !this.busy) continue;
      const job = this.busy;
      this.busy = null;
      clearTimeout(job.timer);
      try {
        const reply = JSON.parse(line);
        if (reply.ok) job.resolve(reply.result); else job.reject(new Error(reply.error));
      } catch (err) {
        job.reject(new Error(`desktop helper sent bad JSON: ${err.message}`));
      }
      this.#pump();
    }
  }

  #failAll(err) {
    const jobs = [...(this.busy ? [this.busy] : []), ...this.queue];
    this.busy = null;
    this.queue = [];
    jobs.forEach((j) => { clearTimeout(j.timer); j.reject(err); });
  }
}

function windowsBackend(screen, desktopDir) {
  const helper = new WindowsHelper();
  const isFolder = (name) => {
    try { return fs.statSync(path.join(desktopDir, name)).isDirectory(); } catch { return false; }
  };
  const iconCentre = (icon) => {
    const p = screen.screenToDipPoint({ x: icon.x, y: icon.y });
    return { x: p.x + WIN_ICON_CENTER.x, y: p.y + WIN_ICON_CENTER.y };
  };
  return {
    listFolderWindows: async () => (await helper.request({ op: 'windows' })).map((w) => (
      { id: w.id, ...screen.screenToDipRect(null, { x: w.x, y: w.y, width: w.width, height: w.height }) })),
    listDesktopFolders: async () => (await helper.request({ op: 'icons' }))
      .filter((icon) => isFolder(icon.name))
      .map((icon) => ({ name: icon.name, ...iconCentre(icon) })),
    async moveDesktopFolder(name, x, y) {
      const icons = await helper.request({ op: 'icons' });
      const index = icons.findIndex((icon) => icon.name === name);
      if (index < 0) throw new Error(`no desktop icon named ${name}`);
      const p = screen.dipToScreenPoint({ x: x - WIN_ICON_CENTER.x, y: y - WIN_ICON_CENTER.y });
      await helper.request({ op: 'move', index, x: Math.round(p.x), y: Math.round(p.y) });
    },
    dispose: () => helper.dispose(),
  };
}

/** The platform's desktop access, or null where there is none. */
function createDesktopBackend({ screen, desktopDir }) {
  if (process.platform === 'darwin') return macBackend();
  if (process.platform === 'win32') return windowsBackend(screen, desktopDir);
  return null;
}

// MARK: Folder windows

/** Polls the open folder windows and calls `onOpened(rect)` for each one that was not there on the previous poll. */
class FolderWindowWatcher {
  constructor(backend, onOpened) {
    this.backend = backend;
    this.onOpened = onOpened;
    this.known = null;            // Set of window ids
    this.timer = null;
    this.polling = false;
    this.lastError = null;
  }

  start() {
    this.timer = setInterval(() => this.#poll(), WINDOW_POLL_MS);
    this.#poll();
  }

  stop() { clearInterval(this.timer); }

  async #poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const windows = await this.backend.listFolderWindows();
      const ids = new Set(windows.map((w) => w.id));
      if (this.known) for (const w of windows) if (!this.known.has(w.id)) this.onOpened(w);
      this.known = ids;
      this.lastError = null;
    } catch (err) {
      if (err.message !== this.lastError) console.error('folder windows:', err.message);   // log each new failure once
      this.lastError = err.message;
    } finally {
      this.polling = false;
    }
  }
}

// MARK: Desktop folders

/** Moves folder icons and remembers where each one stood before the mascot first touched it, so it can be put back. */
class DesktopFolders {
  constructor(backend, stateDir) {
    this.backend = backend;
    this.file = path.join(stateDir, 'folder-origins.json');
    this.origins = this.#readOrigins();     // name → { x, y }
    this.pending = new Map();               // name → latest requested position while a move is running
    this.moving = new Set();
  }

  list() { return this.backend.listDesktopFolders(); }

  get hasMoved() { return Object.keys(this.origins).length > 0; }

  /** Asks for the icon to go to (x, y). Requests that arrive while a move is running collapse into the latest one. */
  async move(name, x, y) {
    if (this.moving.has(name)) { this.pending.set(name, { x, y }); return; }
    this.moving.add(name);
    try {
      if (!(name in this.origins)) await this.#rememberOrigin(name);
      let next = { x, y };
      while (next) {
        await this.backend.moveDesktopFolder(name, next.x, next.y);
        next = this.pending.get(name) ?? null;
        this.pending.delete(name);
      }
    } finally {
      this.moving.delete(name);
    }
  }

  /** Puts every moved folder back where it was. Returns how many went back. */
  async reset() {
    const entries = Object.entries(this.origins);
    const failed = {};
    for (const [name, p] of entries) {
      try {
        await this.backend.moveDesktopFolder(name, p.x, p.y);
      } catch (err) {
        console.error(`folder reset: cannot move "${name}" back:`, err.message);
        if (!/no desktop icon|Can’t get|Can't get/.test(err.message)) failed[name] = p;   // gone folders are forgotten
      }
    }
    this.origins = failed;
    this.#writeOrigins();
    return entries.length - Object.keys(failed).length;
  }

  async #rememberOrigin(name) {
    const folder = (await this.list()).find((f) => f.name === name);
    if (!folder) throw new Error(`no desktop folder named ${name}`);
    this.origins = { ...this.origins, [name]: { x: folder.x, y: folder.y } };
    this.#writeOrigins();
  }

  #readOrigins() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Object.fromEntries(Object.entries(parsed).filter(([, p]) => Number.isFinite(p?.x) && Number.isFinite(p?.y)));
    } catch (err) {
      if (err.code !== 'ENOENT') console.error(`folder origins: cannot read ${this.file}:`, err.message);
      return {};
    }
  }

  #writeOrigins() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.origins, null, 2));
    } catch (err) {
      console.error(`folder origins: cannot save ${this.file}:`, err.message);
    }
  }
}

/** Recognizes a drag that starts on a desktop folder; asynchronous lookups belong to one button press only. */
class FolderDragTracker {
  constructor(listFolders, onDrag) {
    this.listFolders = listFolders;
    this.onDrag = onDrag;
    this.press = null;
  }

  update(point, down) {
    if (!down) {
      if (this.press?.chasing) this.onDrag(null);
      this.press = null;
      return;
    }
    if (!this.press) {
      const press = this.press = { start: { ...point }, folder: false, chasing: false };
      this.listFolders().then((folders) => {
        if (this.press !== press) return;
        press.folder = folders.some((f) => Math.abs(f.x - press.start.x) <= 36 && Math.abs(f.y - press.start.y) <= 40);
      }).catch((err) => console.error('folder drag lookup:', err.message));
    }
    const press = this.press;
    if (!press.folder || (!press.chasing && Math.hypot(point.x - press.start.x, point.y - press.start.y) < 6)) return;
    press.chasing = true;
    this.onDrag({ ...point });
  }
}

module.exports = { createMacFolderDragReader, PasteboardFolderDragTracker, FolderDragTracker, createDesktopBackend, FolderWindowWatcher, DesktopFolders };
