# ocrat

Local OCR for a screenshot or image file. The image stays on the machine. Version 1.0.1.

macOS Apple Silicon (arm64) and Windows x64. Russian and English are read in one pass. Input: clipboard image, file dialog, or drag-and-drop (`png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`, `tif`, `tiff`, `heic`, `heif`). The result is editable text; Copy writes it to the clipboard.

## Download

[v1.0.1](https://github.com/ukarpenkov/ocrat/releases/tag/v1.0.1)

- [ocrat-1.0.1-mac-arm64.dmg](https://github.com/ukarpenkov/ocrat/releases/download/v1.0.1/ocrat-1.0.1-mac-arm64.dmg)
- [ocrat-1.0.1-mac-arm64.app.zip](https://github.com/ukarpenkov/ocrat/releases/download/v1.0.1/ocrat-1.0.1-mac-arm64.app.zip)
- [ocrat-1.0.1-win-x64-setup.exe](https://github.com/ukarpenkov/ocrat/releases/download/v1.0.1/ocrat-1.0.1-win-x64-setup.exe)
- [ocrat-1.0.1-win-x64.zip](https://github.com/ukarpenkov/ocrat/releases/download/v1.0.1/ocrat-1.0.1-win-x64.zip)

Builds are unsigned. Gatekeeper and SmartScreen warn before a downloaded copy starts. The `.app` and the Windows zip include `ocrat-ocr` next to the main executable.

## Stack

- [Neutralinojs](https://neutralino.js.org/) 6.10.0 — window, system webview, filesystem, clipboard, and process API. CLI: `@neutralinojs/neu` 11.8.0. Packages: `@neutralinojs-contrib/builder`.
- UI — HTML, CSS, and JavaScript in `resources/`. Node.js 22 is used to build and package.
- macOS adapter `ocrat-ocr` — Swift executable (`adapters/macos`). Apple Vision `VNRecognizeTextRequest` (`ru-RU`, `en-US`), ImageIO, CoreGraphics. macOS 13+.
- Windows adapter `ocrat-ocr.exe` — C++20 and C++/WinRT (`adapters/windows`). `Windows.Media.Ocr` with the Russian and English engines. CMake 3.24, Windows SDK `cppwinrt`.

## Run from a GitHub clone

```bash
git clone https://github.com/ukarpenkov/ocrat.git
cd ocrat
```

### macOS Apple Silicon

Node.js 22, Xcode Command Line Tools, Swift.

```bash
npm ci
npm run icons
npm run adapter:mac
npx neu update
npx neu plugins --add @neutralinojs-contrib/builder
npm run dev
```

`.app` and `.dmg` in `dist/release/`:

```bash
npm run build
npm run package:mac
```

### Windows x64

Node.js 22, Visual Studio 2022 with C++ and the Windows SDK, CMake, NSIS.

```powershell
npm ci
npm run icons
pwsh packaging/build-windows-adapter.ps1
npx neu update
npx neu plugins --add @neutralinojs-contrib/builder
npm run build
npm run package:win
```

Portable zip and NSIS installer land in `dist/release/`.

Tag `v*.*.*` runs [.github/workflows/release.yml](.github/workflows/release.yml): macOS arm64 on `macos-15`, Windows x64 on `windows-2022`.
