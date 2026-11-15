# ocrat

Локальное распознавание текста на снимке. Картинка не уходит в сеть. Версия 1.0.1.

Ориентиры по скорости из [docs/about.md](docs/about.md) ещё не замерены. Пакеты из GitHub Release собраны CI и не проверялись запуском. Сборка Windows на машине разработки не выполняется и числится непроверенной. Подпись описана в [docs/signing.md](docs/signing.md).

## macOS Apple Silicon

Нужны Node.js 22, Xcode Command Line Tools и Swift.

```bash
npm ci
npm run icons
npm run adapter:mac
npx neu update
npx neu plugins --add @neutralinojs-contrib/builder
npm run dev
```

Пакеты `.app` и `.dmg`:

```bash
npm run build
npm run package:mac
```

Файлы появляются в `dist/release/`: `ocrat-1.0.1-mac-arm64.app.zip` и `ocrat-1.0.1-mac-arm64.dmg`. Внутри `.app` рядом с программой лежит `ocrat-ocr`. Каталог `dist/builder-mac` — отдельный DMG плагина Neutralino без этого адаптера, в релиз он не входит.

## Windows x64

Нужны Node.js 22, Visual Studio 2022 с C++ и Windows SDK, CMake и NSIS.

```powershell
npm ci
npm run icons
pwsh packaging/build-windows-adapter.ps1
npx neu update
npx neu plugins --add @neutralinojs-contrib/builder
npm run build
npm run package:win
```

Файлы появляются в `dist/release/`: `ocrat-1.0.1-win-x64.zip` (`ocrat.exe` и `ocrat-ocr.exe`) и `ocrat-1.0.1-win-x64-setup.exe`. Каталог `dist/builder-win` — установщик плагина Neutralino без адаптера, в релиз он не входит.

`neu build` качает бинарники Neutralino для других систем. В релиз они не входят.

## Релиз

Тег `v1.0.1` запускает [.github/workflows/release.yml](.github/workflows/release.yml). macOS arm64 собирается на `macos-15` (образ `macos-14` снят), Windows x64 на `windows-2022`.
