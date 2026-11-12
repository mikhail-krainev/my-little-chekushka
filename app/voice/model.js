'use strict';
// The offline Russian speech model for Vosk: downloaded once from alphacephei.com on the first use of the microphone,
// checked against a pinned SHA-256 and repacked from .zip to the .tar.gz that vosk-browser reads.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const zlib = require('node:zlib');

const gzip = promisify(zlib.gzip);

const MODEL = Object.freeze({
  url: 'https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip',
  sha256: '961d5ff98a17f4aa6de69864d0aa71fa5bac682301d2b5d17a3f24c5c99a46d4',
  size: 46236750,
  file: 'vosk-model-small-ru-0.22.tar.gz',
});

// MARK: zip → tar.gz (only what this model uses: stored or deflated entries, no zip64, no encryption)

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const EOCD_SEARCH = 0xffff + EOCD_MIN_SIZE;   // the comment after the record is at most 64 KiB
const METHOD = { stored: 0, deflated: 8 };
const TAR_BLOCK = 512;

/** Entries of a zip archive: [{ name, isDirectory, data }] in archive order. */
function readZip(zip) {
  const from = Math.max(0, zip.length - EOCD_SEARCH);
  let eocd = -1;
  for (let i = zip.length - EOCD_MIN_SIZE; i >= from; i--) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip archive');
  const count = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== CENTRAL_SIGNATURE) throw new Error('broken zip central directory');
    const method = zip.readUInt16LE(at + 10);
    const compressedSize = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28), extraLength = zip.readUInt16LE(at + 30), commentLength = zip.readUInt16LE(at + 32);
    const localAt = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;

    if (zip.readUInt32LE(localAt) !== LOCAL_SIGNATURE) throw new Error(`broken zip entry ${name}`);
    const dataAt = localAt + 30 + zip.readUInt16LE(localAt + 26) + zip.readUInt16LE(localAt + 28);
    const raw = zip.subarray(dataAt, dataAt + compressedSize);
    if (method !== METHOD.stored && method !== METHOD.deflated) throw new Error(`unsupported zip method ${method} in ${name}`);
    const isDirectory = name.endsWith('/');
    entries.push({ name, isDirectory, data: isDirectory ? Buffer.alloc(0) : method === METHOD.stored ? raw : zlib.inflateRawSync(raw) });
  }
  return entries;
}

function tarHeader(name, size, isDirectory) {
  if (Buffer.byteLength(name) > 100) throw new Error(`name too long for tar: ${name}`);
  const h = Buffer.alloc(TAR_BLOCK);
  const octal = (value, length) => value.toString(8).padStart(length - 1, '0') + '\0';
  h.write(name, 0, 100, 'utf8');
  h.write(octal(isDirectory ? 0o755 : 0o644, 8), 100);
  h.write(octal(0, 8), 108);                       // uid
  h.write(octal(0, 8), 116);                       // gid
  h.write(octal(size, 12), 124);
  h.write(octal(0, 12), 136);                      // mtime
  h.write(' '.repeat(8), 148);                     // checksum counts as spaces while it is computed
  h.write(isDirectory ? '5' : '0', 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  let sum = 0;
  for (const byte of h) sum += byte;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return h;
}

/** Repacks a zip archive (Buffer) as a gzipped tar (Buffer) with the same paths. */
async function zipToTarGz(zip) {
  const parts = [];
  for (const { name, isDirectory, data } of readZip(zip)) {
    parts.push(tarHeader(name, data.length, isDirectory));
    if (isDirectory) continue;
    parts.push(data);
    const pad = (TAR_BLOCK - (data.length % TAR_BLOCK)) % TAR_BLOCK;
    if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(2 * TAR_BLOCK));          // end of archive
  return gzip(Buffer.concat(parts), { level: 1 });
}

// MARK: Download

/** Path of the ready model archive in `dir`, or null while it has not been downloaded. */
function modelPath(dir) {
  const file = path.join(dir, MODEL.file);
  return fs.existsSync(file) ? file : null;
}

/**
 * Downloads, verifies and repacks the model into `dir`; resolves with the archive path.
 * @param onProgress (fraction 0...1) => void
 */
async function downloadModel(dir, onProgress = () => {}) {
  const ready = modelPath(dir);
  if (ready) return ready;
  const response = await fetch(MODEL.url);
  if (!response.ok) throw new Error(`model download failed: HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length')) || MODEL.size;
  const chunks = [];
  let received = 0;
  for await (const chunk of response.body) {
    chunks.push(chunk);
    received += chunk.length;
    onProgress(Math.min(received / total, 1));
  }
  const zip = Buffer.concat(chunks);
  const digest = crypto.createHash('sha256').update(zip).digest('hex');
  if (digest !== MODEL.sha256) throw new Error(`model checksum mismatch: ${digest}`);
  const archive = await zipToTarGz(zip);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, MODEL.file), partial = `${file}.part`;
  fs.writeFileSync(partial, archive);
  fs.renameSync(partial, file);
  return file;
}

module.exports = { MODEL, downloadModel, modelPath, readZip, zipToTarGz };
