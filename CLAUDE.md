# Lift + Cruise VTOL — student project

Hybrid lift + cruise VTOL: vertical lift rotors for takeoff/landing, a pusher
prop and fixed wing for cruise, lift rotors stopped in cruise.

## Hard constraints
- $2,000 total physical budget (hardware, spares, batteries, test gear,
  shipping, tax).
- Built and flight-tested by the end of April 2027.
- Portable: a team of 4 moves it routinely. Target 8–15 kg MTOW, 2–3 m span,
  hard cap under 25 kg (55 lb). Breaks down to fit in a standard car; two
  people can carry it assembled.

## Working rules
- Scope is the real, physical aircraft. Ignore any browser flight-sim code.
- Every number cites its source: a repo file, a shown formula, or a URL with
  the date checked. Look up prices and specs; don't recall them.
- Label estimates as estimates. Unknowns are "—", never invented.
- Reports follow docs/reference/REVIEW-STYLE.md.

## Team (commit attribution)
The repo lives at davinciucberkeley-collab/DBF-VTOL. Claude sessions push from a
shared account, so ask who is working (or use the name they give) and credit them
with `git commit --author "<Name> <email>"`. Use `Co-Authored-By: <Name> <email>`
trailers for work done together. Use these GitHub no-reply emails, never personal
addresses.

| Name | GitHub | Commit email |
|---|---|---|
| Tristan Hottier | TristanHottier | 185231225+TristanHottier@users.noreply.github.com |
| Dillon Alcouffe | Dalcouffe1 | 130024709+Dalcouffe1@users.noreply.github.com |
| James Guymon | JamesRop | 55683057+JamesRop@users.noreply.github.com |
| Vaibhav Bagrodia | vaibhav1301-arch | 336305533+vaibhav1301-arch@users.noreply.github.com |

## Key files
- docs/VTOL-REVIEW-PROMPT.md — the design-review task.
- docs/reference/REVIEW-STYLE.md — house style for reviews.
- docs/reference/lift-cruise-reference.png — BETA Alia and 8-lift reference
  configurations.
