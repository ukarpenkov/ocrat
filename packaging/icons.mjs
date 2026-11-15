import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { ensureDir, root } from "./common.mjs";

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(8 + body.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 4 + body.length);
  return out;
}

export function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const border = Math.max(1, Math.round(size * 0.08));
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const edge = x < border || y < border || x >= size - border || y >= size - border;
      const offset = row + 1 + x * 4;
      const value = edge ? 0 : 255;
      raw[offset] = value;
      raw[offset + 1] = value;
      raw[offset + 2] = value;
      raw[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function ico(images) {
  const directory = Buffer.alloc(6);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map((image) => {
    const entry = Buffer.alloc(16);
    entry[0] = image.size >= 256 ? 0 : image.size;
    entry[1] = image.size >= 256 ? 0 : image.size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.png.length;
    return entry;
  });
  return Buffer.concat([directory, ...entries, ...images.map((image) => image.png)]);
}

const iconDir = path.join(root, "resources", "icons");
ensureDir(iconDir);
fs.writeFileSync(path.join(iconDir, "icon-source.png"), png(1024));
fs.writeFileSync(path.join(iconDir, "appIcon.png"), png(256));
fs.writeFileSync(path.join(iconDir, "icon.ico"), ico([16, 32, 48, 256].map((size) => ({
  size,
  png: png(size)
}))));
