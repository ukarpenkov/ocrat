import fs from "node:fs";
import path from "node:path";
import { ensureDir, firstExisting, readConfig, root, run, runNeu } from "./common.mjs";

const config = readConfig();
const version = config.version;
const binaryName = config.cli.binaryName;
const binary = path.join(root, "dist", binaryName, `${binaryName}-win_x64.exe`);
if (!fs.existsSync(binary)) {
  throw new Error(`Missing ${binary}. Run neu build --embed-resources on Windows x64 first.`);
}
const adapter = firstExisting([
  path.join(root, "bin", "ocrat-ocr.exe"),
  path.join(root, "adapters", "windows", "build", "Release", "ocrat-ocr.exe"),
  path.join(root, "adapters", "windows", "build", "ocrat-ocr.exe")
]);
if (!adapter) throw new Error("Missing the Windows OCR adapter.");

const stage = path.join(root, "dist", "staging", "windows");
fs.rmSync(stage, { recursive: true, force: true });
ensureDir(stage);
const appExe = path.join(stage, "ocrat.exe");
const adapterExe = path.join(stage, "ocrat-ocr.exe");
fs.copyFileSync(binary, appExe);
fs.copyFileSync(adapter, adapterExe);

const release = path.join(root, "dist", "release");
ensureDir(release);
const zip = path.join(release, `ocrat-${version}-win-x64.zip`);
const setup = path.join(release, `ocrat-${version}-win-x64-setup.exe`);
if (fs.existsSync(zip)) fs.rmSync(zip);
run("powershell", [
  "-NoProfile",
  "-Command",
  `Compress-Archive -Path '${appExe}','${adapterExe}' -DestinationPath '${zip}' -Force`
]);

const icon = path.join(root, "resources", "icons", "icon.ico").replaceAll("/", "\\");
const nsi = path.join(stage, "installer.nsi");
const quote = (value) => value.replaceAll("/", "\\");
fs.writeFileSync(nsi, `Unicode true
!include "MUI2.nsh"

Name "OCRat"
OutFile "${quote(setup)}"
InstallDir "$PROGRAMFILES64\\ocrat"
RequestExecutionLevel admin
!define MUI_ICON "${icon}"
!define MUI_UNICON "${icon}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section
  SetOutPath "$INSTDIR"
  File "${quote(appExe)}"
  File "${quote(adapterExe)}"
  CreateDirectory "$SMPROGRAMS\\OCRat"
  CreateShortcut "$SMPROGRAMS\\OCRat\\OCRat.lnk" "$INSTDIR\\ocrat.exe"
  WriteUninstaller "$INSTDIR\\Uninstall.exe"
  WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${config.applicationId}" "DisplayName" "OCRat"
  WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${config.applicationId}" "DisplayVersion" "${version}"
  WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${config.applicationId}" "Publisher" "ocrat"
  WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${config.applicationId}" "UninstallString" "$INSTDIR\\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\\ocrat.exe"
  Delete "$INSTDIR\\ocrat-ocr.exe"
  Delete "$INSTDIR\\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\\OCRat\\OCRat.lnk"
  RMDir "$SMPROGRAMS\\OCRat"
  DeleteRegKey HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${config.applicationId}"
SectionEnd
`);
run("makensis", [nsi]);
runNeu(["builder", "nsis", "--x64"]);
console.log(zip);
console.log(setup);
