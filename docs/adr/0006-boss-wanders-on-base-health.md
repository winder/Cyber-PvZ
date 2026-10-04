# 6. ZomWes wanders when the base it attacks loses 25%

- **Status:** Accepted
- **Date:** 2026-10-04 (recorded retroactively; decided 2026-10-02 to 10-04)

## Context

The request: ZomWes should "wander between the different bases every
time they reach a 25% health threshold". "They" could mean the bases or the
boss.

## Decision

Interpret it as **the base being attacked**: each time it loses another
quarter of its health, ZomWes moves to the base it visited longest ago.
Make it a config switch (`wanderOn: 'base' | 'self'`).

## Consequences

- He tours all three bases instead of finishing one, so the player must
  defend everywhere.
- Switching interpretation is a one-word config change.

## Alternatives considered

Wander on the boss's own health; nearest-other-base (ping-pongs between two).
