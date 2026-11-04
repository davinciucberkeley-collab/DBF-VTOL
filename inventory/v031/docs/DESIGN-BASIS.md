# Design basis — Lift + Cruise VTOL (v0.3.1, 2026-10-13)

Status: v0.3.1 (2026-10-13). v0.3: R6 clarified as a hard cap incl. tax and shipping; R7 reserve revised;
budget redesign (C0 4-lift, X4110S, 6061 tubes, taped XPS wing). v0.3.1: project-audit fixes (see
"Design outcomes" below). Previous: v0.2. Team decisions 2026-10-13: scratch-built airframe (no kit);
R10/R11 and R14 delegated to the reviewer and set as below; project is part
of a UC Berkeley capstone course (bears on R19).
"Given" = stated in docs/VTOL-REVIEW-PROMPT.md or CLAUDE.md.
"Assumed" = proposed here; needs team confirmation. Values marked (est.) are
engineering estimates, not measured or looked up.

## Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| R1 | Configuration: vertical lift rotors for takeoff/landing, pusher prop + fixed wing for cruise, lift rotors stopped in cruise. | Given |
| R2 | MTOW 8–15 kg target; hard cap < 25 kg (55 lb). Exact MTOW is a design output from budget and mission. **Outcome v0.3.1: 6.18 kg** (cap met; below the target; recommended for acceptance, pending team sign-off). | Given |
| R3 | Wingspan 2–3 m. | Given |
| R4 | Breaks down so the largest piece fits in a standard car. Working envelope (est.): largest piece ≤ 1.5 × 0.5 × 0.4 m; to be replaced by the team's measured car (M-item). | Given (envelope Assumed) |
| R5 | Two people can carry it assembled; a team of 4 handles it routinely. Assembly from transport to flight-ready ≤ 15 min (est.). | Given (time Assumed) |
| R6 | Total physical spend ≤ $2,000, **fixed — cannot be expanded** (team, 2026-10-13). Inside the cap: all hardware, spares, both flight packs, charger, test gear, shipping and sales tax. Outside the cap: FAA/AMA fees (not hardware). On hand at $0: 3D printer and hand tools only. | Given |
| R7 | Budget holds a second flight pack and spares; crash-repair reserve = whatever remains under the R6 cap, target ≥ $100 (est.). | 2nd pack/spares Given; reserve Assumed (revised 2026-10-13) |
| R8 | Built and flight-tested (hover, transition, cruise, back-transition, landing) by 2027-04-30. | Given |
| R9 | Mission: VTOL takeoff → hover → transition → cruise → back-transition → hover → vertical land. | Given |
| R10 | Endurance: ≥ 10 min cruise + ≥ 2 min total hover per flight, with ≥ 20 % battery energy reserve at landing. | Assumed |
| R11 | Cruise speed 18–22 m/s; stall speed ≤ 12 m/s at MTOW (est.); transition complete above 1.3 × stall (AIRSPEED_MIN set to 16 m/s ≥ 15.6). | Assumed |
| R12 | Payload: none required beyond avionics; reserve 0.5 kg / bay volume for a future camera or sensor. | Assumed |
| R13 | Hover thrust-to-weight ≥ 1.6 at MTOW, all lift motors running, with the battery at storage-low voltage. | Assumed |
| R14 | Lift motor-out in cruise: aircraft continues as a fixed wing and lands (hard). Lift motor-out in hover: controlled vertical landing is *desired*, scored in the Pugh matrix and decided by the 4-lift vs 8-lift cost comparison (§7). | Assumed (team deferred choice, 2026-10-13) |
| R15 | Pusher-out in cruise: aircraft can re-enter hover (QAssist / VTOL recovery) and land vertically. | Assumed |
| R16 | Wind: operate in steady wind ≤ 5 m/s, gusts ≤ 8 m/s (est.). | Assumed |
| R17 | Flight controller: open-source autopilot with maintained lift + cruise VTOL support (ArduPilot QuadPlane or PX4 VTOL; current support to be verified in §10). | Assumed |
| R18 | Legal (FAA): fly under 49 U.S.C. § 44809 via the higher-education educational provision (Pub. L. 115-254 § 350) or under Part 107; operators pass TRUST (or hold a Part 107 certificate); aircraft registered and marked; Remote ID by broadcast module (14 CFR 89.115(a)) or flown inside a FRIA (89.115(b)); VLOS; ≤ 400 ft AGL in Class G, authorization in controlled airspace. | Assumed path; rules cited below |
| R19 | Legal (campus): on-campus outdoor flight needs a UAS Flight Request ≥ 7 business days ahead, a post-flight report within 3 business days, and ≥ $1M liability insurance (AMA membership satisfies it for recreational users). Recreational use is limited to registered student orgs and "University of California courses (including senior projects)". Site limits: Richmond Field Station 400 ft AGL; Clark Kerr track 200 ft AGL; La Loma field below 20 ft within the fences; 6 a.m. to sunset; no flying on game or graduation days. Only RFS supports transition testing (≥ 30 m AGL). Liability cover is per pilot. Off-campus sites follow their own managers' approvals. | Assumed path; policy cited below (checked 2026-10-13) |
| R20 | Safety: hardware arming switch / kill, failsafe RTL-then-land on link loss, geofence. Implementation v0.3.1: XT90-S anti-spark battery plug as the physical disconnect + RC arm switch + ArduPilot arming checks; geofence per site ceiling. | Assumed |

### Rule sources (checked 2026-10-13)
- 49 U.S.C. § 44809(a) conditions; § 350 educational note: https://www.law.cornell.edu/uscode/text/49/44809
- 14 CFR 107.51 (87 kt, 400 ft AGL, 3 sm visibility, cloud clearance): https://www.law.cornell.edu/cfr/text/14/107.51
- 14 CFR 89.115 (broadcast module / FRIA, VLOS): https://www.law.cornell.edu/cfr/text/14/89.115
- UC Berkeley UAS (Drone) Policy, effective 2018-05-15, revised 2025-04-04: https://oercs.berkeley.edu/policies/campus-policy-library/unmanned-aircraft-system-drone-policy
- FAA Educational Users page (https://www.faa.gov/uas/educational_users/) returned HTTP 403 on 2026-10-13; not verified.

## Design outcomes (v0.3.1)
- C0 4-lift twin boom; MTOW 6.18 kg; spend $1,897.92 incl. tax and a $100 shipping allowance; reserve $102.08 (R7 met, thin).
- R10: 11.9 min cruise available after 2 min hover and the 20 % reserve; design margin 15 % (est.) on top.
- R13: T/W 2.03 on maker data at nominal voltage; open until thrust-stand test T2.
- R14: hover motor-out not met by C0; the 8-lift layouts exceed the cap. Accepted with hover limits (≤ 5 m AGL, ≤ 60 s).
- R17: CoreWing F405 Wing V2 target is beta-only; go/no-go 2027-02-22, fallback Matek F405-WMO.
- Structure: joiner reserve factor 1.85 on yield at 4.5 g (hand calc on the true joiner governs).

## Assumptions the team most needs to confirm
1. R14 motor-out in hover. Resolved for v0.3.1: not met by C0; accepted with hover limits because no motor-out-tolerant layout fits the R6 cap.
2. R10/R11 mission. Endurance and speed set battery mass, which sets MTOW and cost.
3. R18/R19 legal path and flying site. Which certificate path (44809 educational vs Part 107), whether the project is a registered student org or a UC course, and which field. A transition test needs a long VLOS field.
4. R7 crash reserve: now "what remains under the cap, target ≥ $100" ($102.08 in v0.3.1).
5. R4 car envelope. Measure the actual car.
6. R12 payload. Any real payload raises MTOW.
7. ~~Build vs kit~~ — resolved 2026-10-13: scratch build.
8. R19: the policy names senior projects explicitly; confirm institutional sponsorship for the § 350 educational path and request Richmond Field Station.
9. R2: sign off the 6.18 kg MTOW (below the 8–15 kg working target).

## Repo contents at Step 1
CLAUDE.md; docs/VTOL-REVIEW-PROMPT.md; docs/reference/REVIEW-STYLE.md;
docs/reference/lift-cruise-reference.png. No CAD, no requirements doc
(before this file), no sizing scripts, no BOM.
