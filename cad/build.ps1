# Regenerates the SOLIDWORKS model, meshes, drawings and renders: params from analysis/results.json + cad/hardware.json,
# compile and run BuildVtol.cs, ExportMesh.cs, Drawings.cs, Snap.cs.
# Usage (from the project folder):  powershell -ExecutionPolicy Bypass -File cad\build.ps1
# Run first:  node analysis/sizing.mjs; node analysis/vlm.mjs; node analysis/export_bom.mjs; py analysis/verify.py
# Afterwards: node review/build.mjs   (packs cad/mesh into the review page)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sw   = 'C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\api\redist'
$csc  = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
Copy-Item "$sw\SolidWorks.Interop.sldworks.dll","$sw\SolidWorks.Interop.swconst.dll" (Join-Path $root 'cad') -Force
# cad\Shared.cs (the one params.txt reader + NACA section / pod profile) is compiled into every executable that reads params.txt
# (BuildVtol, Drawings here; Sim.cs and Thermal.cs likewise when built by hand, see README)
$shared = Join-Path $root 'cad\Shared.cs'
function Build($src, $exe, $withShared = $false) {
  $srcs = if ($withShared) { @($src, $shared) } else { @($src) }
  & $csc /nologo /platform:x64 /out:$exe /r:"$sw\SolidWorks.Interop.sldworks.dll" /r:"$sw\SolidWorks.Interop.swconst.dll" $srcs
  if ($LASTEXITCODE -ne 0) { throw "compile failed: $src" }
}
node (Join-Path $root 'cad\params.mjs')
# parity test of Shared.cs against the inline code it replaced (no SOLIDWORKS; bit-exact sections, pod profile, parsed params)
$st = Join-Path $env:TEMP 'SharedTest.exe'
& $csc /nologo /out:$st $shared (Join-Path $root 'cad\SharedTest.cs'); if ($LASTEXITCODE -ne 0) { throw 'compile failed: SharedTest.cs' }
& $st (Join-Path $root 'cad\params.txt'); if ($LASTEXITCODE -ne 0) { throw 'cad\Shared.cs parity test failed' }
Build (Join-Path $root 'cad\ListDocs.cs') (Join-Path $root 'cad\ListDocs.exe')
& (Join-Path $root 'cad\ListDocs.exe') close untitled    # close project documents left open in SOLIDWORKS
# model: parts, VTOL_Concept.SLDASM/.STEP/.EASM, VTOL_Exploded.SLDASM, cad/verification.txt (interference, masses)
$exe = Join-Path $root 'cad\BuildVtol.exe'
Build (Join-Path $root 'cad\BuildVtol.cs') $exe $true
& $exe (Join-Path $root 'cad\params.txt') (Join-Path $root 'cad\model')
# part meshes for the interactive viewer in the review page (cad/mesh/*.STL + meta.json); then rebuild with: node review/build.mjs
$mx = Join-Path $root 'cad\ExportMesh.exe'
Build (Join-Path $root 'cad\ExportMesh.cs') $mx
& $mx (Join-Path $root 'cad\model') (Join-Path $root 'cad\mesh')
# drawing set DBF-DRW-001 rev E (cad/drawings): SLDDRW, vector PDF, sheet PNGs for the review page
$dx = Join-Path $root 'cad\Drawings.exe'
Build (Join-Path $root 'cad\Drawings.cs') $dx $true
& $dx (Join-Path $root 'cad\model') (Join-Path $root 'cad\drawings') (Join-Path $root 'cad\params.txt')
# renders of the assembly (cad/images)
$sn = Join-Path $root 'cad\Snap.exe'
Build (Join-Path $root 'cad\Snap.cs') $sn
& $sn (Join-Path $root 'cad\model\VTOL_Concept.SLDASM') (Join-Path $root 'cad\images')
# build-manual step figures (docs/build/img/*.jpg from the list in docs/build/figs.txt)
$bf = Join-Path $root 'cad\BuildFigs.exe'
& $csc /nologo /platform:x64 /out:$bf /r:System.Drawing.dll /r:"$sw\SolidWorks.Interop.sldworks.dll" /r:"$sw\SolidWorks.Interop.swconst.dll" (Join-Path $root 'cad\BuildFigs.cs')
if ($LASTEXITCODE -ne 0) { throw 'compile failed: BuildFigs.cs' }
& $bf (Join-Path $root 'cad\model') (Join-Path $root 'docs\build\figs.txt') (Join-Path $root 'docs\build\img')
& (Join-Path $root 'cad\ListDocs.exe') close
