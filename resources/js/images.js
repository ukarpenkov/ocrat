import { fail } from "./errors.js";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif)$/i;

function component(pixel, mask, shift) {
  if (!mask) return 255;
  let value = (pixel & mask) >>> shift;
  let bits = 0;
  let probe = mask >>> shift;
  while (probe) {
    bits += 1;
    probe >>>= 1;
  }
  if (bits > 8) value >>>= bits - 8;
  return value & 255;
}

function decodeBase64(value) {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesOf(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === "string") return decodeBase64(data);
  throw fail("corrupt");
}

export function clipboardToRgba(image) {
  const width = image.width | 0;
  const height = image.height | 0;
  const channels = Math.floor((image.bpp || 32) / 8);
  const stride = image.bpr | 0;
  if (width < 1 || height < 1 || channels < 3 || stride < width * channels) {
    throw fail("corrupt");
  }
  const source = bytesOf(image.data);
  if (source.length < stride * height) throw fail("corrupt");
  const out = new Uint8ClampedArray(width * height * 4);
  const redShift = image.redShift | 0;
  const greenShift = image.greenShift | 0;
  const blueShift = image.blueShift | 0;
  const alphaShift = image.alphaShift | 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = y * stride + x * channels;
      let pixel = 0;
      for (let i = 0; i < channels && i < 4; i += 1) {
        pixel |= source[offset + i] << (8 * i);
      }
      pixel >>>= 0;
      const target = (y * width + x) * 4;
      out[target] = component(pixel, image.redMask >>> 0, redShift);
      out[target + 1] = component(pixel, image.greenMask >>> 0, greenShift);
      out[target + 2] = component(pixel, image.blueMask >>> 0, blueShift);
      out[target + 3] = image.alphaMask
        ? component(pixel, image.alphaMask >>> 0, alphaShift)
        : 255;
    }
  }
  return out;
}

export function rgbaToPngBlob(rgba, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const pixels = context.createImageData(width, height);
  pixels.data.set(rgba);
  context.putImageData(pixels, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) reject(fail("corrupt"));
      else resolve(blob);
    }, "image/png");
  });
}

export async function assertDecodable(blob) {
  if (!blob || blob.size === 0) throw fail("corrupt");
  try {
    const bitmap = await createImageBitmap(blob);
    bitmap.close();
  } catch {
    throw fail("corrupt");
  }
}

export function isImageFile(file) {
  if (!file || !file.name) return false;
  if (file.type && file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name);
}

async function binaryToBlob(data, name) {
  const bytes = bytesOf(data);
  const type = IMAGE_EXT.test(name) ? "" : "application/octet-stream";
  return new Blob([bytes], type ? { type } : undefined);
}

export async function readImageFile(filePath) {
  let data;
  try {
    data = await Neutralino.filesystem.readBinaryFile(filePath);
  } catch {
    throw fail("unreadable");
  }
  const blob = await binaryToBlob(data, filePath);
  await assertDecodable(blob);
  return blob;
}

export async function readClipboardImage() {
  const format = await Neutralino.clipboard.getFormat();
  if (format !== "image") throw fail("empty-clipboard");
  const image = await Neutralino.clipboard.readImage();
  if (!image || !image.width || !image.height) throw fail("empty-clipboard");
  const rgba = clipboardToRgba(image);
  const blob = await rgbaToPngBlob(rgba, image.width, image.height);
  await assertDecodable(blob);
  return blob;
}
