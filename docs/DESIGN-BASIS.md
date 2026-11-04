# Design basis — Lift + Cruise VTOL (v0.4.0, 2026-10-21)

Status: v0.4.0 (2026-10-21). v0.4: full engineering draft — exact hardware and fits (docs/research/hardware-spec.md),
aerodynamic package with CFD (docs/research/aerodynamics.md) that resized the wing and added leg fairings, CAD rev B with every
fastener, build manual DBF-MAN-001, test plan DBF-TP-001, flight software (firmware/), 29-variant trade study
(docs/research/configurations.md). 2026-10-25: values re-based on the R11 wing re-size, chord 266.6 mm, MTOW 6.45 kg (CAD model rev C, drawing DBF-DRW-001 rev D; R11 now met). 2026-10-25: re-based on the 11.75 m/s design stall target, chord 284.2 mm, MTOW 6.55 kg, CAD model rev D, drawing DBF-DRW-001 rev E (docs/research/stall-margin.md; R11 met with a 2.1 % speed / 4.1 % CL_max margin; thermal analysis docs/research/thermal.md). v0.3.1 (2026-10-13): project-audit fixes. v0.3: R6 clarified as a hard cap incl. tax and shipping; R7 reserve revised;
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
| R2 | MTOW 8–15 kg target; hard cap < 25 kg (55 lb). Exact MTOW is a design output from budget and mission. **Outcome v0.4 (2026-10-25): 6.55 kg** (analysis/results.json C0 sized.m 6.552; cap met; below the target; recommended for acceptance, pending team sign-off). v0.3.1: 6.18 kg. | Given |
| R3 | Wingspan 2–3 m. | Given |
| R4 | Breaks down so the largest piece fits in a standard car. Working envelope (est.): largest piece ≤ 1.5 × 0.5 × 0.4 m; to be replaced by the team's measured car (M-item). | Given (envelope Assumed) |
| R5 | Two people can carry it assembled; a team of 4 handles it routinely. Assembly from transport to flight-ready ≤ 15 min (est.). | Given (time Assumed) |
| R6 | Total physical spend ≤ $2,000, **fixed — cannot be expanded** (team, 2026-10-13). Inside the cap: all hardware, spares, both flight packs, charger, test gear, shipping and sales tax. Outside the cap: FAA/AMA fees (not hardware). On hand at $0: 3D printer and hand tools only. | Given |
| R7 | Budget holds a second flight pack and spares; crash-repair reserve = whatever remains under the R6 cap, target ≥ $100 (est.). | 2nd pack/spares Given; reserve Assumed (revised 2026-10-13) |
| R8 | Built and flight-tested (hover, transition, cruise, back-transition, landing) by 2027-04-30. | Given |
| R9 | Mission: VTOL takeoff → hover → transition → cruise → back-transition → hover → vertical land. | Given |
| R10 | Endurance: ≥ 10 min cruise + ≥ 2 min total hover per flight, with ≥ 20 % battery energy reserve at landing. | Assumed |
| R11 | Cruise speed 18–22 m/s; stall speed ≤ 12 m/s at MTOW (est.), designed to 11.75 m/s to hold a 4.1 % CL_max margin (docs/research/stall-margin.md, 2026-10-25); transition complete above 1.3 × stall (AIRSPEED_MIN set to 16 m/s ≥ 15.6). | Assumed |
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

## Design outcomes (v0.4.0)
- C0 4-lift twin boom, unchanged as the concept: the 29-variant trade study (analysis/tradestudy.json) ranks the C0 family first among layouts that meet R1; a quad tailsitter scores higher but breaks R1.
- Wing sized on the aerodynamic package's trimmed CL_max (1.114, analysis/aero/aero_results.json) at the 11.75 m/s design stall target (re-based 2026-10-25; the R11 close earlier that day used 12.0 m/s and CL_max 1.121, chord 266.6 mm): S 0.682 m², chord 284.2 mm, AR 8.4, span 2.4 m. MTOW 6.55 kg (analysis/results.json C0 sized).
- R6/R7: committed $1896.79 incl. 10.25 % tax and a $110 shipping allowance; reserve $103.21 (R7 met). To hold it, the hinge tape (skin tape serves), the spare servo and the spare pushrods were dropped after the hardware itemisation.
- R10: 12.3 min cruise available (sizing) and 13.7 min (aero build-up) after 2 min hover and the 20 % reserve. Needs the printed teardrop leg fairings: with bare round legs the build-up gives 8.6 min and R10 fails.
- R11: stall 11.75 m/s predicted at MTOW (analysis/aero/aero_results.json stall, CL_max 1.114) against the 12 m/s limit: met with a 2.1 % speed margin (4.1 % on CL_max; it covers the low 2-D estimate and about 0.28 kg of mass growth, not a 10–15 % CL_max shortfall, docs/research/stall-margin.md); AIRSPEED_MIN 16 m/s ≥ 1.3 × 12 = 15.6. Confirmed by the stall flight test (DBF-TP-001 F09), with the measured-stall firmware rule of stall-margin.md §5 as the backstop.
- R13: T/W 1.91 on maker data at nominal voltage (analysis/results.json C0 sized.TW); strict R13 needs ≥ 2.62 kgf per motor at storage-low voltage on the thrust stand.
- R14: hover motor-out not met by C0; the 8-lift layouts exceed the cap. Accepted with hover limits (≤ 5 m AGL, ≤ 60 s).
- R17: ArduPlane 4.7.2 stable (2026-10-11) includes the CoreWingF405WingV2 target: the beta risk and the 2027-02-22 go/no-go are closed. Parameter file firmware/vtol_c0.param passes the checker; SITL scenarios A–G pass on ArduPilot's generic QuadPlane and, since 2026-10-25, on a 6-DOF model of C0 itself (firmware/sitl/README.md); THR_MAX 85 caps the pusher until bench test M1.
- Stability: neutral point 39.8 % MAC with the pod (AVL); static margin 11.8 % at the 28 % CG and 5.1 % at the empty-bay CG → fly with 0.5 kg ballast in the payload bay when there is no payload.
- Structure: joiner reserve factor 1.75 on yield at 4.5 g (275 / 157.5 MPa, analysis/results.json C0 struct.sigJ; the FEA on CAD rev D gives 154.7 MPa fine mesh and RF 1.88 on the idealised joiner, cad/sim/results.txt) (hand calc on the true joiner governs). Joiner is a slip fit retained by printed stops, not bonded, so the pod piece stays inside the R4 envelope.
- Thermal (docs/research/thermal.md, 2026-10-25, 35 °C day): a pack at the C11 resistance limit ends the mission at 64 °C (limit 60 °C) because the foam bay is adiabatic; lift motor and ESC end the take-off hover + transition 2–4 K under their estimated limits; the pusher can reaches 90 °C in the closed cup with a conservative loss. Mitigations: battery-bay and canopy vents, ESCs in the prop wash, pusher-cup slots (DBF-MAN-001), a 5 mΩ/cell hot-day pack limit and the kept 60 s hover rule (DBF-TP-001).

## Assumptions the team most needs to confirm
1. R14 motor-out in hover. Resolved for v0.3.1: not met by C0; accepted with hover limits because no motor-out-tolerant layout fits the R6 cap.
2. R10/R11 mission. Endurance and speed set battery mass, which sets MTOW and cost.
3. R18/R19 legal path and flying site. Which certificate path (44809 educational vs Part 107), whether the project is a registered student org or a UC course, and which field. A transition test needs a long VLOS field.
4. R7 crash reserve: now "what remains under the cap, target ≥ $100" ($103.21 in v0.4.0).
5. R4 car envelope. Measure the actual car.
6. R12 payload. Any real payload raises MTOW.
7. ~~Build vs kit~~ — resolved 2026-10-13: scratch build.
8. R19: the policy names senior projects explicitly; confirm institutional sponsorship for the § 350 educational path and request Richmond Field Station.
9. R2: sign off the 6.55 kg MTOW (below the 8–15 kg working target).

## Repo contents at Step 1
CLAUDE.md; docs/VTOL-REVIEW-PROMPT.md; docs/reference/REVIEW-STYLE.md;
docs/reference/lift-cruise-reference.png. No CAD, no requirements doc
(before this file), no sizing scripts, no BOM.
