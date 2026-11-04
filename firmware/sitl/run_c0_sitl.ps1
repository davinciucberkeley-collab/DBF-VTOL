# run_c0_sitl.ps1 - start the C0 physics model and ArduPlane SITL (JSON external physics) for hand-flying
# from Mission Planner / MAVProxy / QGroundControl on TCP 127.0.0.1:5760.
#
#   .\run_c0_sitl.ps1 -SitlExe C:\sitl\ArduPlane.exe [-Speedup 1] [-Wind "3,270"] [-Python py]
#
# ArduPlane.exe = ArduPlane.elf + cyg*.dll from https://firmware.ardupilot.org/Tools/MissionPlanner/sitl/PlaneStable/
# (the Windows build Mission Planner uses; firmware/sitl/README.md). Parameter chain: sitl_c0_defaults.parm ->
# ../vtol_c0.param -> sitl_c0_overrides.param. Ctrl-C stops both processes.
param(
    [Parameter(Mandatory = $true)][string]$SitlExe,
    [int]$Speedup = 1,
    [string]$Wind = "0,0",
    [string]$Python = "py",
    [string]$Out = "$PSScriptRoot\c0_handfly"
)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
New-Item -ItemType Directory -Force $Out | Out-Null
$params = @("$here\..\vtol_c0.param", "$here\sitl_c0_overrides.param")
$defaults = (@("$here\sitl_c0_defaults.parm") + $params | ForEach-Object { (Resolve-Path $_).Path }) -join ","

Write-Host "C0 physics: $Python $here\c0_physics.py --params ... --wind $Wind"
$phys = Start-Process -FilePath $Python -ArgumentList (@("`"$here\c0_physics.py`"", "--params") + ($params | ForEach-Object { "`"$_`"" }) + @("--wind", $Wind, "--log", "`"$Out\physics_log.csv`"", "-v")) -NoNewWindow -PassThru
Start-Sleep -Seconds 2
Write-Host "SITL: $SitlExe --model JSON:127.0.0.1 --speedup $Speedup -w --home 37.9156,-122.3366,5.0,0.0"
$sitl = Start-Process -FilePath $SitlExe -ArgumentList @("--model", "JSON:127.0.0.1", "--speedup", "$Speedup", "-w", "--home", "37.9156,-122.3366,5.0,0.0", "--defaults", "`"$defaults`"") -WorkingDirectory $Out -NoNewWindow -PassThru
Write-Host "Connect a GCS to tcp:127.0.0.1:5760 (Mission Planner: Connect > TCP). Ctrl-C to stop."
try {
    Wait-Process -Id $sitl.Id
} finally {
    foreach ($p in @($sitl, $phys)) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force } }
}
