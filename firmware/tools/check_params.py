#!/usr/bin/env python3
"""
check_params.py - validate ArduPlane .param files against ArduPilot parameter metadata.

Checks, per file:
  1. Syntax: "NAME,VALUE", "NAME VALUE" or "NAME=VALUE", optional trailing "# comment";
     names are 1-16 chars of A-Z 0-9 _ (ArduPilot's 16-char limit); values are numbers;
     no duplicate names inside one file.
  2. Every name exists in the ArduPlane metadata (apm.pdef.xml).
  3. Value lies inside the metadata Range; enum-only parameters use a listed code;
     bitmask parameters are integers using only defined bits; increments are reported as warnings.
     Documented special values outside Range (e.g. Q_ASSIST_SPEED = -1) are accepted only if the
     metadata description itself mentions that value.
  4. --corewing: CoreWing F405 Wing V2 output-group check. If any output in a timer group runs
     DShot, no servo may share that group; S11-S12 cannot run DShot.
     Groups from hwdef CoreWingF405WingV2: S1-2 | S3-4 | S5-7 | S8-10 | S11-12.
  5. --require-every-line-commented: each parameter line must carry a "# comment".

Metadata: by default the current ArduPlane list is downloaded from
  https://autotest.ardupilot.org/Parameters/ArduPlane/apm.pdef.xml
and cached next to this script (tools/cache/). Pass --pdef PATH_OR_URL (repeatable) to check
against several versions, e.g. the versioned stable list
  https://autotest.ardupilot.org/Parameters/versioned/Plane/stable-4.7.1/apm.pdef.xml
A name must exist in EVERY metadata file given.

Usage:
  py firmware/tools/check_params.py firmware/vtol_c0.param --corewing --require-every-line-commented
Exit code 0 = no errors (warnings allowed), 1 = errors, 2 = usage / metadata problem.
Standard library only.
"""
from __future__ import annotations

import argparse
import hashlib
import math
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET

DEFAULT_PDEF = "https://autotest.ardupilot.org/Parameters/ArduPlane/apm.pdef.xml"
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
NAME_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,15}$")
LINE_RE = re.compile(r"^\s*([A-Za-z0-9_]+)\s*[,=\s]\s*([^\s,#]+)\s*(?:#(.*))?$")

# CoreWing F405 Wing V2 timer groups (hwdef.dat PWM lines, README "PWM Output").
COREWING_GROUPS = [(1, 2), (3, 4), (5, 6, 7), (8, 9, 10), (11, 12)]
COREWING_NO_DSHOT = {11, 12}
MOTOR_FUNCS = set(range(33, 41)) | {82, 83, 84, 85} | set(range(160, 180))
SERVO_FUNCS = {2, 3, 4, 16, 17, 19, 21, 24, 25, 26, 77, 78, 79, 80, 86, 87}  # surfaces: flap, aileron, elevator, rudder, elevons, vtail, spoilers


# ----------------------------------------------------------------------------- metadata
def fetch(src: str) -> str:
    """Return a local path for a metadata source (download + cache URLs)."""
    if not re.match(r"^https?://", src):
        if not os.path.isfile(src):
            raise FileNotFoundError(src)
        return src
    os.makedirs(CACHE_DIR, exist_ok=True)
    key = hashlib.sha1(src.encode()).hexdigest()[:10]
    path = os.path.join(CACHE_DIR, f"apm.pdef.{key}.xml")
    if not os.path.isfile(path) or os.path.getsize(path) < 100_000:
        req = urllib.request.Request(src, headers={"User-Agent": "check_params.py"})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
        with open(path + ".src", "w", encoding="utf-8") as f:
            f.write(src + "\n")
    return path


def load_pdef(path: str) -> dict:
    meta = {}
    for p in ET.parse(path).iter("param"):
        name = p.get("name", "").split(":")[-1]
        fields = {f.get("name"): (f.text or "").strip() for f in p.findall("field")}
        values = {}
        for v in p.findall("values/value"):
            try:
                values[float(v.get("code"))] = v.text or ""
            except (TypeError, ValueError):
                pass
        bits = {}
        bm = p.find("bitmask")
        if bm is not None:
            for b in bm.findall("bit"):
                bits[int(b.get("code"))] = b.text or ""
        rng = None
        if fields.get("Range"):
            try:
                lo, hi = (float(x) for x in fields["Range"].split()[:2])
                rng = (lo, hi)
            except ValueError:
                rng = None
        inc = None
        if fields.get("Increment"):
            try:
                inc = float(fields["Increment"])
            except ValueError:
                inc = None
        meta[name] = dict(doc=p.get("documentation") or "", human=p.get("humanName") or "",
                          range=rng, values=values, bits=bits, inc=inc)
    return meta


# ----------------------------------------------------------------------------- parsing
def parse_file(path: str):
    entries, errors = [], []
    seen = {}
    with open(path, encoding="utf-8") as f:
        for n, raw in enumerate(f, 1):
            line = raw.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            m = LINE_RE.match(line)
            if not m:
                errors.append((n, "-", f"syntax: cannot parse line: {line.strip()[:60]}"))
                continue
            name, sval, comment = m.group(1), m.group(2), (m.group(3) or "").strip()
            if not NAME_RE.match(name):
                errors.append((n, name, "syntax: name must be A-Z/0-9/_ and at most 16 characters"))
                continue
            try:
                val = float(sval)
                if math.isnan(val) or math.isinf(val):
                    raise ValueError
            except ValueError:
                errors.append((n, name, f"syntax: value '{sval}' is not a number"))
                continue
            if name in seen:
                errors.append((n, name, f"duplicate: also set on line {seen[name]}"))
            seen[name] = n
            entries.append((n, name, val, comment))
    return entries, errors


# ----------------------------------------------------------------------------- checks
def mentions(doc: str, val) -> bool:
    """True if the metadata description quotes this exact number (e.g. '-1' or '65535.')."""
    tok = re.escape(f"{val:g}")
    return re.search(r"(?<![\d.])" + tok + r"(?!\.?\d)", doc) is not None


def check_value(name, val, md):
    errs, warns = [], []
    doc = md["doc"]
    if md["bits"]:
        if val != int(val) or val < 0:
            if not (val == -1 and "-1" in doc):
                errs.append(f"bitmask value {val:g} must be a non-negative integer")
            return errs, warns
        undefined = [b for b in range(32) if (int(val) >> b) & 1 and b not in md["bits"]]
        if undefined:
            if mentions(doc, int(val)):
                warns.append(f"bitmask sets undefined bit(s) {undefined}, but the description recommends {int(val)}")
            else:
                errs.append(f"bitmask uses undefined bit(s) {undefined}")
        return errs, warns
    rng = md["range"]
    if rng:
        lo, hi = rng
        if not (lo - 1e-9 <= val <= hi + 1e-9):
            special = mentions(doc, val)
            if special:
                warns.append(f"{val:g} is outside Range {lo:g}..{hi:g} but is a documented special value")
            else:
                errs.append(f"value {val:g} outside Range {lo:g}..{hi:g}")
        if md["inc"]:
            q = (val - lo) / md["inc"]
            if abs(q - round(q)) > 1e-6:
                warns.append(f"value {val:g} is not a multiple of Increment {md['inc']:g}")
    elif md["values"]:
        if val not in md["values"]:
            listed = ", ".join(f"{k:g}" for k in sorted(md["values"]))[:120]
            errs.append(f"value {val:g} not in listed values ({listed})")
    return errs, warns


def corewing_check(params: dict):
    """DShot timer-group conflicts on the CoreWing F405 Wing V2."""
    errs, notes = [], []
    qtype = params.get("Q_M_PWM_TYPE", 0)
    otype = params.get("SERVO_BLH_OTYPE", 0)
    blh_mask = int(params.get("SERVO_BLH_MASK", 0))
    func = {i: int(params.get(f"SERVO{i}_FUNCTION", 0)) for i in range(1, 13)}
    proto = {}
    for i in range(1, 13):
        if func[i] in MOTOR_FUNCS and qtype >= 4:
            proto[i] = qtype
        elif (blh_mask >> (i - 1)) & 1 and otype >= 4:
            proto[i] = otype
    for i, p in proto.items():
        if i in COREWING_NO_DSHOT:
            errs.append(f"S{i} set to DShot but S11-S12 are PWM-only on this board")
    for g in COREWING_GROUPS:
        dshot = {i: proto[i] for i in g if i in proto}
        if not dshot:
            continue
        if len(set(dshot.values())) > 1:
            errs.append(f"group {g}: mixed DShot rates {sorted(set(dshot.values()))}")
        for i in g:
            if i in dshot:
                continue
            if func[i] in SERVO_FUNCS or func[i] in MOTOR_FUNCS or func[i] == 70:
                errs.append(f"group {g}: S{i} (function {func[i]}) shares a timer with DShot output(s) "
                            f"{sorted(dshot)} and would be forced to DShot")
        notes.append(f"group {g}: DShot on {sorted(dshot)}")
    return errs, notes


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", help=".param files (later files overlay earlier ones for --corewing)")
    ap.add_argument("--pdef", action="append", help="metadata path or URL (repeatable); default: current ArduPlane")
    ap.add_argument("--corewing", action="store_true", help="CoreWing F405 Wing V2 DShot timer-group check")
    ap.add_argument("--require-every-line-commented", action="store_true")
    a = ap.parse_args(argv)

    sources = a.pdef or [DEFAULT_PDEF]
    metas = []
    for s in sources:
        try:
            path = fetch(s)
            metas.append((s, load_pdef(path)))
        except Exception as e:  # noqa: BLE001
            print(f"ERROR: cannot load metadata {s}: {e}")
            return 2
    for s, m in metas:
        print(f"metadata: {s}  ({len(m)} parameters)")

    n_err = n_warn = 0
    merged = {}
    for fpath in a.files:
        entries, errors = parse_file(fpath)
        warns = []
        for (n, name, val, comment) in entries:
            merged[name] = val
            if a.require_every_line_commented and not comment:
                errors.append((n, name, "no trailing comment"))
            for s, meta in metas:
                tag = "" if len(metas) == 1 else f" [{os.path.basename(os.path.dirname(s)) or s}]"
                md = meta.get(name)
                if md is None:
                    errors.append((n, name, f"unknown parameter name{tag}"))
                    continue
                e, w = check_value(name, val, md)
                errors += [(n, name, x + tag) for x in e]
                warns += [(n, name, x + tag) for x in w]
        print(f"\n{fpath}: {len(entries)} parameters")
        for n, name, msg in sorted(errors):
            print(f"  ERROR   line {n:>3}  {name:<17} {msg}")
        for n, name, msg in sorted(warns):
            print(f"  warning line {n:>3}  {name:<17} {msg}")
        n_err += len(errors)
        n_warn += len(warns)

    if a.corewing:
        errs, notes = corewing_check(merged)
        print("\nCoreWing F405 Wing V2 output groups (merged files):")
        for x in notes:
            print("  info    " + x)
        for x in errs:
            print("  ERROR   " + x)
        n_err += len(errs)

    print(f"\nRESULT: {'PASS' if n_err == 0 else 'FAIL'}  ({n_err} errors, {n_warn} warnings)")
    return 0 if n_err == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
