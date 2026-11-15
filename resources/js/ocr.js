import { fail } from "./errors.js";

const ADAPTER_NAME = NL_OS === "Windows" ? "ocrat-ocr.exe" : "ocrat-ocr";
const TIMEOUT_MS = 120000;

let proc = null;
let stdout = "";
let waiters = [];
let busy = false;

function namesMatch(actual, expected) {
  if (NL_OS === "Windows") return actual.toLowerCase() === expected.toLowerCase();
  return actual === expected;
}

function quoteAdapter(filePath) {
  if (NL_OS === "Windows") {
    if (/["\r\n%^!]/.test(filePath)) throw fail("adapter-missing");
    return `"${filePath}"`;
  }
  if (/['\r\n]/.test(filePath)) throw fail("adapter-missing");
  return `'${filePath}'`;
}

async function resolveAdapter() {
  const executable = NL_ARGS && NL_ARGS[0];
  if (!executable) throw fail("adapter-missing");
  const executablePath = await Neutralino.filesystem.getNormalizedPath(
    await Neutralino.filesystem.getAbsolutePath(executable)
  );
  const executableParts = await Neutralino.filesystem.getPathParts(executablePath);
  const candidate = await Neutralino.filesystem.getJoinedPath(
    executableParts.parentPath,
    ADAPTER_NAME
  );
  const adapterPath = await Neutralino.filesystem.getNormalizedPath(
    await Neutralino.filesystem.getAbsolutePath(candidate)
  );
  const adapterParts = await Neutralino.filesystem.getPathParts(adapterPath);
  const executableDir = await Neutralino.filesystem.getNormalizedPath(executableParts.parentPath);
  const adapterDir = await Neutralino.filesystem.getNormalizedPath(adapterParts.parentPath);
  if (!namesMatch(adapterParts.filename, ADAPTER_NAME) || !namesMatch(executableDir, adapterDir)) {
    throw fail("adapter-missing");
  }
  let stats;
  try {
    stats = await Neutralino.filesystem.getStats(adapterPath);
  } catch {
    throw fail("adapter-missing");
  }
  if (!stats.isFile) throw fail("adapter-missing");
  return quoteAdapter(adapterPath);
}

function finish(waiter, error, value) {
  if (!waiter || waiter.done) return;
  waiter.done = true;
  clearTimeout(waiter.timer);
  if (error) waiter.reject(error);
  else waiter.resolve(value);
}

function takeLine() {
  const index = stdout.indexOf("\n");
  if (index === -1 || waiters.length === 0) return;
  const line = stdout.slice(0, index).replace(/\r$/, "");
  stdout = stdout.slice(index + 1);
  const waiter = waiters.shift();
  try {
    const payload = JSON.parse(line);
    if (payload && typeof payload.error === "string") finish(waiter, fail(payload.error));
    else if (payload && typeof payload.text === "string") finish(waiter, null, payload.text);
    else finish(waiter, fail("ocr-failed"));
  } catch {
    finish(waiter, fail("ocr-failed"));
  }
}

function onSpawned(event) {
  if (!proc || event.detail.id !== proc.id) return;
  if (event.detail.action === "stdOut") {
    stdout += event.detail.data;
    takeLine();
    return;
  }
  if (event.detail.action === "exit") {
    const pending = waiters.splice(0);
    proc = null;
    stdout = "";
    for (const waiter of pending) finish(waiter, fail("ocr-failed"));
  }
}

export function startAdapterEvents() {
  Neutralino.events.on("spawnedProcess", onSpawned);
}

async function ensureProcess() {
  if (proc) return proc;
  const command = await resolveAdapter();
  proc = await Neutralino.os.spawnProcess(command);
  stdout = "";
  return proc;
}

function dropWaiter(waiter) {
  waiters = waiters.filter((item) => item !== waiter);
}

export async function recognizeFile(filePath) {
  if (busy) throw fail("busy");
  busy = true;
  try {
    const current = await ensureProcess();
    const response = new Promise((resolve, reject) => {
      const waiter = { resolve, reject, done: false, timer: 0 };
      waiter.timer = setTimeout(() => {
        dropWaiter(waiter);
        finish(waiter, fail("ocr-failed"));
        if (proc && proc.id === current.id) {
          Neutralino.os.updateSpawnedProcess(proc.id, "exit").catch(() => {});
          proc = null;
        }
      }, TIMEOUT_MS);
      waiters.push(waiter);
      takeLine();
    });
    try {
      await Neutralino.os.updateSpawnedProcess(
        current.id,
        "stdIn",
        `${JSON.stringify({ image: filePath })}\n`
      );
    } catch {
      proc = null;
      finish(waiters.pop(), fail("ocr-failed"));
    }
    return await response;
  } finally {
    busy = false;
  }
}
