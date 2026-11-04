"""Reproduce the whole aerodynamic data package.  Usage:  py run_all.py [--quick] [--skip-cfd]

Order: XFOIL polars -> NeuralFoil -> AVL -> AeroSandbox -> (gmsh meshes -> SU2 2-D RANS) -> drag build-up -> plots -> aero_results.json
Tools (outside the repo, see common.py): XFOIL 6.99, AVL 3.52, SU2 8.5.0 win64-omp; PyPI: numpy, scipy, matplotlib, gmsh, aerosandbox, neuralfoil.
Wall-clock (this machine, 20 logical CPUs, 2026-10-21): XFOIL ~10 min, AVL ~1.5 min, AeroSandbox ~2 min, meshes ~1 min,
SU2 matrix 31 cases ~4-5 h (5 concurrent x 4 threads), rest < 1 min.  --quick runs a 10-case SU2 subset.
"""
import subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
steps = [("xfoil_polars.py", []), ("neuralfoil_polars.py", []), ("avl_run.py", []), ("asb_model.py", [])]
if "--skip-cfd" not in sys.argv:
    steps += [("mesh_2d.py", ["1", "2", "3"]), ("su2_2d.py", ["--quick"] if "--quick" in sys.argv else [])]
steps += [("drag_buildup.py", []), ("plots.py", []), ("assemble_results.py", [])]
T0 = time.time(); times = {}
for script, args in steps:
    t = time.time(); print(f"== {script} {' '.join(args)}")
    rc = subprocess.run([sys.executable, str(HERE / script), *args], cwd=str(HERE)).returncode
    times[script] = time.time() - t
    print(f"   -> rc {rc}, {times[script]:.0f} s")
    if rc != 0:
        sys.exit(f"{script} failed")
print("\nwall-clock per step [s]:", {k: round(v) for k, v in times.items()}, f"total {time.time()-T0:.0f} s")
