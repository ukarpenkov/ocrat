import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";
import { root } from "./common.mjs";

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function unfilter(filter, row, previous, bytesPerPixel) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const up = previous[index];
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    if (filter === 1) row[index] = (row[index] + left) & 255;
    else if (filter === 2) row[index] = (row[index] + up) & 255;
    else if (filter === 3) row[index] = (row[index] + ((left + up) >> 1)) & 255;
    else if (filter === 4) row[index] = (row[index] + paeth(left, up, upLeft)) & 255;
    else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
  }
}

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(pngSignature)) throw new Error("Icon source is not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        throw new Error("Icon source PNG must be non-interlaced 8-bit RGB");
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (bitDepth !== 8 || channels === 0 || width === 0 || height === 0) {
    throw new Error("Icon source PNG must be 8-bit RGB or RGBA");
  }
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const expected = (stride + 1) * height;
  if (inflated.length < expected) throw new Error("Icon source PNG is truncated");
  const rgba = Buffer.alloc(width * height * 4);
  let source = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[source];
    source += 1;
    const row = Buffer.from(inflated.subarray(source, source + stride));
    source += stride;
    unfilter(filter, row, previous, channels);
    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      rgba[to] = row[from];
      rgba[to + 1] = row[from + 1];
      rgba[to + 2] = row[from + 2];
      rgba[to + 3] = channels === 4 ? row[from + 3] : 255;
    }
    previous = row;
  }
  return { width, height, rgba };
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function resize(src, sw, sh, dw, dh) {
  const dst = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    const y0 = (y * sh) / dh;
    const y1 = ((y + 1) * sh) / dh;
    const iy0 = Math.floor(y0);
    const iy1 = Math.min(sh, Math.ceil(y1));
    for (let x = 0; x < dw; x += 1) {
      const x0 = (x * sw) / dw;
      const x1 = ((x + 1) * sw) / dw;
      const ix0 = Math.floor(x0);
      const ix1 = Math.min(sw, Math.ceil(x1));
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let coverage = 0;
      for (let iy = iy0; iy < iy1; iy += 1) {
        const yWeight = Math.min(y1, iy + 1) - Math.max(y0, iy);
        for (let ix = ix0; ix < ix1; ix += 1) {
          const weight = yWeight * (Math.min(x1, ix + 1) - Math.max(x0, ix));
          const pixel = (iy * sw + ix) * 4;
          const pixelAlpha = src[pixel + 3] / 255;
          red += src[pixel] * pixelAlpha * weight;
          green += src[pixel + 1] * pixelAlpha * weight;
          blue += src[pixel + 2] * pixelAlpha * weight;
          alpha += pixelAlpha * weight;
          coverage += weight;
        }
      }
      const out = (y * dw + x) * 4;
      dst[out] = alpha === 0 ? 0 : clampByte(red / alpha);
      dst[out + 1] = alpha === 0 ? 0 : clampByte(green / alpha);
      dst[out + 2] = alpha === 0 ? 0 : clampByte(blue / alpha);
      dst[out + 3] = coverage === 0 ? 0 : clampByte((alpha / coverage) * 255);
    }
  }
  return dst;
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    pngSignature,
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

function quiet(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

function pow5(value) {
  return value * value * value * value * value;
}

function squircleCover(x, y, size) {
  const x0 = (x / size) * 2 - 1;
  const x1 = ((x + 1) / size) * 2 - 1;
  const y0 = (y / size) * 2 - 1;
  const y1 = ((y + 1) / size) * 2 - 1;
  const farX = Math.max(Math.abs(x0), Math.abs(x1));
  const farY = Math.max(Math.abs(y0), Math.abs(y1));
  if (pow5(farX) + pow5(farY) <= 1) return 1;
  const nearX = Math.min(Math.abs(x0), Math.abs(x1));
  const nearY = Math.min(Math.abs(y0), Math.abs(y1));
  if (pow5(nearX) + pow5(nearY) >= 1) return 0;
  const samples = 3;
  let cover = 0;
  for (let sy = 0; sy < samples; sy += 1) {
    for (let sx = 0; sx < samples; sx += 1) {
      const px = Math.abs(((x + (sx + 0.5) / samples) / size) * 2 - 1);
      const py = Math.abs(((y + (sy + 0.5) / samples) / size) * 2 - 1);
      if (pow5(px) + pow5(py) <= 1) cover += 1;
    }
  }
  return cover / (samples * samples);
}

function applySquircle(rgba, size) {
  const out = Buffer.from(rgba);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cover = squircleCover(x, y, size);
      if (cover === 1) continue;
      const index = (y * size + x) * 4 + 3;
      out[index] = Math.round(out[index] * cover);
    }
  }
  return out;
}

function rounded(rgba, width, height, size) {
  return applySquircle(resize(rgba, width, height, size, size), size);
}

function writeIcns(rgba, width, height, destination) {
  if (process.platform !== "darwin") return;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "ocrat-icon-"));
  const iconset = path.join(parent, "icon.iconset");
  fs.mkdirSync(iconset);
  try {
    for (const size of [16, 32, 128, 256, 512]) {
      fs.writeFileSync(
        path.join(iconset, `icon_${size}x${size}.png`),
        encodePng(size, rounded(rgba, width, height, size))
      );
      const retina = size * 2;
      fs.writeFileSync(
        path.join(iconset, `icon_${size}x${size}@2x.png`),
        encodePng(retina, rounded(rgba, width, height, retina))
      );
    }
    quiet("iconutil", ["-c", "icns", iconset, "-o", destination]);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

export function buildIcons() {
  const iconDir = path.join(root, "resources", "icons");
  const sourcePath = path.join(iconDir, "icon-source.png");
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing ${sourcePath}`);
  }
  const { width, height, rgba } = decodePng(fs.readFileSync(sourcePath));
  const square = (size) => encodePng(size, rounded(rgba, width, height, size));
  fs.writeFileSync(path.join(iconDir, "appIcon.png"), square(256));
  fs.writeFileSync(path.join(iconDir, "icon.ico"), ico([16, 32, 48, 256].map((size) => ({
    size,
    png: square(size)
  }))));
  const icns = path.join(iconDir, "icon.icns");
  writeIcns(rgba, width, height, icns);
  console.log(`icons: ${width}x${height} source`);
  return icns;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  buildIcons();
}
