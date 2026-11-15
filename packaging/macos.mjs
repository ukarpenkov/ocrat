import fs from "node:fs";
import path from "node:path";
import { ensureDir, firstExisting, readConfig, root, run, runNeu } from "./common.mjs";
import { buildIcons } from "./icons.mjs";

const config = readConfig();
const version = config.version;
const binaryName = config.cli.binaryName;
const binary = path.join(root, "dist", binaryName, `${binaryName}-mac_arm64`);
if (!fs.existsSync(binary)) {
  throw new Error(`Missing ${binary}. Run neu build --embed-resources on macOS arm64 first.`);
}
const adapter = firstExisting([
  path.join(root, "bin", "ocrat-ocr"),
  path.join(root, "adapters", "macos", ".build", "release", "ocrat-ocr")
]);
if (!adapter) throw new Error("Missing the macOS OCR adapter. Run npm run adapter:mac first.");

const stage = path.join(root, "dist", "staging", "macos");
fs.rmSync(stage, { recursive: true, force: true });
const app = path.join(stage, "ocrat.app");
const contents = path.join(app, "Contents");
const macos = path.join(contents, "MacOS");
const resources = path.join(contents, "Resources");
ensureDir(macos);
ensureDir(resources);
fs.copyFileSync(binary, path.join(macos, "ocrat"));
fs.chmodSync(path.join(macos, "ocrat"), 0o755);
fs.copyFileSync(adapter, path.join(macos, "ocrat-ocr"));
fs.chmodSync(path.join(macos, "ocrat-ocr"), 0o755);
fs.writeFileSync(path.join(contents, "PkgInfo"), "APPL????");
fs.writeFileSync(path.join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>OCRat</string>
  <key>CFBundleDisplayName</key><string>OCRat</string>
  <key>CFBundleIdentifier</key><string>${config.applicationId}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>ocrat</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.utilities</string>
</dict>
</plist>
`);

const icns = buildIcons();
fs.copyFileSync(icns, path.join(resources, "icon.icns"));
run("xattr", ["-cr", app]);
run("codesign", ["--force", "--sign", "-", path.join(macos, "ocrat-ocr")]);
run("codesign", ["--force", "--sign", "-", path.join(macos, "ocrat")]);
run("codesign", ["--force", "--sign", "-", app]);

const dmgRoot = path.join(stage, "dmg");
ensureDir(dmgRoot);
fs.cpSync(app, path.join(dmgRoot, "ocrat.app"), { recursive: true });
run("xattr", ["-cr", dmgRoot]);
fs.symlinkSync("/Applications", path.join(dmgRoot, "Applications"));
const release = path.join(root, "dist", "release");
ensureDir(release);
const dmg = path.join(release, `ocrat-${version}-mac-arm64.dmg`);
const zip = path.join(release, `ocrat-${version}-mac-arm64.app.zip`);
run("hdiutil", ["create", "-volname", "OCRat", "-srcfolder", dmgRoot, "-ov", "-format", "UDZO", dmg]);
run("ditto", ["--norsrc", "--noextattr", "--noqtn", "--noacl", "-c", "-k", "--keepParent", app, zip], { COPYFILE_DISABLE: "1" });

runNeu(["builder", "dmg", "--arm64"]);
console.log(dmg);
console.log(zip);
