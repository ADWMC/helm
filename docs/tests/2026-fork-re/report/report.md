# helm-pi Run Report

## Spec
- Goal: crackme RE chain finish with coverage gate and 1 measured evidence slice
- Allowed targets: http://127.0.0.1:18081*
- Run status: **open** (structural; semantic needs GoalVerifier)
- Revision: 5

## Engagement (RoE + ATT&CK)
- RoE highRisk: deny
- ATT&CK (no playbook): (none mapped)
- Evidence audit: acquisition=1, utilization=0 — acquisition vs utilization: a no-check is not a cannot-use; diagnostic-set acquisition is non-negotiable

## Steps
- [done] `recon` (recon) target=local:crackme — recon sample

## Evidence status (Dark-Moon ladder)
- 0 exploited · 1 confirmed · 0 unconfirmed (of 1 observations)
- UNCONFIRMED means "grounded but impact not demonstrated" — still reported, never dropped (I18/I6).

## Observations (evidence candidates)
- `o1` step=`recon` seq=1 **confirmed**

## Coverage (I19)
- requireCoverage: yes
- [clean] `re chain: no-network-termination (fixture has no sockets — checked via objdump imports)`

## Claims
_(none)_

## Directions
_(none)_

## Hints
_(none)_

## Journal (last 30)
- r0 init
- r1 spec
- r2 step_add
- r3 coverage
- r4 observation
- r5 step_status

## Deliverability prefixes
- Structured finish basis: not completed
- Semantic goal: NOT proven by this report — run GoalVerifier / approve_goal

## Diagnostics (operator view — NOT evidence, I6)
_(none)_
