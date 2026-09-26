# HotelSim — what we're making

A casual, cartoon-styled hotel management game in the Theme Hospital / RollerCoaster Tycoon
tradition: **isometric**, multi-floor, **one floor drawn at a time**. The player **draws rooms
and furnishes them item by item** (the Two Point direction), hires staff, sets prices, and keeps
guests happy while things go wrong.

The fun of the genre is reacting to trouble, through staff, under a target. That is what we are
building towards. The nostalgic look is part of the point; placeholder art ships first and real
art replaces it without touching the simulation.

## The only milestone: a stranger enjoys 20 minutes

One level. A near-empty building, a target (e.g. 3 stars and £25,000 by day 30), a way to lose,
trouble that arises by itself, staff to deal with it, and a price to set. Anything not on that
path waits in the **Later** list in `GOALS.md`.

## Three loops

Every feature feeds one of these, or it waits.

- **Guest loop** — a guest arrives, forms needs, gets them met or doesn't, pays, and reviews.
  *Built.*
- **Money loop** — room revenue against wages and upkeep, settled nightly. *Built; nobody is
  employed yet.*
- **Build loop** — spend cash, add rooms and items, earn stars, stars bring guests. *Built,
  except room quality (size and decor) which is not scored yet.*

## Against the genre (September 2026)

| Pillar | State |
|---|---|
| Trouble that arises by itself (dirt, breakdowns) | **missing** — next |
| Staff who do work | **missing** — wages exist, no hiring, no jobs |
| A goal and a way to lose | **missing** — scenarios carry opening capital only |
| A price the player sets | **missing** |
| Rooms built from kit, scored on quality | half — draw and furnish work, no quality score |
| Guests you can read | present — need bars, checkout remarks |
| A build loop that pays back | present — stars drive demand |
| Charm: art, animation, sound | mostly missing — jokes only |

## What never changes

The simulation is **headless and deterministic** and the renderer is separate from it. Content
is data. Money is integer pence. The six invariants in `CLAUDE.md` protect this; changing one is
Sam's decision.

## How the project runs

- **Sam plays every week** for about 15 minutes and writes five bullets. Those become the next
  goals. Between sessions the loop does not stop to ask: it takes the reversible option and
  notes it in `GOALS.md`.
- **One goal at a time**, from `GOALS.md`. A **builder** builds it; a **reviewer**, with no write
  access, reviews it.
- **A game goal is done** when `pnpm verify` is green and the builder has **played it and
  captured the change on screen** — a screenshot, or a short clip when the change happens over
  time.
- **Tuning numbers are round guesses, then played.** No derivations.
- **Decisions** go in `DECISIONS.md` only when they are hard to reverse, one paragraph each.
- **Comments** give the one-line why. History lives in git.

The old charter, ledgers and 132 ADRs are in `archive/`. Read them only to answer a specific
question about why something is the way it is.
