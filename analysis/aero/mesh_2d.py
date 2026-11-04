"""2-D RANS meshes of the NACA 2415 section for SU2, generated with gmsh (PyPI `gmsh`, checked 2026-10-21).

Topology: airfoil (chord = 1, sharp closed trailing edge) inside a circular far field of radius R_FAR chords.
A quad boundary layer is extruded from the surface (gmsh BoundaryLayer field); the rest is triangles.
Three refinement levels for the mesh-independence study; level 1 = coarse, 2 = medium, 3 = fine (table LEVELS):
surface points per side x ~sqrt(2) per level (120 -> 170 -> 240), first-cell height halved per level
(1e-4 -> 5e-5 -> 2.5e-5 c), wake and far-field spacing reduced by ~1.3-1.4 per level.  The surface refinement ratio
r ~ 1.41 is the one su2_2d.gci() assumes; the wall-normal refinement is r = 2, so the levels are not a strictly
uniform refinement and the GCI is indicative only.

First-cell height: y+ ~ (h1/c) Re sqrt(Cf/2) with Cf ~ 0.0045 (flat-plate turbulent, Schlichting) and Re from
common.CONDITIONS["cruise"].  Estimate at the v0.4 cruise Re 3.89e5 (chord 0.284 m, 2026-10-25): L1 y+ ~ 1.85,
L2 ~ 0.92, L3 ~ 0.46, i.e. the coarse mesh is above y+ = 1 and L2/L3 below it, so the chord-normalised meshes were not
regenerated (recompute with the formula if the chord or cruise speed changes).

Usage: py mesh_2d.py [level ...]  -> mesh/naca2415_L<level>.su2  (meshes are git-ignored)
"""
from __future__ import annotations
import sys, time, math
import numpy as np
import gmsh
from common import *

MESH_DIR = HERE / "mesh"; MESH_DIR.mkdir(exist_ok=True)
R_FAR = 60.0   # far-field radius in chords (the SU2 tutorial RANS airfoil meshes use 100-500; 60 c with a
               # vortex-corrected far field is adequate for lift at low Mach, see SU2 config MARKER_FAR)

LEVELS = {  # surface points per side, first layer height, growth, BL thickness, far-field spacing
    1: dict(n_side=120, h1=1.0e-4, ratio=1.25, nlayers=22, wake=0.03, far=6.0),
    2: dict(n_side=170, h1=5.0e-5, ratio=1.20, nlayers=30, wake=0.02, far=4.5),
    3: dict(n_side=240, h1=2.5e-5, ratio=1.16, nlayers=40, wake=0.014, far=3.2),
}

def build(level: int, code="2415"):
    p = LEVELS[level]
    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 0)
    gmsh.model.add(f"naca{code}_L{level}")
    occ = gmsh.model.occ
    # airfoil points, cosine spaced, LE clustering; split at LE and TE so each side is one spline
    n = p["n_side"]
    pts = naca4(code, n)          # TE -> upper -> LE -> lower -> TE, 2n-1 points
    i_le = n - 1
    tags = []
    for k, (x, y) in enumerate(pts):
        if k == len(pts) - 1:
            tags.append(tags[0]); break   # closed TE: last point is the first point
        tags.append(occ.addPoint(x, y, 0))
    up = occ.addSpline(tags[: i_le + 1])
    lo = occ.addSpline(tags[i_le:])
    foil = occ.addCurveLoop([up, lo])
    circ = occ.addCircle(0.5, 0, 0, R_FAR)
    far = occ.addCurveLoop([circ])
    surf = occ.addPlaneSurface([far, foil])
    occ.synchronize()
    # physical groups (SU2 marker names)
    gmsh.model.addPhysicalGroup(1, [up, lo], name="airfoil")
    gmsh.model.addPhysicalGroup(1, [circ], name="farfield")
    gmsh.model.addPhysicalGroup(2, [surf], name="fluid")
    # sizing: surface spacing from the spline point density, wake refinement box, far field coarse
    gmsh.option.setNumber("Mesh.MeshSizeExtendFromBoundary", 0)
    gmsh.option.setNumber("Mesh.MeshSizeFromPoints", 0)
    gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", 0)
    f_dist = gmsh.model.mesh.field.add("Distance")
    gmsh.model.mesh.field.setNumbers(f_dist, "CurvesList", [up, lo])
    gmsh.model.mesh.field.setNumber(f_dist, "Sampling", 400)
    f_thr = gmsh.model.mesh.field.add("Threshold")
    gmsh.model.mesh.field.setNumber(f_thr, "InField", f_dist)
    gmsh.model.mesh.field.setNumber(f_thr, "SizeMin", p["wake"] * 0.6)
    gmsh.model.mesh.field.setNumber(f_thr, "SizeMax", p["far"])
    gmsh.model.mesh.field.setNumber(f_thr, "DistMin", 0.5)
    gmsh.model.mesh.field.setNumber(f_thr, "DistMax", 25.0)
    # wake box behind the TE (stall wake needs resolution to ~ 5 c downstream)
    f_box = gmsh.model.mesh.field.add("Box")
    gmsh.model.mesh.field.setNumber(f_box, "VIn", p["wake"])
    gmsh.model.mesh.field.setNumber(f_box, "VOut", p["far"])
    gmsh.model.mesh.field.setNumber(f_box, "XMin", -0.3); gmsh.model.mesh.field.setNumber(f_box, "XMax", 6.0)
    gmsh.model.mesh.field.setNumber(f_box, "YMin", -1.2); gmsh.model.mesh.field.setNumber(f_box, "YMax", 1.5)
    gmsh.model.mesh.field.setNumber(f_box, "Thickness", 3.0)
    f_min = gmsh.model.mesh.field.add("Min")
    gmsh.model.mesh.field.setNumbers(f_min, "FieldsList", [f_thr, f_box])
    gmsh.model.mesh.field.setAsBackgroundMesh(f_min)
    # boundary layer: quads extruded from the airfoil curves, fan at the sharp TE
    f_bl = gmsh.model.mesh.field.add("BoundaryLayer")
    gmsh.model.mesh.field.setNumbers(f_bl, "CurvesList", [up, lo])
    gmsh.model.mesh.field.setNumbers(f_bl, "FanPointsList", [tags[0]])
    gmsh.model.mesh.field.setNumber(f_bl, "Size", p["h1"])
    gmsh.model.mesh.field.setNumber(f_bl, "Ratio", p["ratio"])
    gmsh.model.mesh.field.setNumber(f_bl, "Quads", 1)
    thick = p["h1"] * (p["ratio"] ** p["nlayers"] - 1) / (p["ratio"] - 1)
    gmsh.model.mesh.field.setNumber(f_bl, "Thickness", thick)
    gmsh.model.mesh.field.setAsBoundaryLayer(f_bl)
    # curve discretisation: use the spline control points (cosine spaced) as the mesh nodes
    gmsh.model.mesh.setTransfiniteCurve(up, n)
    gmsh.model.mesh.setTransfiniteCurve(lo, n)
    gmsh.option.setNumber("Mesh.Algorithm", 6)   # Frontal-Delaunay
    gmsh.option.setNumber("Mesh.Smoothing", 5)
    t0 = time.time()
    gmsh.model.mesh.generate(2)
    etypes, etags, _ = gmsh.model.mesh.getElements(2)
    ncell = sum(len(t) for t in etags)
    nnode = len(gmsh.model.mesh.getNodes()[0])
    out = MESH_DIR / f"naca{code}_L{level}.su2"
    gmsh.option.setNumber("Mesh.SaveAll", 0)
    gmsh.write(str(out))
    gmsh.finalize()
    info = {"level": level, "cells": int(ncell), "nodes": int(nnode), "h1": p["h1"], "ratio": p["ratio"], "nlayers": p["nlayers"],
            "bl_thickness": thick, "n_side": n, "wake_h": p["wake"], "R_far": R_FAR, "wall_s": time.time() - t0, "file": out.name}
    print(f"  L{level}: {ncell} cells, {nnode} nodes, BL thickness {thick:.4f} c, {info['wall_s']:.1f} s -> {out.name}")
    return info

if __name__ == "__main__":
    levels = [int(a) for a in sys.argv[1:] if a.isdigit()] or [1, 2, 3]
    infos = {}
    for L in levels:
        infos[f"L{L}"] = build(L)
    prev = {}
    jf = OUT / "mesh_2d.json"
    if jf.exists():
        prev = json.loads(jf.read_text())
    prev.update(infos)
    dump_json(jf, prev)
