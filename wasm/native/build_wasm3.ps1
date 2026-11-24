$ErrorActionPreference = "Stop"

$gcc = "D:\SW\mingw64\bin\gcc.exe"
$root = Split-Path -Parent $PSScriptRoot
$srcDir = Join-Path $PSScriptRoot "wasm3_src\source"
$patchFile = Join-Path $PSScriptRoot "wasm3_instrumentation.patch"
$bridge = Join-Path $PSScriptRoot "m3_debug_bridge.c"
$outDll = Join-Path $root "wasm3.dll"

# Apply instrumentation patch to wasm3_src if not already applied
$compileC = Join-Path $srcDir "m3_compile.c"
if ((Test-Path $patchFile) -and -not (Select-String -Path $compileC -Pattern "W3DBG_ENABLE" -Quiet)) {
    Write-Host "Applying wasm3_instrumentation.patch..."
    git -C (Join-Path $PSScriptRoot "wasm3_src") apply $patchFile
    if ($LASTEXITCODE -ne 0) { throw "Failed to apply wasm3_instrumentation.patch" }
}

$cFiles = Get-ChildItem -Path $srcDir -Filter "*.c" |
    Where-Object { $_.Name -notin @("m3_api_uvwasi.c", "m3_api_wasi.c", "m3_api_meta_wasi.c", "m3_api_tracer.c") } |
    ForEach-Object { $_.FullName }

$allSources = @($cFiles) + @($bridge)

$flags = @(
    "-shared",
    "-O2",
    "-DDEBUG",
    "-DW3DBG_ENABLE",
    "-Dd_m3MaxNativeStack=0",
    "-Dd_m3GuardedMemory=0",
    "-Dd_m3VerboseErrorMessages=1",
    "-Dd_m3HasUVWASI=0",
    "-I$PSScriptRoot",
    "-I$srcDir",
    "-o", $outDll
)

Write-Host "Building $outDll with $gcc ..."
& $gcc @flags @allSources
if ($LASTEXITCODE -ne 0) {
    throw "gcc failed with exit code $LASTEXITCODE"
}
Get-Item $outDll | Select-Object Name, Length, LastWriteTime
