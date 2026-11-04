#!/usr/bin/env python3
"""
make_templates.py - 1:1 hot-wire aerofoil templates (SVG) for the C0 lift + cruise VTOL.

Reads the chords and sizes from cad/params.txt (chord, hC, vC, vH, sparX, sparY, sparXfrac, panelLen, fusR,
joinBoreD, finRootBlock, rudderY0, hSpan, elevSpan) and writes one
SVG per template into this folder, plus a CSV of the section coordinates. Every SVG is drawn in
millimetres with width/height in mm, so a browser or Inkscape prints it at true scale when the
print dialog is set to 100 % / "actual size". A 100 mm check line and a 10 mm scale bar are on
every sheet: measure them before cutting anything.

Sections (NACA 4-digit, closed trailing edge, cosine spacing, 120 points per surface; section family, camber and TE
coefficient from cad/params.txt foilWing/foilTail/foilTE, implemented once in analysis/geom.py):
  wing_root   NACA 2415, chord = params chord (CAD rev D / DBF-DRW-001 rev E), spar socket mark at 30 % chord on
              the camber line, dia 26.0 (FT05 channel), aileron hinge line at 74 % chord and the
              fixed-panel cut line at 72 % chord (cad/BuildVtol.cs Aileron(): 74-100 % with a 2 %
              hinge gap).
  wing_tip    Same section (the wing has no taper: cad/params.mjs panelLen is a straight extrusion).
              Written as a separate file so the two templates can be labelled and pinned separately.
  wing_saddle Same section again, for the centre-section saddle block (CAD Wing_Saddle, 2 x fusR wide), with the
              joiner bore (params joinBoreD = hardware.json FT06 hole).
  tail        NACA 0009, chord = params hC, elevator hinge at 70 % chord and the
              stabiliser cut line at 68 % (BuildVtol.cs Tailplane()).
  fin_root    NACA 0009, chord = params vC, rudder hinge at 70 % chord (rudder = 30 % of
              the local chord, 2 % gap, hardware-spec CAD implementation notes rev B / BuildVtol.cs Rudder).
  fin_tip     NACA 0009, chord = 0.65 x vC (BuildVtol.cs Fin(): 65 % tip chord).

Sheet size: a sheet wider than 270 mm (the wing sheets, chord + 37 mm = 321 mm at chord 284.2) does not fit US Letter or A4, so for
those the script also writes <name>_A.svg (leading-edge half) and <name>_B.svg (trailing-edge half),
each under 200 mm wide, overlapping by 40 mm with two registration crosses in the overlap: print both
at 100 %, cut sheet B along its left edge, align the crosses and tape. The full sheet prints in one
piece on Tabloid/A3 or Legal landscape.

Formulas (NACA 4-digit, e.g. https://en.wikipedia.org/wiki/NACA_airfoil, checked 2026-10-21; analysis/geom.py naca4_surfaces):
  yt = 5 t (0.2969 sqrt(x) - 0.1260 x - 0.3516 x^2 + 0.2843 x^3 + a4 x^4)   a4 = foilTE aero = -0.1036 (closed TE)
  yc = m/p^2 (2 p x - x^2)            for x < p
     = m/(1-p)^2 ((1-2p) + 2 p x - x^2) for x >= p
  xu = x - yt sin(theta), yu = yc + yt cos(theta); xl = x + yt sin(theta), yl = yc - yt cos(theta)
  theta = atan(dyc/dx). For the 0009 sections m = 0 so yc = 0.
  The CAD (cad/params.mjs, BuildVtol.cs, Drawings.cs) uses the open-TE coefficient foilTE cad = -0.1015; the closed-TE
  value is used here so the wire has a clean exit point. The difference is < 0.05 mm forward of 70 % chord (calc);
  both values are defined once in analysis/geometry.mjs (see cad/README.md "Single sources").

Options:
  --kerf MM   offset the outline outward by MM (default 0). A hot wire removes roughly 0.5-1.0 mm
              of foam each side of the wire (EST, depends on wire heat and feed); measure a test
              cut (WP4 step 4.3) and re-run with the measured value.
  --out DIR   output folder (default: this file's folder)

Usage:  py docs/build/templates/make_templates.py [--kerf 0.6]
"""
from __future__ import annotations

import argparse
import csv
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PARAMS = os.path.join(REPO, "cad", "params.txt")
sys.path.insert(0, os.path.join(REPO, "analysis"))
import geom   # the one params.txt reader and NACA implementation (analysis/geom.py)

N_POINTS = 120  # per surface


def naca4(m: float, p: float, t: float, c: float, n: int = N_POINTS):
    """Return upper and lower surface point lists in mm, LE at (0,0), TE at (c,0), y up; n+1 points per surface,
    closed TE (geom.TE_AERO)."""
    xu, yu, xl, yl = geom.naca4_surfaces(m, p, t, n + 1, geom.TE_AERO)
    up = [(float(x), float(y)) for x, y in zip(xu * c, yu * c)]
    lo = [(float(x), float(y)) for x, y in zip(xl * c, yl * c)]
    return up, lo



def offset_outline(pts, d: float):
    """Offset a closed polyline outward by d (mm) using averaged vertex normals. Fine for d <= 1 mm."""
    if d == 0:
        return pts
    n = len(pts)
    out = []
    # signed area to know the winding; we want outward = away from the interior
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n)) / 2
    sign = 1.0 if area > 0 else -1.0
    for i in range(n):
        x0, y0 = pts[i - 1]
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        # edge normals (left-hand normal of each edge, flipped by winding)
        nx1, ny1 = -(y1 - y0) * sign, (x1 - x0) * sign
        nx2, ny2 = -(y2 - y1) * sign, (x2 - x1) * sign
        for k in (1, 2):
            pass
        l1 = math.hypot(nx1, ny1) or 1.0
        l2 = math.hypot(nx2, ny2) or 1.0
        nx, ny = nx1 / l1 + nx2 / l2, ny1 / l1 + ny2 / l2
        l = math.hypot(nx, ny) or 1.0
        out.append((x1 + d * nx / l, y1 + d * ny / l))
    return out


def svg_template(name: str, title: str, up, lo, c: float, marks: list, kerf: float, notes: list) -> str:
    """Build one SVG sheet. Coordinates: x right, y DOWN in SVG, so y is negated."""
    outline = list(up[::-1]) + list(lo[1:])  # TE(upper) -> LE -> TE(lower)
    outline = offset_outline(outline, kerf)
    ys = [y for _, y in outline]
    ymax, ymin = max(ys), min(ys)
    margin = 8.0
    lead = 15.0  # wire lead-in / lead-out tangent at the TE
    W = c + lead + 2 * margin + 6  # wing root: c + 37 mm (> 270) -> also written as two half sheets (split_sheets)
    H = (ymax - ymin) + 2 * margin + 45 + 4.0 * max(0, sum(1 for m in marks if m[0] == 'line') - 2)
    ox, oy = margin, margin + ymax + 20  # origin (LE) in sheet coordinates; y flipped
    X = lambda x: ox + x
    Y = lambda y: oy - y

    def path(pts):
        return "M " + " L ".join(f"{X(x):.3f},{Y(y):.3f}" for x, y in pts) + " Z"

    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.1f}mm" height="{H:.1f}mm" viewBox="0 0 {W:.1f} {H:.1f}" font-family="Arial, Helvetica, sans-serif">']
    s.append(f'<title>{title}</title>')
    s.append('<style>text{font-size:3.2px;fill:#111}.lbl{font-size:4.5px;font-weight:bold}.thin{stroke:#111;stroke-width:0.15;fill:none}.cut{stroke:#000;stroke-width:0.25;fill:none}.mark{stroke:#c00;stroke-width:0.2;fill:none}.dash{stroke:#06c;stroke-width:0.2;fill:none;stroke-dasharray:2,1}</style>')
    s.append(f'<rect x="0.3" y="0.3" width="{W-0.6:.1f}" height="{H-0.6:.1f}" class="thin"/>')
    # outline (cut line)
    s.append(f'<path d="{path(outline)}" class="cut"/>')
    # chord line and TE lead-in/out
    s.append(f'<line x1="{X(-5):.3f}" y1="{Y(0):.3f}" x2="{X(c+lead):.3f}" y2="{Y(0):.3f}" class="dash"/>')
    s.append(f'<text x="{X(c+lead+1):.2f}" y="{Y(0)+1:.2f}">wire lead-out</text>')
    # registration crosshairs at LE and TE on the chord line, and at mid-chord above/below
    for (x, y) in [(0.0, 0.0), (c, 0.0), (c / 2, ymax + 8), (c / 2, ymin - 8)]:
        s.append(f'<path d="M {X(x-4):.2f},{Y(y):.2f} L {X(x+4):.2f},{Y(y):.2f} M {X(x):.2f},{Y(y-4):.2f} L {X(x):.2f},{Y(y+4):.2f}" class="mark"/>')
        s.append(f'<circle cx="{X(x):.2f}" cy="{Y(y):.2f}" r="2.5" class="mark"/>')
    # feature marks (vertical lines at chord fractions, circles for sockets)
    nline = 0
    for mk in marks:
        kind = mk[0]
        if kind == "line":
            _, xf, label = mk
            yl = ymin - 7 - 4.0 * nline  # stagger the labels so close marks stay readable
            nline += 1
            s.append(f'<line x1="{X(xf*c):.3f}" y1="{Y(ymax+6):.3f}" x2="{X(xf*c):.3f}" y2="{Y(yl+1):.3f}" class="mark"/>')
            s.append(f'<text x="{X(xf*c)+0.8:.2f}" y="{Y(yl):.2f}">{label}</text>')
        elif kind == "circle":
            _, x, y, d, label = mk
            s.append(f'<circle cx="{X(x):.3f}" cy="{Y(y):.3f}" r="{d/2:.3f}" class="mark"/>')
            s.append(f'<path d="M {X(x-d/2-3):.2f},{Y(y):.2f} L {X(x+d/2+3):.2f},{Y(y):.2f} M {X(x):.2f},{Y(y-d/2-3):.2f} L {X(x):.2f},{Y(y+d/2+3):.2f}" class="mark"/>')
            s.append(f'<text x="{X(x)+d/2+3.5:.2f}" y="{Y(y)-1:.2f}">{label}</text>')
    # scale bar 10 mm and 100 mm check line
    yb = H - 14
    s.append(f'<path d="M {margin:.1f},{yb:.1f} L {margin+10:.1f},{yb:.1f} M {margin:.1f},{yb-2:.1f} L {margin:.1f},{yb+2:.1f} M {margin+10:.1f},{yb-2:.1f} L {margin+10:.1f},{yb+2:.1f}" class="cut"/>')
    s.append(f'<text x="{margin:.1f}" y="{yb+5:.1f}">10 mm scale bar</text>')
    s.append(f'<path d="M {margin+30:.1f},{yb:.1f} L {margin+130:.1f},{yb:.1f} M {margin+30:.1f},{yb-2:.1f} L {margin+30:.1f},{yb+2:.1f} M {margin+130:.1f},{yb-2:.1f} L {margin+130:.1f},{yb+2:.1f}" class="cut"/>')
    s.append(f'<text x="{margin+30:.1f}" y="{yb+5:.1f}">100 mm check line: measure before cutting (print at 100 %, no "fit to page")</text>')
    # labels
    s.append(f'<text x="{margin:.1f}" y="8" class="lbl">{title}</text>')
    for i, n in enumerate(notes):
        s.append(f'<text x="{margin:.1f}" y="{13+4*i:.1f}">{n}</text>')
    s.append("</svg>")
    return "\n".join(s)


def split_sheets(svg: str, name: str, out: str, limit: float = 270.0, overlap: float = 40.0):
    """Write two half-width sheets (viewBox crops) when the full sheet is wider than `limit` mm."""
    m = re.search(r'width="([0-9.]+)mm" height="([0-9.]+)mm" viewBox="0 0 ([0-9.]+) ([0-9.]+)"', svg)
    if not m:
        return []
    W, H = float(m.group(1)), float(m.group(2))
    if W <= limit:
        return []
    xa = W / 2 + overlap / 2          # right edge of sheet A
    xb = W / 2 - overlap / 2          # left edge of sheet B
    # registration crosses in the overlap, drawn on both sheets at the same sheet coordinates
    cx = W / 2
    reg = "".join(f'<path d="M {cx-4:.2f},{y:.2f} L {cx+4:.2f},{y:.2f} M {cx:.2f},{y-4:.2f} L {cx:.2f},{y+4:.2f}" class="mark"/>'
                  f'<circle cx="{cx:.2f}" cy="{y:.2f}" r="3" class="mark"/>' for y in (12.0, H - 20.0))
    body = svg[svg.index(">", svg.index("<svg")) + 1:svg.rindex("</svg>")]
    body = body.replace("</style>", "</style>" + reg, 1)
    paths = []
    for tag, x0, w in (("_A", 0.0, xa), ("_B", xb, W - xb)):
        head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.1f}mm" height="{H:.1f}mm" '
                f'viewBox="{x0:.1f} 0 {w:.1f} {H:.1f}" font-family="Arial, Helvetica, sans-serif">')
        note = (f'<text x="{x0+3:.1f}" y="{H-4:.1f}">SHEET {tag[1]} of 2: overlap {overlap:.0f} mm, align the two red crosses at x = {cx:.1f} mm '
                f'with the other sheet; print at 100 %</text>')
        p = os.path.join(out, name + tag + ".svg")
        with open(p, "w", encoding="utf-8") as f:
            f.write(head + body + note + "</svg>")
        paths.append(p)
    return paths


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kerf", type=float, default=0.0, help="outward offset in mm (default 0)")
    ap.add_argument("--out", default=HERE, help="output folder")
    a = ap.parse_args(argv)
    P = geom.read_params(PARAMS)
    c = P["chord"] * 1000.0
    hC = P["hC"] * 1000.0
    vC = P["vC"] * 1000.0
    tc = P["tc"]
    sparX = -P["sparX"] * 1000.0  # params sparX is negative (model X = -x c)
    sparY = P["sparY"] * 1000.0
    sparXfrac = P["sparXfrac"]
    chan = 26.0  # FT05 channel diameter, cad/hardware.json fits FT05
    jbore = P["joinBoreD"] * 1000.0  # FT06 joiner bore in the saddle (params joinBoreD from hardware.json)
    panel = P["panelLen"] * 1000.0
    saddleW = 2 * P["fusR"] * 1000.0
    kerf = a.kerf
    os.makedirs(a.out, exist_ok=True)

    wing_up, wing_lo = naca4(geom.WING_M, geom.WING_P, tc, c)            # params foilWing (NACA 2415 at tc)
    tail_up, tail_lo = naca4(geom.TAIL_M, geom.TAIL_P, geom.TAIL_T, hC)   # params foilTail (NACA 0009)
    finr_up, finr_lo = naca4(geom.TAIL_M, geom.TAIL_P, geom.TAIL_T, vC)
    fint_up, fint_lo = naca4(geom.TAIL_M, geom.TAIL_P, geom.TAIL_T, 0.65 * vC)

    common = [f"Source: cad/params.txt (chord {c:.3f} mm, hC {hC:.3f}, vC {vC:.3f}, t/c {tc}); generated by make_templates.py, kerf offset {kerf:.2f} mm.",
              "Cut line = black outline. Red = marks (do not cut). Blue dashed = chord line / wire lead-out.",
              "Glue to 3 mm ply or 1.5 mm aluminium, cut to the line, sand the edge smooth, wax it. Pin at the registration circles."]
    wing_marks = [("circle", sparX, sparY, chan, f"spar channel dia {chan:.1f} at {sparXfrac*100:.0f} % c, y +{sparY:.2f}"),
                  ("line", 0.70, "70 % wing bolt / tongue"), ("line", 0.72, "72 % cut (fixed panel)"),
                  ("line", 0.74, "74 % aileron hinge"), ("line", 0.80, "80 % rear clamp / hardpoint")]
    sheets = [
        ("wing_root_naca2415", "WING ROOT - NACA 2415 - chord %.2f mm" % c, wing_up, wing_lo, c, wing_marks,
         common + ["Root end of each %.0f mm panel. The panel has no taper; the TIP sheet is the same section." % panel]),
        ("wing_tip_naca2415", "WING TIP - NACA 2415 - chord %.2f mm" % c, wing_up, wing_lo, c, wing_marks,
         common + ["Tip end of each %.0f mm panel (identical to ROOT; separate sheet so both ends are pinned)." % panel]),
        ("wing_saddle_naca2415", "WING SADDLE (centre section) - NACA 2415 - chord %.2f mm" % c, wing_up, wing_lo, c,
         [("circle", sparX, sparY, jbore, "joiner bore dia %.3f (FT06, drill after cutting)" % jbore), ("line", 0.70, "70 % bolt pillar")],
         common + ["Both faces of the %.0f mm wide saddle block (cad/params.txt comp Wing_Saddle, 2 x fusR); joiner bore is a SLIP FIT (FT06 rev B, not bonded)." % saddleW]),
        ("tail_naca0009", "STABILISER - NACA 0009 - chord %.2f mm" % hC, tail_up, tail_lo, hC,
         [("line", 0.68, "68 % stab cut"), ("line", 0.70, "70 % elevator hinge")],
         common + ["Both ends of the %.1f mm stabiliser (params hSpan). Elevator = 70-100 %% chord, span %.1f mm (params elevSpan)." % (P["hSpan"] * 1000, P["elevSpan"] * 1000)]),
        ("fin_root_naca0009", "FIN ROOT - NACA 0009 - chord %.2f mm" % vC, finr_up, finr_lo, vC,
         [("line", 0.68, "68 % fin cut"), ("line", 0.70, "70 % rudder hinge"), ("line", 0.225, "22.5 % tail clamp centre")],
         common + ["Fin root; fin height %.1f mm (params vH); root %.0f mm sits in the printed shoe; rudder from %.0f mm above the root (CAD rev D)." % (P["vH"] * 1000, P["finRootBlock"] * 1000, P["rudderY0"] * 1000)]),
        ("fin_tip_naca0009", "FIN TIP - NACA 0009 - chord %.2f mm" % (0.65 * vC), fint_up, fint_lo, 0.65 * vC,
         [("line", 0.68, "68 % fin cut"), ("line", 0.70, "70 % rudder hinge")],
         common + ["Fin tip = 65 %% of root chord (cad/BuildVtol.cs Fin()). Pin tip LE 0.35 x %.1f = %.1f mm aft of the root LE (swept LE, TE straight) EST." % (vC, 0.35 * vC)]),
    ]
    written = []
    for name, title, up, lo, cc, marks, notes in sheets:
        p = os.path.join(a.out, name + ".svg")
        svg = svg_template(name, title, up, lo, cc, marks, kerf, notes)
        with open(p, "w", encoding="utf-8") as f:
            f.write(svg)
        written.append(p)
        for q in split_sheets(svg, name, a.out):
            written.append(q)
    # coordinates CSV
    p = os.path.join(a.out, "section_coordinates.csv")
    with open(p, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["section", "chord_mm", "surface", "x_mm", "y_mm"])
        for sec, cc, up, lo in [("NACA2415_wing", c, wing_up, wing_lo), ("NACA0009_tail", hC, tail_up, tail_lo),
                                ("NACA0009_fin_root", vC, finr_up, finr_lo), ("NACA0009_fin_tip", 0.65 * vC, fint_up, fint_lo)]:
            for x, y in up:
                w.writerow([sec, f"{cc:.3f}", "upper", f"{x:.3f}", f"{y:.3f}"])
            for x, y in lo:
                w.writerow([sec, f"{cc:.3f}", "lower", f"{x:.3f}", f"{y:.3f}"])
    written.append(p)
    for p in written:
        print("wrote", os.path.relpath(p, REPO))
    print(f"chord {c:.3f}  hC {hC:.3f}  vC {vC:.3f}  fin tip {0.65*vC:.3f}  spar ({sparX:.3f}, {sparY:.3f})  kerf {kerf}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
