# ocrat

Local OCR for a screenshot or an image file. The picture stays on the computer. Version 2.0.0.

macOS Apple Silicon (arm64) and Windows x64. Russian and English are read in one pass. Paste a screenshot, choose a file, or drop it on the window. The text can be edited. Copy writes it to the clipboard.

Close, minimize, and zoom are the system window buttons. macOS draws them in the title bar. Windows draws them on the caption bar.

## Download

[Release 2.0.0](https://github.com/ukarpenkov/ocrat/releases/tag/v2.0.0)

- Windows installer: [ocrat-2.0.0-win-x64-setup.exe](https://github.com/ukarpenkov/ocrat/releases/download/v2.0.0/ocrat-2.0.0-win-x64-setup.exe)
- Mac package: [ocrat-2.0.0-mac-arm64.dmg](https://github.com/ukarpenkov/ocrat/releases/download/v2.0.0/ocrat-2.0.0-mac-arm64.dmg)

The same release also has a portable Windows zip and a zipped Mac app:

- [ocrat-2.0.0-win-x64.zip](https://github.com/ukarpenkov/ocrat/releases/download/v2.0.0/ocrat-2.0.0-win-x64.zip)
- [ocrat-2.0.0-mac-arm64.app.zip](https://github.com/ukarpenkov/ocrat/releases/download/v2.0.0/ocrat-2.0.0-mac-arm64.app.zip)

Builds are unsigned. Gatekeeper and SmartScreen warn before a downloaded copy starts. The `.app` and the Windows zip include `ocrat-ocr` next to the main executable.

## Stack

- [Neutralinojs](https://neutralino.js.org/) 6.10.0 — window, system webview, filesystem, clipboard, and process API. CLI: `@neutralinojs/neu` 11.8.0.
- UI — HTML, CSS, and JavaScript in `resources/`. Node.js 22 builds and packages the app.
- macOS adapter `ocrat-ocr` — Swift (`adapters/macos`). Apple Vision, Russian and English. macOS 13+.
- Windows adapter `ocrat-ocr.exe` — C++20 and C++/WinRT (`adapters/windows`). `Windows.Media.Ocr`, Russian and English.

## Build

```bash
git clone https://github.com/ukarpenkov/ocrat.git
cd ocrat
```

macOS Apple Silicon needs Node.js 22, Xcode Command Line Tools, and Swift.

```bash
npm ci
npm run icons
npm run adapter:mac
npx neu update
npx neu plugins --add @neutralinojs-contrib/builder
npm run dev
```

`.app` and `.dmg` land in `dist/release/`:

```bash
npm run build
npm run package:mac
```

Windows x64 needs Node.js 22, Visual Studio 2022 with C++ and the Windows SDK, CMake, and NSIS.

```powershell
npm ci
npm run icons
pwsh packaging/build-windows-adapter.ps1
npx neu update
npx neu plugins --add @neutralinojs-contrib/builder
npm run build
npm run package:win
```

The portable zip and the NSIS installer land in `dist/release/`.

A tag `v*.*.*` runs [.github/workflows/release.yml](.github/workflows/release.yml): macOS arm64 on `macos-15`, Windows x64 on `windows-2022`.
