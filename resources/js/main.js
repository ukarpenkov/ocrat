import { fail, message } from "./errors.js";
import { assertDecodable, isImageFile, readClipboardImage, readImageFile } from "./images.js";
import { recognizeFile, startAdapterEvents } from "./ocr.js";
import { bindTheme, loadTheme } from "./theme.js";
import { materialize, removeTemp } from "./temp.js";

const drop = document.querySelector("#drop");
const preview = document.querySelector("#preview");
const placeholder = document.querySelector("#placeholder");
const recognize = document.querySelector("#recognize");
const result = document.querySelector("#result");
const copy = document.querySelector("#copy");
const errorBox = document.querySelector("#error");

let source = null;
let previewUrl = "";
let pasteLock = false;
let working = false;

function showError(error) {
  errorBox.textContent = message(error);
}

function clearError() {
  errorBox.textContent = "";
}

function syncCopy() {
  copy.disabled = result.value.length === 0;
}

function selectedResultText() {
  const start = result.selectionStart;
  const end = result.selectionEnd;
  if (start == null || end == null || start === end) return "";
  return result.value.slice(start, end);
}

function writeClipboard(text) {
  return Neutralino.clipboard.writeText(text);
}

function plainCommand(event, code) {
  return (event.metaKey || event.ctrlKey)
    && !event.altKey
    && !event.shiftKey
    && !event.isComposing
    && event.code === code;
}

function installMacEditMenu() {
  if (window.NL_OS !== "Darwin") return;
  // WKWebView receives Cmd+C only when the menu bar owns that shortcut.
  // Paste is intentionally absent: Cmd+V still inserts a screenshot.
  Neutralino.window.setMainMenu([
    {
      text: "OCRat",
      menuItems: [
        { id: "hide", text: "Скрыть OCRat", action: "hide:", shortcut: "h" },
        { id: "hideOthers", text: "Скрыть остальные", action: "hideOtherApplications:" },
        { id: "showAll", text: "Показать все", action: "unhideAllApplications:" },
        { text: "-" },
        { id: "quit", text: "Завершить OCRat", action: "terminate:", shortcut: "q" }
      ]
    },
    {
      text: "Правка",
      menuItems: [
        { id: "undo", text: "Отменить", action: "undo:", shortcut: "z" },
        { id: "redo", text: "Повторить", action: "redo:", shortcut: "Z" },
        { text: "-" },
        { id: "cut", text: "Вырезать", action: "cut:", shortcut: "x" },
        { id: "copy", text: "Копировать", action: "copy:", shortcut: "c" },
        { id: "selectAll", text: "Выделить всё", action: "selectAll:", shortcut: "a" }
      ]
    }
  ]).catch(() => {});
}

function setImage(blob, next) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob);
  source = next;
  preview.src = previewUrl;
  preview.hidden = false;
  placeholder.hidden = true;
  recognize.disabled = false;
  clearError();
}

async function useBlob(blob, next) {
  await assertDecodable(blob);
  setImage(blob, next);
}

async function openFile() {
  let paths;
  try {
    paths = await Neutralino.os.showOpenDialog("Выберите изображение", {
      filters: [
        {
          name: "Изображения",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif"]
        }
      ]
    });
  } catch {
    showError(fail("unreadable"));
    return;
  }
  const filePath = Array.isArray(paths) ? paths.find((item) => item) : "";
  if (!filePath) return;
  try {
    const blob = await readImageFile(filePath);
    setImage(blob, { kind: "path", path: filePath });
  } catch (error) {
    showError(error);
  }
}

async function pasteClipboard() {
  if (pasteLock) return;
  pasteLock = true;
  try {
    const blob = await readClipboardImage();
    setImage(blob, { kind: "blob", blob });
  } catch (error) {
    showError(error);
  } finally {
    pasteLock = false;
  }
}

async function acceptDrop(event) {
  const files = event.dataTransfer ? Array.from(event.dataTransfer.files || []) : [];
  const file = files.find(isImageFile);
  if (!file) {
    showError(fail("not-image"));
    return;
  }
  try {
    const blob = file.slice(0, file.size, file.type || "application/octet-stream");
    await useBlob(blob, { kind: "blob", blob });
  } catch (error) {
    showError(error);
  }
}

async function runRecognition() {
  if (working || recognize.disabled || !source) return;
  working = true;
  recognize.disabled = true;
  clearError();
  let tempPath = "";
  try {
    tempPath = await materialize(source);
    result.value = await recognizeFile(tempPath);
    syncCopy();
  } catch (error) {
    showError(error);
  } finally {
    if (tempPath) await removeTemp(tempPath);
    working = false;
    recognize.disabled = !source;
  }
}

function bind() {
  bindTheme();
  drop.addEventListener("click", () => {
    openFile();
  });
  document.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
  drop.addEventListener("dragenter", () => drop.classList.add("dragover"));
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
  document.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("dragover");
    acceptDrop(event);
  });
  window.addEventListener("paste", (event) => {
    if (document.activeElement === result) return;
    event.preventDefault();
    pasteClipboard();
  });
  window.addEventListener("keydown", (event) => {
    if (document.activeElement === result && plainCommand(event, "KeyA")) {
      event.preventDefault();
      result.select();
      return;
    }
    if (document.activeElement === result && plainCommand(event, "KeyC")) {
      const text = selectedResultText();
      if (!text) return;
      event.preventDefault();
      writeClipboard(text);
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "v") return;
    if (document.activeElement === result) return;
    event.preventDefault();
    pasteClipboard();
  });
  result.addEventListener("copy", (event) => {
    const text = selectedResultText();
    if (!text) return;
    event.preventDefault();
    if (event.clipboardData) event.clipboardData.setData("text/plain", text);
    writeClipboard(text);
  });
  recognize.addEventListener("click", () => {
    runRecognition();
  });
  copy.addEventListener("click", async () => {
    await writeClipboard(result.value);
  });
  result.addEventListener("input", syncCopy);
}

function closeApp() {
  // Closing from the native close callback hits dispatch_sync on the main queue and aborts.
  const finish = window.NL_OS === "Darwin"
    ? () => Neutralino.app.killProcess()
    : () => Neutralino.app.exit();
  setTimeout(finish, 100);
}

bind();
if (window.NL_PORT) {
  Neutralino.init();
  Neutralino.events.on("windowClose", closeApp);
  startAdapterEvents();
  loadTheme();
  installMacEditMenu();
}
