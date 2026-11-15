$ErrorActionPreference = "Stop"
cmake -S adapters/windows -B adapters/windows/build -A x64
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
cmake --build adapters/windows/build --config Release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
New-Item -ItemType Directory -Force -Path bin | Out-Null
Copy-Item -Force adapters/windows/build/Release/ocrat-ocr.exe bin/ocrat-ocr.exe
