const EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif"
]);

function extensionOf(filePath) {
  const match = /\.([A-Za-z0-9]+)$/.exec(filePath);
  const ext = match ? match[1].toLowerCase() : "png";
  return EXTENSIONS.has(ext) ? ext : "png";
}

async function ensureDir(dir) {
  try {
    await Neutralino.filesystem.createDirectory(dir);
  } catch {
    const stats = await Neutralino.filesystem.getStats(dir);
    if (!stats.isDirectory) throw new Error("temp");
  }
}

let sequence = 0;

export async function materialize(source) {
  const root = await Neutralino.os.getPath("temp");
  const dir = await Neutralino.filesystem.getJoinedPath(root, "ocrat");
  await ensureDir(dir);
  sequence += 1;
  const ext = source.kind === "path" ? extensionOf(source.path) : "png";
  const name = `frame-${Date.now()}-${sequence}.${ext}`;
  const dest = await Neutralino.filesystem.getJoinedPath(dir, name);
  if (source.kind === "path") {
    await Neutralino.filesystem.copy(source.path, dest, {
      recursive: false,
      overwrite: true,
      skip: false
    });
    return dest;
  }
  const bytes = new Uint8Array(await source.blob.arrayBuffer());
  await Neutralino.filesystem.writeBinaryFile(dest, bytes.buffer);
  return dest;
}

export async function removeTemp(filePath) {
  try {
    await Neutralino.filesystem.remove(filePath);
  } catch {
    /* The preview remains either way. */
  }
}
