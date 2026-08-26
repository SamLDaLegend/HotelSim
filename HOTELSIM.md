1. Mission

Build a casual, cartoon-styled hotel building and management simulator. ISOMETRIC FLOORPLAN VIEW, in the Theme Hospital / RollerCoaster Tycoon tradition — multi-floor, ONE FLOOR RENDERED AT A TIME, floors switchable, with a cityscape behind and below. THE NOSTALGIC REGISTER IS THE POINT, NOT A SIDE EFFECT.

AND ROOMS ARE DESIGNED BY THE PLAYER, NOT PLACED FROM A CATALOGUE. The player draws a room's footprint, places items inside it, and the room is scored on what it contains [OWED TO M4] — function from required equipment [EXISTS AS A GATE, OWED TO M4 AS A SCORE], quality from size and decor [OWED TO M4], in the shape Two Point Hospital uses. A room TYPE is a constraint set in content; a room INSTANCE is the player's drawing, and that is world state (ADR-0046 §4).

MARKED WITH THE LOOP TERMS (§1.1), BECAUSE IT IS THE SAME CLASS AND WOULD OTHERWISE HAVE ESCAPED ON A TECHNICALITY: this sentence is a SPECIFICATION too, and NO ROOM IS SCORED TODAY. `drawRoom` and `placeItem` exist, so the player's footprint and its contents are real world state; the SCORE over them is not — no fold, no field, no reader, on main. THE FUNCTION HALF SPLITS AND THE SPLIT IS THE POINT: required equipment is a GATE today — `validity.ts` returns `missingItem` for a room lacking an item its type requires, so an unequipped room serves nobody — but a gate is binary and this sentence promises a SCORE, which is a different quantity and does not exist. It is G-037a, the same goal that owes the loop's `quality`, and §1.1's `quality` row carries the evidence and the five present-tense docblocks that go with it.

RULED 2026-08-16, HUMAN — ADR-0046, the largest ruling in the project. This paragraph read "Side-on cross-section view (think SimTower / Project Highrise), not isometric" from before the first line of code until goal 33, and it superseded itself only when a human looked at the screen. Every criterion, ADR and goal resting on the old sentence is superseded with it.

WHAT IT COST TO FIND OUT, AND WHY THE RULE BELOW EXISTS. Six invariants, thirteen gates, fifty-seven ADRs, determinism proved byte-identical on three platforms twice, nineteen goals of instrument discipline — and THE THING THAT WAS WRONG WAS THE SECOND SENTENCE OF THIS SECTION. ADR-0013 established that a perceptual criterion needs a perceptual check; the gap one level up is that A DESIGN DECISION HAD NO CHECK AT ALL — not a weak one, NONE — because every goal, gate, critic and WATCH takes this charter as given.

THE MILESTONE QUESTION (ADR-0046 §1, and it belongs in §9 as a stop condition):

  A CHARTER DECISION THAT NO GOAL CAN QUESTION IS NOT SETTLED — IT IS UNEXAMINED. At each milestone exit the human is asked ONE question that is not about the code: DOES THE THING ON SCREEN STILL LOOK LIKE THE GAME WE MEANT TO BUILD?

It is cheap, it is a human call by construction, and it would have caught this at M2.5's sign-off instead of four goals into M3. DO NOT LET IT BECOME A MECHANISM: one question, at exit, answered by the human. IF IT GROWS A SCANNER, IT HAS BEEN MISUNDERSTOOD.

The game is three nested feedback loops. Every design and code decision should be traceable to one of them:

Guest loop — guest arrives [EXISTS], forms needs [EXISTS], gets them met or doesn't [EXISTS], pays [EXISTS], leaves a review [EXISTS].
Money loop — room revenue [EXISTS] against wages [OWED TO M4] and upkeep [EXISTS], settled nightly [EXISTS].
Build loop — spend cash [EXISTS], add capacity [EXISTS] and quality [OWED TO M4], raise reputation [OWED TO M4], raise demand [OWED TO M4], back to the guest loop [OWED TO M4].

EVERY TERM CARRIES ITS MARK ON THE TERM, so no reader and no grep reaches one of these words without it. Not one of the words above was changed, added or removed to fit a mark — §1.1 explains why they are marks at all, and carries the evidence for each one.

If a proposed feature does not feed one of these three loops, it goes in PARKING.md, not in the sprint.

1.1 THE LOOP TERMS ARE SPECIFICATIONS, NOT DESCRIPTIONS, AND EVERY ONE OF THEM IS MARKED (RULED 2026-08-24, HUMAN — ADR-0081)

NOBODY HAD DRAWN THE DISTINCTION THAT MATTERS. Read as DESCRIPTIONS, the three sentences above were false for the life of the project — four of their terms name mechanics that no line of code implements — and every agent, every goal, read them as a statement of what the game IS. Read as SPECIFICATIONS they are obligations. RULED: SPECIFICATIONS.

SO EVERY TERM CARRIES A MARK — EXISTS or OWED TO M-N — AND A TERM WITHOUT ONE IS A CLAIM NOBODY HAS CHECKED. This is the same move ADR-0013 made for a perceptual criterion, aimed one level further up: a claim that could not be checked becomes one that can, for the cost of a few words. It is §9's unexamined-decision class at the charter's first paragraph, which is where it lives every time.

TWO RULES, AND THEY ARE WHAT KEEP THIS FROM ROTTING INTO THE THING IT REPLACED. (1) EVERY MARK OF EXISTS NAMES THE SYMBOL THAT MAKES IT TRUE, so a reader confirms it with one grep instead of believing this file — that is the whole difference between a mark and a second description. (2) THE MARK MOVES IN THE SAME COMMIT AS THE TERM: a goal that lands a term re-marks it, a goal that adds a term to a loop adds it marked, and a goal that finds a mark wrong says so rather than editing quietly. This is NOT a documentation-maintenance mechanism and must not grow into one (G-053a bound 7) — it is fifteen lines that either match the tree or do not.

MARKED 2026-08-25 (G-053a), AND THE COUNT NAMES ITS UNIT BECAUSE §4.1 REQUIRES IT TO: THE THREE LOOP SENTENCES CARRY FOURTEEN TERMS AND FIFTEEN MARKS — TEN TERMS EXIST, FOUR ARE OWED, and the fifteenth mark is the build loop's CLOSURE, which is a claim rather than a term and is owed with `demand`. THREE FURTHER MARKS SIT ON §1's ROOM-DESIGN SENTENCE above and are counted separately, so that this loop count stays comparable with the one in the goal block that ordered the marking. Every EXISTS below was re-verified against the tree on that date rather than inherited from the block — and one of them came back different, which is recorded at its own row.

  GUEST LOOP — five terms, five EXIST. It is the only loop running on all of its declared terms.

    guest arrives              EXISTS   `guestArrives` (packages/sim/src/commands.ts) and the arrival phase of `stepGuests`
                                        (tick.ts phase 2 of 5). IT IS A COMMAND, NOT SOMETHING THE SIMULATION DECIDES, and
                                        deliberately so: how often guests turn up is `demand`, which is owed below. So this
                                        term exists and its RATE does not.
    forms needs                EXISTS   `formNeedVector` (needs.ts) builds the vector from content at arrival.
    gets them met or doesn't   EXISTS   `advanceNeeds`, `isNeedSatisfiedIn`, `accumulateUnservedTicks`, `metAtDeparture`
                                        (needs.ts). Both outcomes are recorded, per need, at departure.
    pays                       EXISTS   `roomRevenue` in `TransactionReason` (ledger.ts); `countRoomRevenueTransactions`
                                        (guests.ts). Integer pence, ADR-0002.
    leaves a review            EXISTS   `reviewOf` and `recordReview` (reviews.ts), folded into `ReviewOutcomeRow`. IT EXISTS
                                        AND IT CARRIES ALMOST NO INFORMATION — measured one bit above the bottleneck
                                        (ADR-0080). That is a tuning finding owned by G-050/G-051, NOT a missing term, and
                                        the two must not be confused: a term that exists and says little is a different
                                        problem from a term that is not there.

  MONEY LOOP — four terms, three EXIST, one OWED. It has run on two thirds of itself since M0.

    room revenue               EXISTS   `roomRevenue` in `TransactionReason` (ledger.ts).
    wages                      OWED TO M4 — G-052 (staff exist, occupy rooms, and are paid). `TransactionReason` has EXACTLY
                                        NINE MEMBERS and none of them is a wage (ledger.ts). The only two occurrences of the
                                        word in all of `packages/sim` are comments deferring it (build.ts:52,
                                        settlement.ts:8). §8 puts "staff hiring and wages" in M4.
    upkeep                     EXISTS   `upkeep` in `TransactionReason`; `nightlyUpkeepOf` (settlement.ts) folds each room
                                        type's `nightlyUpkeepPence`.
    settled nightly            EXISTS   `isSettlementTick` — `tick % TICKS_PER_DAY === TICKS_PER_DAY - 1` — and `settleNight`
                                        (settlement.ts).

  BUILD LOOP — five terms, two EXIST, three OWED; plus its CLOSURE, owed. THIS IS THE LOOP THE MILESTONE QUESTION WAS ANSWERED AGAINST: ADR-0081's qualified yes says the build loop is "spend cash, add capacity, stop", and these marks are that sentence made checkable.

    spend cash                 EXISTS   `construction` and `floorConstruction` in `TransactionReason`, charged in
                                        `applyDrawRoom` (build.ts); `demolitionRefund` returns part of it.
    add capacity               EXISTS   BOTH WAYS, AND THIS ROW IS A CORRECTION — the goal block that ordered this marking
                                        expected `partial`, blocked at G-037b on ADR-0053's "a room holds one guest by
                                        enforced invariant". THAT READING IS TWO GOALS STALE. Hotel capacity: every
                                        `drawRoom` adds a bed. PER-ROOM capacity is live on shipped content — `findFreeRoom`
                                        refuses a lodging room whose type's `capacity` cannot hold the whole party
                                        (guests.ts:2200), `lodgingCapacityOf` bounds concurrent lodgers (guests.ts:1513),
                                        `claimEntity` admits a second lodger of the SAME party (guests.ts:1820), and
                                        `assertPartiesCanBeHoused` refuses content whose largest party exceeds the roomiest
                                        lodging type (content.ts:3054). Shipped: `bedroom` capacity 2 with
                                        `partySizeWeights: [3, 1]`, realised cycle 1, 1, 2 — A PAIR SHARES A BEDROOM TODAY,
                                        and it moved a number (occupancy 1203 -> 1275 at G-040b-ii, WATCH #22 has the frame).
                                        ADR-0053's grep — "exactly one reader, and it is a test" — returns THREE non-test
                                        readers now. ONE HONEST QUALIFICATION: only one lodging room type ships, so the
                                        player's lever is MORE rooms rather than BIGGER ones. The mechanism is live; the
                                        content offers no choice yet.
    quality                    OWED TO M4 — G-037a (a room is scored on what is in it). NOTHING ON MAIN READS A ROOM'S
                                        QUALITY: no quality field, no fold, no reader. `quality.ts` exists only on branch
                                        `g037a-quality-fold` (87c0101), 45 commits behind and carrying a save bump off v23.
                                        G-037a's block still reads Milestone: M3 and M3 signed off without it (ADR-0081) —
                                        which milestone it moves to is the human's, and M4 is the earliest it can be.
                                        AND FIVE DOCBLOCKS ON MAIN ASSERT THE MECHANIC IN THE PRESENT TENSE — content.ts
                                        1948, 2075, 2429 and 3910, and index.ts:102, e.g. "A room's quality now moves the
                                        achieved rate between `serviceFloorRefill` and `refillPerTick`". They are the
                                        largest §2.1 orphan on the tree and G-053a could not touch them: its bound 5 forbids
                                        moving any `packages/sim` file, and the bound was not weakened to reach it. THE GOAL
                                        THAT MERGES THE BRANCH OWNS REPAIRING OR DISCHARGING ALL FIVE, written into G-037a's
                                        block as an obligation rather than left in prose here.
    raise reputation           OWED TO M4 — G-051 ships the STAR RATING, which ADR-0082 rules is a SECOND and distinct
                                        system (professional inspection, judged on what the hotel HAS); reputation itself,
                                        judged on guest satisfaction, is unbuilt. The word appears ONCE in all of
                                        `packages/sim` — a comment at reviews.ts:12 — and nowhere in any other package.
                                        §8 puts "reputation feeding demand" in M4.
    raise demand               OWED TO M4 — §8's own M4 line. No demand model exists anywhere. Every occurrence of the word
                                        inside `packages/sim` is either the unrelated sense — `assertNeedDemandIsServiceable`,
                                        which is a need's demand on a guest's TIME — or an explicit deferral naming M4
                                        (commands.ts:300, content.ts:538, content.ts:546).
    back to the guest loop     OWED TO M4, WITH `demand`. THE FIFTEENTH MARK, AND IT IS A CLAIM RATHER THAN A TERM: that the
                                        outer loop is a LOOP. It does not close today. Arrivals come from the command log on
                                        a fixed cadence, so nothing a player builds changes how many guests arrive, and the
                                        build loop is an open chain that terminates in cash. Marked separately because a
                                        reader checking four missing nouns would not otherwise check whether the arrow at
                                        the end of the sentence points at anything.

2. Invariants — non-negotiable, machine-checkable

These are the architecture. They are not guidance, they are CI gates. Every one must be enforced by a command that exits non-zero on violation. No goal is done while any of these is red.

ID	Invariant	Gate
I1	Sim purity. packages/sim imports nothing from the render layer, no DOM, no engine API, no filesystem, no network.	pnpm check:purity — dependency-cruiser rule plus an import scan.
I2	Determinism. Same seed plus same command log produces a byte-identical state hash after 100,000 ticks, on every run and every platform. No Math.random, no Date.now, no Set/Map iteration-order dependence inside packages/sim. All randomness comes from an injected seeded PRNG.	pnpm test:determinism
I3	Content is data. No room type, item, staff role or guest archetype defined in code. All of it lives in packages/content as JSON validated against a schema.	pnpm check:content — fails if a new type literal appears outside packages/content.
I4	Ledger is append-only. Cash balance is derived by folding transactions, never stored and mutated.	pnpm test — unit test asserts balance is a pure function of the transaction log.
I5	Headless. pnpm sim:run --days 365 --seed 42 completes in Node with no window and no renderer, inside the budget. **The budget is DERIVED, not chosen** — 389,333ms, from a 60-room hotel at 30x sustaining real time; the arithmetic is in §2.1.2 and tools/gates/budget.mjs executes it. The 30x is the TOP RUNG of the content ladder — packages/content/data/speed-ladder.json, validated by a schema and read by tools/gates/budget.mjs (G-021) — and this budget is INVERSELY PROPORTIONAL to it, so retuning the ladder in JSON RE-DERIVES this number — with no edit to the DERIVATION, which is the part that could go wrong silently; the derived figure is also quoted in four places that bench.budget.test.ts pins, and a retune updates those with it (§2.1.2). What holds across a ladder change within ~12x is the conclusion, not the constant. The original "under 10 seconds" was invented at bootstrap with no basis and was replaced at G-018 (ADR-0013 §4). The word doing the work is HEADLESS; the time bound is a sanity ceiling, not a regression tripwire (§2.1.3).	pnpm sim:bench
I6	Save round-trip. Serialise then deserialise then re-hash produces an identical state hash. Save files carry a schema version and a migration path.	pnpm test:save

2.0 RED MEANS REPRODUCIBLE. AN INTERMITTENT GATE IS NOT RED, IT IS UNRELIABLE.

(Added 2026-08-09 by human ruling, after I4 began failing intermittently and the loop deadlocked on "no goal is done while any gate is red".)

The deadlock came from treating "red" and "unreliable" as the same state. THEY ARE NOT, AND THE DIFFERENCE IS THE WAY OUT.

A gate that fails REPRODUCIBLY is red. It is reporting a fact, and it blocks.

A gate that fails INTERMITTENTLY is not reporting anything. It has stopped being an instrument. YOU CANNOT ROUTE AROUND A RED GATE, BUT YOU ALSO CANNOT TAKE A RESULT FROM A BROKEN ONE — IN EITHER DIRECTION. "Green on the run I took" is unsafe for exactly the same reason "red on the run I took" is: neither reading carries information.

So: §2's "red" means a reproducible failure. AN INTERMITTENT GATE IS ITS OWN ESCALATION WITH ITS OWN REMEDY — REPAIR THE INSTRUMENT, NEVER REINTERPRET THE RESULT.

THE GUARD THAT KEEPS THIS FROM BECOMING AN UNBOUNDED EXEMPTION, and it is load-bearing rather than tidy: THE COUNT OF UNRELIABLE GATES IS CARRIED IN THE DIGEST, BESIDE THE GATE READINGS (§4.1). Two as of 2026-08-09. A THIRD IS A STOP CONDITION, not a third defensible decision — each one is defensible alone, which is exactly how a suite stops being evidence.

I2 is load-bearing beyond determinism. If someone leaks render state or wall-clock time into the simulation, the determinism test breaks immediately. It is the tripwire for the whole design. Do not weaken it, do not add tolerance, do not skip it "just for this goal".

2.1 A gate threshold must be derivable from a stated requirement

(Added 2026-08-08 by human ruling — ADR-0013 §4, generalising ADR-0007.)

Every number a gate compares against must trace to a requirement someone wrote down. A number nobody can source is not a gate, it is a superstition with CI access. It will still fail builds, still promote goals, and still be defended — with nothing behind it.

I5's ten seconds was invented at bootstrap and then promoted G-016 into existence. Its replacement is derived below (G-018) from what the game needs: a 60-room hotel at the fastest intended play speed sustaining real-time on a mid-range laptop, times a stated headroom multiple for the systems M3, M4 and M6 will add. Every recorded I5 figure has been re-baselined against it or struck.

This applies to every bound in the repo, not just I5 — scaling ratios, patience caps, review means. G-010's "measured × 1.5, then held at or below" is the right shape. A round number is not.

2.1.1 The play-speed ladder — CONTENT, and settled by watching (G-021)

A tick is one in-game minute and 1440 ticks make a day (packages/sim/src/world.ts:33). THE LADDER IS NOW CONTENT — packages/content/data/speed-ladder.json, three rungs, each carrying its own label and its own absolute speed:

  Fast     30 ticks per real second — a simulated day in 48 REAL SECONDS. THE TOP
           RUNG, which is what §2.1.2 below derives I5's budget from.
  Working  12 ticks per real second.
  Careful   5 ticks per real second.
  Pause is BENEATH the ladder and is NOT a rung: it is a transport state, not a rate.
           M5 must not read this table as the complete set of transport states.

30 IS THE ANCHOR, NOT THE CEILING. The rungs below it are spaced by what is playable, not by round multipliers, and 1x is deliberately absent — see the diagnostic below.

TWO FORMAT RULES, MINTED WITH THE FILE. (1) A rung carries its own name, so labels travel with values. (2) THERE IS NO IMPLIED ARITHMETIC BETWEEN RUNGS — they are not multiples of each other and nothing may compute one from another. Otherwise M5 hardcodes "1x/2x/3x" against content that does not mean that, and the first rebalance produces a UI that lies about itself.

WHAT ENFORCES RULE 2, AND WHAT DOES NOT. The schema is a strictObject with exactly {id, name, ticksPerRealSecond}, so no multiplier, base or ratio field survives parsing; a label that IS a multiple ("2x") is refused, which stops a DESIGNER encoding a relation in a name — it is leaky as a regex and that is stated at the point of use. The only gate consumer takes max, proved by an arm with the fastest rung in the MIDDLE. NONE OF THIS REACHES ARITHMETIC IN RENDER CODE: nothing in packages/content can stop M5 computing ladder[i] / ladder[0]. That instrument is a source scan over apps/game and it is parked with its falsification test, because apps/game may not be opened before M5.

THE PARKED INSTRUMENT IS BUILT AND THE PARAGRAPH ABOVE IS DISCHARGED (G-030). `apps/game` opened at G-030 under ADR-0018, so the precondition expired and the scan shipped in the same goal rather than after it — a parked instrument whose precondition has expired is ADR-0007's class waiting to happen. It is `pnpm check:ladder` (`tools/gates/check-ladder.mjs`), the THIRTEENTH row of `pnpm verify`, a `—` row rather than a seventh invariant because minting one is a human decision (§9).

WHAT THE SCAN CAN AND CANNOT SEPARATE, ANSWERING THE PARKED FALSIFICATION TEST ON ITS OWN TERMS. The test asked whether a syntactic pattern can tell the ban from legitimate arithmetic over speeds, and said that if it cannot, "the honest response is to say so in the schema comment rather than to keep implying a check exists". IT CAN, AND THE SEPARATING PROPERTY IS COUNTING RATHER THAN SPELLING: a violation is TWO rung speeds in ONE expression joined by ARITHMETIC. One speed with arithmetic is a tick accumulator and is allowed; two speeds COMPARED is how a consumer picks the fastest without trusting the table's order, and is allowed; two speeds separated by a COMMA are two readings rather than one calculation, and are allowed. All four allowed shapes are asserted silent in `ladder-arithmetic.test.ts`, which is what makes a predicate hard-coded to `true` fail as loudly as one hard-coded to `false`. ALIASING IS FOLLOWED ONE LEVEL, AND THE SPELLINGS IT FOLLOWS ARE NAMED RATHER THAN IMPLIED — because the first version of this sentence said "one level of aliasing is followed" while the shipped predicate followed only the plainest spelling of it, and `apps/game/src/main.ts` contained a spelling it could not see. `render-critic` measured that at sweep 1, in the paragraph declaring the instrument discharged, which is the worst place in this document for a claim to be larger than its check. WHAT IS FOLLOWED: a binding whose initialiser reads a rung speed EXACTLY ONCE and performs no arithmetic — so a plain read, a guard, a ternary, a `??` and a renaming destructure all register, and a tick accumulator deliberately does not, because it is a number derived from a speed rather than a second name for one. WHAT ESCAPES, each parked with a falsification test: a SECOND level (`const b = base`), an index computed with arithmetic (`rungs[i - 1].ticksPerRealSecond`), and two speeds handed to a helper as separate arguments. The general lesson is the one ADR-0007 keeps paying for: A CHECK'S PROSE MUST BE WRITTEN FROM ITS PREDICATE, NOT FROM ITS INTENT.

A NEAR-MISS WORTH KEEPING. The obvious enforcement — "no rung may be an integer multiple of another" — WOULD REJECT THIS LADDER: 30 = 6 x 5. Enforcement has to constrain the FORMAT and the CONSUMERS, never the designer's values.

HOW IT GOT SETTLED, kept because the reasoning is reusable. G-018 proposed 30x as a design fact and the human declined to ratify it (2026-08-08). THE TELL WAS NOT THE TOP SPEED, WHICH IS PLAUSIBLE; IT IS THE BOTTOM. Twenty-four real minutes per simulated day at 1x means **nobody will ever play at 1x**, and a ladder whose lowest rung is dead is not a ladder — it is a single speed with decoration below it. That is the kind of defect discovered the first time a human uses the viewer, which is exactly where it is sent.

WHY IT LOOKED SOUND AND WAS NOT, because the error is reusable. "One tick is one in-game minute" is a charter decision and it is sound. Mapping that minute 1:1 onto a real SECOND is a SEPARATE choice, and at G-018 it inherited its justification from the first one by adjacency: it is aesthetic tidiness, not a design finding. Two decisions that look like one because they share a unit is a shape worth recognising elsewhere.

WHAT THE LADDER SHOULD ACTUALLY BE ANCHORED ON: NIGHTLY SETTLEMENT, because that is when the money loop resolves. A management sim wants the player to watch several settlements land while turning over one decision. At 48s per simulated day that is a couple of minutes per decision cycle — on the sluggish side of the genre without being absurd, which is why the figure is usable as a working number and still wrong to mint.

ITS HOME IS CONTENT (I3), AND THAT IS WHERE IT NOW LIVES. A set of ticks-per-second figures is a balance number, and I3 says balance numbers are data rather than code. Built at **G-021**; not at G-018, whose exit criterion forbade touching packages/ and whose teeth were the point.

DISCHARGED BY **G-017's viewer**, and the instrument corrected the person who argued for the instrument. The human predicted 48s per simulated day would read SLUGGISH, reasoned from the settlement heartbeat. Watched, it reads BRISK — a prediction scored and half wrong, recorded by the human as "I derived a feel from arithmetic rather than from watching, which is precisely the move ADR-0013 exists to forbid." **The half that held is the one that mattered: 1x is dead**, and that is what makes this ladder non-linear rather than merely re-scaled.

Speed is expressed in ticks per real SECOND and never in ticks per rendered FRAME. That part is not provisional. §6.1's render-critic catalogue already lists frame-rate-dependent advance as a defect — "animation that runs faster on a 144Hz monitor" — so a speed control defined as "N ticks per frame" IS that defect. The render-engineer craft note ("speed controls change how many ticks are run per frame") holds only in the sense that a frame consumes the ticks the wall clock has earned; the count a second earns must not depend on the refresh rate.

THE REJECTED READING, RECORDED BECAUSE IT WOULD HAVE FLATTERED THE INCUMBENT. Read "30x" as 30 ticks per rendered frame at 60fps and you get 1800 ticks/s, which yields a 365-day budget of roughly 13.5s — within a rounding error of the ten seconds this section exists to replace. It was computed, and it is refused on two grounds: it is defined per frame, which the paragraph above forbids; and it means a simulated day passes in 0.8 seconds, at which nobody can watch a guest arrive, form a need and fail it. That is a fast-forward button, not a play speed, in a game whose M5 ships a scrubber and a speed control in order to be WATCHED. A reader who wants the incumbent number back should argue with these two grounds rather than with the arithmetic below.

2.1.2 I5's budget, derived (G-018)

REQUIREMENT (the human, 2026-08-08): a 60-room hotel at the fastest intended play speed sustains real time on a mid-range laptop, times a stated headroom multiple for what M3, M4 and M6 will add.

The requirement's two halves land in different places. "60-room hotel" sizes the WORKLOAD the gate runs; "30x" sizes the BUDGET it compares against. Only the budget is derived here.

INPUTS, each with its source:

  1  a tick is one in-game minute              packages/sim/src/world.ts:32
  2  1440 ticks per simulated day              packages/sim/src/world.ts:33 TICKS_PER_DAY
  3  365 days = 525,600 ticks                  I5's own wording; tools/gates/budget.mjs
  4  fastest play speed = 30 ticks/second      the TOP RUNG of the content ladder,
                                               packages/content/data/speed-ladder.json
                                               (G-021, §2.1.1)
  5  sim's share of one core, S = 0.10         ASSUMPTION, justified below
  6  headroom for M3+M4+M6, H = 4.5            estimated below from measured ratios

S IS AN ASSUMPTION AND IS LABELLED ONE. At M5 the sim shares a thread with Pixi, the UI and the GC, and no render cost has ever been measured because M5 is unbuilt. A tenth of one core is chosen rather than a quarter because a SMALLER share makes the derived budget TIGHTER — it makes this section's conclusion harder to reach, not easier. The sensitivity table below is there so the conclusion does not rest on the choice.

H IS DECOMPOSED, NOT ROUNDED. Each factor cites something this project measured:
  M3 circulation  x2.40  the only milestone-sized behaviour system ever measured here
                         is M2's need vector, at 2.41/2.37/2.32x AS FIRST IMPLEMENTED,
                         BEFORE G-016's 10.7% cut (CLAUDE.md, measuring). That state was
                         never committed, so no pair of commits reproduces it; the SHIPPED
                         pair measures 2.07x (G-016's block). Corrected at G-020a, whose
                         instrument cannot reach either. The consequence is nil and in the
                         conservative direction - sourcing this factor to 2.07 would give
                         H = 3.88 and a LOOSER budget - but a citation naming a state that
                         does not exist does not belong in the section whose point is that
                         a gate number must trace to something.
                         §8 calls M3 "where the genre's difficulty actually lives", so it
                         gets a full need-vector's worth rather than a discount.
  M4 economy      x1.50  staff are agents but fewer than guests; settlement is nightly and
                         already exists; upkeep is per-room per-night.
  M6 content      x1.25  content BREADTH is cheap here: the whole item registry measures
                         ~4-8% of the bench (1.043/1.038/1.075, interleaved, medians of 5).
                         Archetypes multiply per-guest scoring, not per-tick passes.
  product         x4.50  H is the weakest input in this derivation. Its error is absorbed
                         by the result being loose by two orders of magnitude either way.

THE ARITHMETIC, which tools/gates/budget.mjs executes rather than quotes (and which
tools/gates/bench.mjs imports rather than restates):

  real time available per tick at 30x     1s / 30            = 33,333,333 ns
  x sim's share of one core (S = 0.10)                       =  3,333,333 ns
  / headroom for M3, M4, M6 (H = 4.5)  -> per-tick budget    =    740,741 ns
  x 525,600 ticks (365 x 1440)         -> I5 BUDGET          =    389,333 ms

  = 389.3 seconds, about six and a half minutes. The measured figure includes fixed
  process startup (node, tsx, Zod, content load), which at this budget is noise.

SENSITIVITY, so the answer is not an artefact of S and H:

              H = 4.5      H = 13.8 (all three milestones as dear as M2's need vector)
  S = 0.25      973s        317s
  S = 0.10      389s        127s          <- shipped
  S = 0.02       78s         25s

Every cell is at least 2.5x the invented ten seconds and most are 10-100x. Only the reading §2.1.1 rejects lands near it.

WHAT A LADDER CHANGE DOES TO THIS BUDGET, STATED CORRECTLY. The budget is EXACTLY INVERSELY PROPORTIONAL to the top speed:

  budget_seconds = 525,600 x S / (speed x H)     check: 525,600 x 0.10 / (30 x 4.5) = 389.3

So halving the top rung doubles this constant, and doubling it halves it. **Retuning the ladder in content RE-DERIVES this budget; it does not leave it alone.** The derivation itself needs NO EDIT — tools/headless/src/speed-ladder.budget.test.ts proves that against a byte-identical copy of the gate module, sha256 asserted equal — and bench.mjs says so at the point of use.

SAY THE LIMIT OF THAT CLAIM, BECAUSE THE FIRST VERSION OF THIS PARAGRAPH OVERSTATED IT AND `sim-critic` MEASURED IT FALSE (G-021). "With no code edit" is true of the derivation and FALSE of the repository. A JSON-only retune reddens five assertions in bench.budget.test.ts, one of them budget.mjs's own summary comment — a .mjs file under tools/gates, so fixing it IS a code edit. That is the ADR-0007 machinery working as designed: every quoted copy of the number is pinned, so none of them can drift silently. The honest statement is that a retune requires no change to the ARITHMETIC and does require updating the places that quote its result, all of which a red test names.

WHAT SURVIVES IS THE CONCLUSION, AND THE FORMULA ALONE ESTABLISHES IT — no appeal to the table. Divide: a 12x faster ladder gives 389.3 / 12 = 32.4s, still 3.24x the ten seconds; the budget reaches ten seconds only at ~39x. **So the derived budget stays at least 2.5x the ten seconds for any ladder change within ~12x**, and a plausible retune moves this number without disturbing anything this section concludes about it.

TWO DRAFTS OF THIS SECTION CITED THE TABLE ABOVE AS EVIDENCE, AND BOTH WERE WRONG. The first claimed the budget "does not move materially if the ladder moves" — false, it is inversely proportional, and one division falsifies it. The second claimed S's column covers ladder moves to ~12x because it spans 12.5x end to end; but the equivalence that makes a k-fold ladder change identical to an S -> S/k change is anchored at the SHIPPED cell, S = 0.10, and the column reaches only 0.02 — **5x, not 12.5x**. The table is a sensitivity check on S and H, not on the ladder. It is recorded because the same reach-for-the-table happened twice under correction, which is worth more to a later reader than a clean paragraph.

WHAT THIS SAYS ABOUT THE TEN SECONDS — written after the constant was set, and measured afterwards as a separate step, in that order deliberately. The invented budget was roughly 39x TIGHTER than any requirement this project has stated. It failed builds the game had no need to fail, and it promoted G-016 into existence on that basis. The current build sits at about 2% of the derived budget.

2.1.3 What I5 is, now that its number is sourced

I5's load-bearing content is the word HEADLESS: the sim runs 365 days in Node with no window, no renderer and no DOM. THE TIME BOUND IS A SANITY CEILING, NOT A REGRESSION TRIPWIRE. It catches a catastrophe — an accidental quadratic, a per-tick allocation storm — and it is not meant to catch a 20% drift.

The tripwire this project has actually used for eighteen goals is a PAIRED RATIO against a same-sitting baseline (CLAUDE.md, "Measuring performance"): arms interleaved, warm-up discarded, medians of >=5, and the ratio quoted rather than the absolute. That is the instrument that found G-012's 2.4x and corrected G-016's retracted figures. G-018 added no gate; the human's consequence of widening this ceiling is that the practice becomes one — **G-020, a hard prerequisite of M3**, because M3 is the likeliest place in this project for a quadratic to appear.

Consequence, recorded rather than discovered later: any promotion trigger phrased as "sim:bench exceeds N% of the I5 budget" is now dead, because the budget can no longer be approached. That is the point. The human's complaint was that a made-up constant was promoting goals; a sourced ceiling promotes nothing. A replacement trigger must be a ratio against a paired baseline, and writing one is a goal, not a footnote.

THE GATE'S WORKLOAD DOES NOT YET MATCH THE REQUIREMENT'S, and G-018 changed no workload constant. The requirement says a 60-room hotel; the bench runs a 60-room shell at roughly a quarter occupancy (--arrivals 32, ~15 concurrent) with --amenities 1, which is four providers, while the scaling arm runs twenty. The gap is recorded in PARKING.md. It does not affect the budget derived above, which is a property of the play speed and not of the building.

3. Stack — fixed, do not relitigate
Language: TypeScript, strict mode, noUncheckedIndexedAccess on.
Monorepo: pnpm workspaces.
packages/sim — the headless simulation. Zero runtime dependencies. No DOM types in tsconfig.
packages/content — JSON definitions plus Zod schemas.
apps/game — Pixi.js render layer and UI. Reads sim state, dispatches commands.
  OPENED AT G-030 under ADR-0018, superseding line 66's "not before M5". Bundler and dev
  server are VITE, chosen because packages/sim and packages/content ship RAW TYPESCRIPT
  ("main": "./src/index.ts", no build step, no dist) and Vite is the option that consumes
  them with no change to either package. THE INVOCATION IS `pnpm dev` — recorded here and in
  README.md rather than in somebody's memory, which is G-030's own exit criterion. CI also
  runs `pnpm --filter @hotelsim/game build` on all three platforms: `typecheck` catches a
  type error, and only a real bundle catches a module that will not resolve in a browser.
tools/headless — CLI runner, determinism harness, balance simulator.
tools/viewer — (added 2026-08-08, ADR-0013 §1) disposable replay viewer. Consumes recorded frames from a completed run. Not the renderer, not apps/game, not a deliverable. May be thrown away at M5 and should be deleted rather than defended if it starts growing features.
Tests: Vitest. Sim package targets high coverage; render layer is not unit tested, it is playtested.
Persistence: JSON save blobs, versioned, with migrations from v1 onward.

Rationale, so you don't second-guess it: a headless TypeScript sim package is trivially unit-testable and fast to simulate at scale, which is exactly what the critic loop needs to function. A game engine would make the render layer nicer and the feedback loop far worse.

If the human later wants Godot, only apps/game is thrown away. That is the point of I1.

4. The goal ledger

Maintain GOALS.md at the root. One block per goal:

## G-014 — Lift queueing
Status: in-progress | blocked | done | parked
Milestone: M3
Owner pair: ai-engineer / ai-critic
Statement: Guests waiting for a lift form a queue, board in order up to car
  capacity, and the car serves calls without starving any floor.
Exit criteria:
  - pnpm test -- lift  (all green)
  - pnpm sim:run --days 30 --seed 7 reports zero guests with wait > 90 ticks
  - all §2 invariant gates green
Out of scope: express lifts, service lifts, lift upgrades  (-> PARKING.md)
Critique rounds used: 0/3

Rules:

Exit criteria must be commands, not adjectives. "Feels responsive" is not an exit criterion. "p95 lift wait under 90 ticks across 30 simulated days" is.
Exactly one goal is in-progress at a time. No parallel goals.
Anything discovered mid-goal that is not in the goal goes to PARKING.md. It does not get built now.
PARK A HYPOTHESIS WITH ITS FALSIFICATION TEST ATTACHED. (Added 2026-08-09 by human ruling.) If the parked item is a guess about how the simulation behaves — not a feature, a belief — write down in the same entry what would confirm or refute it: the invocation, the reading, the comparison. It costs one extra sentence over parking a note, and it is what let G-013, G-017 and G-014a chain without any of them planning the next: G-013 parked "the engagement vector sums to the lodging budget" with its experiment, G-017's recording turned out to BE that experiment and returned positive, and G-014a then hit the knife-edge the hypothesis describes. A parked note is a reminder. A parked hypothesis with its test is a result waiting for a goal that happens to run it.
A criterion that uses a perceptual word — visibly, reads as, looks — needs a perceptual check, or the word must come out (ADR-0013). Since 2026-08-08 the perceptual check exists: record a run and watch it (§5 WATCH).

4.1 Ledger digests

(Added 2026-08-08 by human ruling — ADR-0013 §7.)

A NUMBER CARRIES FIVE SLOTS (CLAUDE.md rule 4, fifth added 2026-08-09 by human ruling): what it measured, over what workload, at what sample count, aggregated how, and UNDER WHAT REGIME. Regime caused three findings in G-020 alone and in each the number was wrong because nobody said which machine state produced it.

ANY COUNT IN A DIGEST NAMES ITS UNIT (added 2026-08-09, human). Gates, tests, files and findings are FOUR DIFFERENT DENOMINATORS and the digests have mixed them — the unreliable-gate count read 1 in one record and 2 in another purely because nobody had said which noun it counted. THIS IS THE SECOND TIME A MEASUREMENT DISAGREEMENT HERE RESOLVED TO A DEFINITION RATHER THAN A DEFECT; G-016's absolutes-versus-ratios was the first.

Each of GOALS.md, DECISIONS.md, JOURNAL.md and PARKING.md carries a rolling digest at the top under a fixed heading. It is REWRITTEN at every REFLECT and never appended to.

SCORED AT M2 EXIT AND AMENDED BY THE HUMAN (2026-08-10). The digest is KEPT: it caught the stale-state drift it was built for, and it is the first thing a reader reads. What failed was two hand-maintained numbers, and they are treated differently.

THE FIFTEEN-LINE CAP IS DROPPED. It failed four times in three days, and the fourth failure was the orchestrator's own, one REFLECT after recording the third as the argument for automating it. Automating it was the wrong remedy and the human named why: ENFORCING A LINE COUNT IS ADDING A CHECK TO SATISFY A NUMBER RATHER THAN TO PIN BEHAVIOUR, which §9 already lists as an anti-pattern. An unenforced arbitrary number is a superstition with a heading; AN ENFORCED ARBITRARY NUMBER IS A SUPERSTITION WITH CI ACCESS, WHICH IS WORSE. Keep digests short because a long one is not read, not because a check says so.

THE AS-OF STAMP IS AUTOMATED, AND IT GETS AN OWNER. One source, four files, and REFLECT fails if they disagree — mechanical, cheap, and high-value. It is a hard prerequisite of M3's first goal (§8) rather than a seeded obligation, BECAUSE THE SEEDED VERSION AT THE FOOT OF THIS SECTION ALREADY FAILED EXACTLY ONCE BY HAVING NO OWNER, and re-seeding it the same way would produce the same result. It carries: current schema version, current gate readings, live obligations owed by future goals, and open contradictions. The append-only history stays exactly as it is beneath it.

The reason: the four ledgers passed 2,800 lines and JOURNAL.md — which calls itself the memory that survives compaction — is a quarter of that. An ADR amendment has already spent a day filed under the wrong ADR.

AMENDED 2026-08-09, BECAUSE THE MECHANISM EXHIBITED THE FAILURE IT WAS BUILT TO PREVENT. At G-020a the four digests read: GOALS "G-015 done", JOURNAL "G-015 done", DECISIONS "as of 2026-08-08, after G-013" (five goals and two human ADRs stale), PARKING "G-018 in progress". THREE FILES, THREE DIFFERENT ANSWERS TO "WHERE ARE WE" — a reader scanning for live state gets a confident, wrong answer, which is the exact defect §4.1 exists to close.

AN ADR AMENDED TWICE WAS WRONG, NOT INCOMPLETE (ruled 2026-08-14, human — ADR-0043 §3). An amendment to an amendment is a decision nobody can hold in one piece, and this project already applies the correct rule to code: repair the class, not the instance. AN ADR REACHING A SECOND AMENDMENT IS SUPERSEDED BY A SINGLE RESTATED ADR saying what is true now, WITH THE ORIGINALS STRUCK AND POINTING FORWARD — not edited. Struck, per this file's own rule that an artefact describing the past must not track the present (ADR-0008).

The cause is precise and worth naming: §4.1 says REWRITTEN EVERY REFLECT, and what was happening was rewritten WHENEVER THAT FILE CHANGED. Those are not the same thing, and the difference is invisible until you read all four side by side.

SO: ALL FOUR DIGESTS CARRY A BYTE-IDENTICAL `*As of …*` LINE, REWRITTEN IN ONE STEP. REFLECT is not complete until they agree. A digest whose as-of line disagrees with another's is a defect of the same standing as a stale figure in a comment — and it is mechanically checkable, so it should be checked rather than trusted. Seeded as an obligation on the next goal that owns a ledger-shaped check; until then the orchestrator re-stamps all four in one edit and says so at REFLECT.

(Recorded because it is instructive: the first attempt at this re-stamp missed PARKING.md, because its as-of line wraps onto a second line and a line-anchored pattern did not match it. The mechanism needed a mechanical check within one minute of being repaired by hand.)
5. The goal loop
5.1 State machine
SELECT -> PLAN -> [critic sees plan, §5.6] -> BUILD -> CRITIQUE -> RESPOND -> VERIFY -> WATCH -> COMMIT -> REFLECT -> SELECT
                    ^                                              |
                    +------------------ (failures) ----------------+

CRITIQUE is a SWEEP and is budgeted (§5.2, three). Verifying that a fix discharges a finding is NOT a sweep and is not budgeted (§7.1).

SELECT — Take the top unblocked goal from GOALS.md. Restate it in one sentence and name its exit commands.

PLAN — Spawn the matching builder agent in plan mode. It produces a short plan: files to touch, data shapes, tests it will write first. You review the plan against §2 and the goal's out-of-scope list. Reject and re-plan if it exceeds scope. Then §5.6: the matched critic sees the plan and may object to its size before a line is written.

BUILD — Builder implements. Tests first where practical. Builder runs the gates itself before declaring ready.

CRITIQUE — Spawn the matched critic agent (§6) with: the goal, the diff, and read-only tool access. It returns findings in the §7 format. It cannot edit anything.

RESPOND — Builder receives the findings and must answer every BLOCKER and MAJOR, either fixed with a reference to the change, or rejected with a reason. Rejections are appended to DECISIONS.md with the reasoning. MINOR and NIT are optional; log them and move on.

VERIFY — You, the orchestrator, run every exit command and every §2 gate yourself. You do not accept an agent's report that tests pass. Run them.

WATCH — (Added 2026-08-08 by human ruling, ADR-0013 §2.) For any goal that changes guest, room or economy behaviour, record a run and watch it. Append to JOURNAL.md what looked wrong, or that nothing did. A goal that changes behaviour and produces no visual observation has skipped a step. The instrument is the replay viewer (G-017); until it lands, a goal that owes a WATCH records the debt in its block and discharges it retroactively once the viewer exists.

COMMIT — Conventional commit referencing the goal ID. One goal, one commit (or one squashed branch).

REFLECT — Append to JOURNAL.md: what changed, what the critic caught, what got parked, whether any invariant nearly broke. Two or three lines. Score any seam prediction from §5.5. Then rewrite the digest at the top of each of the four ledgers (§4.1), update GOALS.md, and select the next goal.

5.5 The seam rule — declining a split is a prediction, and it gets scored

(Added 2026-08-08 by human ruling, after G-013.)

When a builder offers a seam at PLAN — "this is a fat goal, here is where it splits" — the orchestrator either takes it, or records in the goal block what not taking it is expected to cost. A reflex is not a decision; a prediction is.

The prediction is DISCHARGED AT REFLECT: did declining the seam cost what you said it would? A prediction that is never scored is prose, and an artefact that accumulates without ever being wrong is worse than no artefact.

G-013 is the case that produced this rule. Its builder wrote "this is the fattest goal yet" and named the seam; the orchestrator ruled it whole in one line with no cost attached. The actual cost was nine instances of one defect class and three full critique rounds. Written as a prediction it would have read "expected cost: more checkable surface than one critic pass can vet" — and would have been legibly wrong.

5.6 The critic sees the plan

(Added 2026-08-08 by human ruling, after G-013.)

The agent that bears the cost of a fat goal is the CRITIC, who has to sweep it — and until now it had no voice until after the code existed. Before BUILD, the matched critic sees the plan and may raise one objection: THIS SCOPE IS TOO LARGE TO SWEEP IN THE ROUND BUDGET, and here is the seam.

Scope only. Not design, not approach, not test strategy — those are the orchestrator's at PLAN review and the critic's after BUILD. This is the cheapest possible moment to split, and it puts the objection where the incentive already is.


AND ONE STANDING QUESTION AT REFLECT, POINTED SIDEWAYS RATHER THAN BACKWARDS (ruled 2026-08-16, human -- ADR-0048 §1): DOES ANYTHING ELSE HERE HAVE THIS PROBLEM?

**SCOPE, NAMED (ADR-0086): pointed at GATES AND SCANNERS.** It was added after `assertSubject` and inherited that goal's scope; **nobody pointed it at `DECISIONS.md`, and the ADR-staleness class went unfound for the life of the project.** **A question whose scope is IMPLICIT reads as universal and behaves as narrow** — which is the `check:status` failure in a different costume. **Re-scoping it is a deliberate act and must be written here.**

§5.8 asks where else the defect just FIXED lives. This asks where else the fix just WRITTEN is ALREADY NEEDED -- and it names a class the register did not have: A RULE DISCOVERED INSIDE ONE GATE AND LEFT WHERE IT WAS FOUND. Not a missing rule. A SOLVED PROBLEM THAT NEVER PROPAGATED.

THE EVIDENCE IS THAT IT HAPPENED AND NOBODY NOTICED FOR EIGHT GOALS. check:ladder has refused a dead root since G-030, with a registered test, counting PER ROOT because a single total stays comfortably non-zero while one root is misspelt and contributes nothing. That is a better guard than the shared one written eight goals later to fill a gap that gate did not have -- and the shared one was ordered on the claim that NO scanner had a proof-of-subject, asserted from memory about the repo's own contents. The wrapping pre-empted check:ladder's message and turned its own test red, which is the only reason any of this was found.

ONE LINE AT REFLECT, ANSWERED IN PROSE. It does not get a scanner: automating this question would be ADR-0046 §1's mistake in miniature -- a check bolted onto the place where judgement was the point.
5.8 A FIX ON A KNOWN CLASS MUST STATE WHERE ELSE THAT CLASS LIVES

(Added 2026-08-09 by human ruling.)

When a fix lands on an instance of a class this project already names — a vacuous check, an unsourced number, a claim nothing pins, a criterion that cannot fail — THE SAME COMMIT MUST STATE WHERE ELSE THAT CLASS LIVES AND WHETHER IT WAS CHECKED. Not a promise to check. A STATED RESULT: "criterion 1 checked, clean" or "criterion 1 carries it, fixing".

That converts a reflex into something falsifiable at REFLECT, exactly as §5.5's seam prediction does.

THE GUARD, BECAUSE "CHECKED, CLEAN" IS ITSELF A CLAIM (human, 2026-08-09): NAME WHERE WAS CHECKED, NOT ONLY THAT IT WAS. A location can be re-inspected; an assurance cannot. If §5.8 starts producing unfalsifiable clean reports it becomes the thing it was built to catch — which is this project's most repeated failure and the reason ADR-0007 carries five amendments: each one repaired a costume rather than the thing wearing it. §5.8 is the first rule here that operates on the class rather than the instance, and that is exactly why it must not be allowed to inspect nothing.

THE CASE THAT PRODUCED IT: at G-020a the orchestrator corrected exit criterion 2 for naming an unmeetable command, and LEFT CRITERION 1 CARRYING THE IDENTICAL DEFECT EIGHT LINES AWAY. It was found two rounds later by the critic. The rule was known and was applied outward and not inward — the same shape as the orchestrator exempting itself from CLAUDE.md rule 5. This rule would have caught it for free, because the twin was eight lines from the fix.

5.7 THE ORCHESTRATOR'S OWN CLAIMS ARE IN SCOPE FOR THE GOAL'S CRITIC

(Added 2026-08-09 by human ruling.)

A goal's critic reviews the diff AND the orchestrator's statements about it: the goal block, the exit criteria, the digests, the rulings written into DECISIONS.md, and anything the orchestrator asserted while dispatching. These are not a separate courtesy pass and they are not out of bounds. They are part of the evidence the goal rests on, and a critic that finds one is doing its job rather than exceeding it.

Why it is a rule now: FIVE orchestrator-side errors have been caught by agents doing UNBUDGETED work at nobody's instruction — a fabricated section 10 citation; a "five of six" count three records deny; a 12.5% cross-check that was one dataset and its own superset; a test total that was arithmetic across two moments; and G-020 seeded with "M2 does not exit without it" while neither the exit block nor the digest carried it, found by sim-critic reading outside its assigned diff.

Five catches on goodwill is a mechanism that exists but is not acknowledged. The cheapest thing to do is stop pretending it is luck. A critic may not be blamed for spending a round on an orchestrator claim, and an orchestrator claim that turns out to be wrong is a finding of the same standing as one in the code.

5.2 Round budget

Maximum 3 critique rounds per goal. If a BLOCKER survives round 3, stop. Do not keep grinding.

A goal may only close on a DRY critic report (§7). A FIXED report consumes a round and the critic goes again. This costs rounds and is meant to.

5.3 Anti-ping-pong

If builder and critic disagree twice on the same point, that is a design question, not an implementation question. You adjudicate once, record the decision in DECISIONS.md, and both agents treat it as settled.

5.4 Escalation

Write to ESCALATIONS.md and stop the loop when any of these is true:

A BLOCKER survives the round budget.
An invariant in §2 cannot be satisfied without changing the invariant.
The goal turns out to depend on an unbuilt goal.
A milestone's exit criteria are met and need human sign-off.
Something is fun-critical and cannot be resolved by test — that is a human call, not an agent call.
6. Agent roster

Define these in .claude/agents/*.md. The tool grants are the enforcement mechanism, not decoration: critics have no write tools. A critic that can edit code stops producing signal, because it silently fixes what it finds instead of reporting it.

Builder	Critic	Domain
sim-engineer	sim-critic	Tick scheduler, world model, grid, rooms, save/load, determinism
ai-engineer	ai-critic	Guest and staff agents, utility scoring, provider registry, pathing, lift queueing
economy-engineer	balance-critic	Ledger, pricing, demand, reputation, wages, upkeep
render-engineer	render-critic	Pixi layer, camera, sprites, HUD, input-to-command mapping

Builder frontmatter shape:

yaml
---
name: ai-engineer
description: Implements guest and staff behaviour in packages/sim. Use for
  needs, utility scoring, provider selection, pathfinding and lift queueing.
tools: Read, Write, Edit, Bash, Grep, Glob
---

Critic frontmatter shape — note the tool list:

yaml
---
name: ai-critic
description: Reviews agent-behaviour changes. Read-only. Produces findings,
  never edits.
tools: Read, Grep, Glob, Bash
---

(Bash stays on the critic so it can run tests and simulations. Verify the exact frontmatter keys against /agents in your installed version before writing the files.)

Each critic's system prompt must include:

The same domain knowledge as its builder. A critic that knows less than the builder produces noise.
Its specific failure catalogue (§6.1).
The finding format (§7).
This line, verbatim: "If you find no BLOCKER or MAJOR issues, say so plainly and stop. Do not manufacture MINOR findings to justify the turn."
6.1 Failure catalogues

Give each critic its own list to hunt against. These are the things that actually kill hobby sims.

sim-critic — render or engine types leaking into packages/sim; wall-clock time or unseeded randomness in tick logic; state mutated outside a tick boundary; save omitting a field that turns out to matter (check every new field is round-tripped); tick cost growing worse than linear in agent count; floating-point accumulation that will diverge across platforms.

ai-critic — needs that can never be satisfied, producing guaranteed unhappiness; agents thrashing between two providers; reservation leaks where a facility is held by a despawned guest; pathfinding that silently falls back to teleporting; livelock at lifts; behaviour that is correct but reads as stupid to a watching player, which is a real defect in this genre.

(Amended 2026-08-08, ADR-0013 §3.) The "reads as stupid to a watching player" finding now REQUIRES a frame reference: a recording, a tick number, and what it shows. From bootstrap to G-013 there was no watching player and no way to become one, so that mandate was unfalsifiable — the exact defect class ADR-0007 names, sitting inside the critic prompt meant to hunt it. From G-017 it is a finding like any other and subject to §7's citation rule. If you cannot cite a frame, you do not have this finding; say so and stop.

balance-critic — dominant strategies (one room type strictly better than all others); degenerate pricing exploits; runaway or unrecoverable economies; nothing meaningful to spend money on past hour two. This critic has a standing mandate to run pnpm sim:run --days 1000 across a spread of seeds and report the distribution of outcomes, not a single run.

render-critic — render code holding authoritative state instead of reading it; input handlers mutating the sim directly rather than dispatching commands; frame-rate-dependent movement; UI that cannot express a state the sim can reach.

7. Finding format

Critics return only this. No prose preamble, no summary paragraph.

[BLOCKER] packages/sim/src/tick.ts:84
  Guest need decay uses Date.now() as the delta source. Breaks I2 and makes
  the sim frame-rate dependent.
  Suggested direction: take dt from the tick scheduler.

[MAJOR] packages/sim/src/providers.ts:41
  Reservation is taken before the path is validated, so an unreachable
  facility is held indefinitely. Repro: pnpm test -- providers.unreachable

[MINOR] packages/content/rooms.json
  `single_room` and `standard_room` have identical stats. Probably unintended.

Severity definitions:

BLOCKER — breaks an invariant, corrupts saves, or makes the goal's exit criteria unmeetable. Must be fixed.
MAJOR — a correctness or design flaw that will be expensive to fix later. Must be answered, may be rejected with reasoning.
MINOR — a real but cheap issue. Log it.
NIT — style and naming. Do not spend a round on these.

Every finding must cite file:line and, where possible, a reproduction command. A finding without a location is not a finding.

7.1 How a critic closes — DRY, OPEN or UNSWEPT

(Added 2026-08-08 by human ruling — ADR-0013 §6. Amended the same day, also by human ruling, after the first goal to run the rule exposed the two-state version as wrong.)

Every critic's final report must close with exactly one of these three, stated explicitly:

DRY — the diff is swept and there are no findings at any severity.
OPEN — the diff is swept and findings are outstanding.
UNSWEPT — the critic has not exhausted the diff.

A goal still closes only on DRY.

UNSWEPT at round 3 escalates, and the answer is still splitting the goal. That consequence is untouched: a diff a critic cannot exhaust in three passes is too big.

SWEEPS ARE BUDGETED. VERIFICATIONS ARE NOT. The two-state version made a round do double duty — it meant both "a sweep of the diff" and "a fix-verify cycle" — and §5.2's budget of 3 was only ever meant to bound the first. A verification pass examines whether a specific fix discharges a specific finding, and looks at the fix's own diff. It does not consume budget.

SWEEP 3 IS A SCANNER BY DEFAULT (RULED 2026-08-14, HUMAN — ADR-0043 §1, calling ADR-0032 §4's notice). That notice was written with a condition: if the no-derived-figures rule landed and sweep 3 still returned mostly unpinned-claim findings, the third sweep is buying prose quality at a code-review price and should become a scanner. THE CONDITION HAS BEEN MET THREE TIMES — G-028a, G-028b and G-032a each closed on verifications returning UNPINNED-CLAIM findings only.

  WHAT CHANGES: the automatic third agent pass. WHAT DOES NOT: sweeps 1 and 2, and the plan review, which ADR-0032 §4 records as the cheapest round in the loop and which has killed two designs before a line of code existed.

  AN AGENT SWEEP 3 REMAINS AVAILABLE ON REQUEST: a critic that says at sweep 2 that it has diff left gets its third sweep. UNSWEPT at round 3 still escalates and splits the goal — §7.1's three states are unchanged.

  THE SCANNER OWES A PROOF-OF-BITE like every other scanner (M2 exit ruling), IN ADR-0040'S SHAPE: built from a normal string rather than a literal, and shown to bite on a CRLF tree. The last three scanner defects in this project were all predicate errors nobody could see.

  SCORED PREDICTION (human, recorded so it is falsifiable): if the scanner lands and goals still close on agent-found unpinned claims at the same rate, the class was not scanner-shaped and this notice was wrong. Score it at the third goal after it lands.

The guard that stops that becoming an unbounded loop wearing a new label: a verification pass that produces a NEW finding rather than a restatement converts to a sweep and consumes budget. So if a builder's fixes keep spawning findings, the budget burns and the goal escalates properly — which is the signal you would want anyway.

RULED 2026-08-09 (human) — THE TRIGGER IS SPLIT BY SUBJECT, because four firings showed the two cases are not the same animal.

  A PROSE finding on re-examination -> an UNPINNED-CLAIM ESCALATION. The remedy is to pin the claim in a test or delete it. NEVER a round, NEVER a split. Four firings say this belongs in the charter as a gate in its own right, and treating it as a budget matter was a category error: a claim nothing pins is not evidence that a diff is too big, it is evidence that a claim is not evidence.

  A CODE finding on re-examination -> the budget conversion stands EXACTLY as written. That is the original signal — fixes spawning defects — and it is the one that genuinely indicates a diff nobody can hold in one head.

  THE CODE ARM IS LIVE, WITH ONE OBSERVATION — G-020a, 2026-08-09 (a workflow-slice check that failed OPEN on a renamed boundary). Five firings: four prose, one code. THE RETIREMENT CLAUSE IS DROPPED, its condition having been met. Small sample; treat the code arm as live rather than proven.

  SEVENTH FIRING — G-027b θ-b1, 2026-08-13. PROSE. Seven firings: SIX PROSE, ONE CODE. The verification returned two MINORs, both prose — one an undischarged part of an earlier finding, one genuinely new — and no code finding arose, so the goal neither escalated nor consumed a round. THIRD CONSECUTIVE CORRECT CALL BY THE SPLIT. And note what the prose arm caught this time, because it bears on the rename question below: an `it(...)` TITLE stating a superseded pair where vitest prints it, and an assertion silently unpinned by a rewrite. NEITHER IS A STYLE COMPLAINT. The 2026-08-08 prediction's condition is now met twice over and remains FLAGGED, UNACTED-ON — but the evidence has shifted: what the arm keeps catching is claims that have lost their pin, not prose that reads badly, and "unpinned-claim escalation" is already the name the ruling gave it. THE GUARD MAY BE CORRECTLY SCOPED AND MERELY MIS-NICKNAMED "PROSE" IN EVERY DISCUSSION OF IT, INCLUDING THIS ONE.

  SIXTH FIRING — G-027b θ-a, 2026-08-13. PROSE. Six firings: FIVE PROSE, ONE CODE. The verification pass returned two MAJORs and four MINORs, every one of them prose, and the goal neither escalated nor consumed a round — the second time the prose arm has done exactly what it was ruled to do, after G-020a. THE SPLIT IS NOW EARNING ITS KEEP RATHER THAN MERELY NOT BREAKING: under the pre-split rule, θ-a would have escalated and been split on six findings, none of which was a defect in its code.

  AND THE ORIGINAL PREDICTION'S CONDITION IS NOW ARGUABLY MET, which is recorded here because a scored prediction that quietly stops being checked is the thing §5.5 forbids. The 2026-08-08 prediction reads: "If the next several firings are also prose, then the guard is a prose-quality instrument wearing a critique-budget costume, and it should be RENAMED AND RE-SCOPED rather than left to accumulate a reputation it did not earn." Five of six is several. THE ORCHESTRATOR IS NOT ACTING ON IT UNILATERALLY — renaming a charter mechanism is a human call, and the prediction says "should", not "does". IT IS FLAGGED TO THE HUMAN AND THE LOOP CONTINUES; this is not an ESCALATIONS entry, because nothing is blocked.

  THE COUNTER-EVIDENCE, STATED SO THE HUMAN RULES ON THE WHOLE PICTURE: two of θ-a's six prose findings were FALSE STATEMENTS rather than stale ones — viewer.js:71 asserted the shipped JSON carries a field it has never carried, and apps/game/src/view/guest.ts:292 named a symbol that the same pass had renamed 179 lines above. A prose-quality instrument that catches false claims about content and broken references to renamed symbols is not obviously misnamed; it may be that "prose" is the wrong word for the arm rather than the wrong scope for the guard.

AND THE PROSE ARM WORKED EXACTLY AS RULED, WHICH IS WORTH RECORDING AS MORE THAN "DID NOT BREAK": G-020a's final pass returned a BLOCKER and five MAJORs, ALL PROSE, and the goal CLOSED WITHOUT ESCALATING AND WITHOUT CONSUMING A ROUND. Under the pre-split rule those six findings would have converted, spent the budget and escalated a goal whose code was clean.

THE ORIGINAL PREDICTION, KEPT BECAUSE IT WAS SCORED AND THAT IS THE POINT (human, 2026-08-08). It has fired exactly once — on G-013, the goal that produced it, and on PROSE rather than on code. The registry it was guarding needed no correctness fix at any point. If the next several firings are also prose, then the guard is a prose-quality instrument wearing a critique-budget costume, and it should be RENAMED AND RE-SCOPED rather than left to accumulate a reputation it did not earn. Record each firing with its subject: code or prose. This prediction is written down now so it can be wrong later — an unscored prediction is prose, which is the same rule §5.5 applies to seams.

Why the three states: thirteen goals ran mostly at 1/3 rounds with zero BLOCKERs, and the one goal that ran to 3/3 produced the best critique in the project. "I fixed what I found" and "there is nothing left to find" are different claims, and the loop had been treating them as the same one. G-013 then showed that "there are findings left" and "there is diff left" are also different claims — its round-3 critic swept the whole diff and closed with one finding open, which the two-state version could only express as FIXED, whose prescribed remedy (split the goal) would have solved a problem that did not exist.

Additionally: any goal that is the LAST IN A MILESTONE gets a second critic from a different pair in its final round. Precedent — G-008 ran sim-critic then balance-critic, and the second pass found the 107-million-penny sweep.

THE TWO CRITICS OF A FINAL ROUND ARE ONE ROUND, NOT TWO (ruled 2026-08-10, G-019). Both passes charge the budget once between them, however they are scheduled - in parallel, or one after the other, or one converting from a verification while the other sweeps fresh. The rule says a second critic is required IN the final round; a round that contains two critics is still a round. Charging two would make the safeguard cost double the budget of the goals that do not use it, which would price the rule out at exactly the boundary it exists to protect. What is NOT relaxed: a finding either of them raises is a finding, and the goal still closes only on DRY from both.


8. Milestones

Do not start a milestone until the previous one's gates are green and the human has signed off.

M0 — Walking skeleton. One room type, one guest, one need, one day cycle, money in and money out. Headless only, no renderer at all. All six invariant gates green and wired into CI. This is the most important milestone and the one most likely to be rushed. It should be playable-but-boring, and it should be finished before anything is drawn on screen.

M1 — Structure. Multi-floor grid, build and demolish commands, room validity rules (enclosed, has a door, has required items), construction cost.

M2 — Needs. Full need vector, item-based provider registry, utility scoring, satisfaction over ticks, patience drain, reviews. Guests visibly succeed and fail. ("Visibly" is discharged by G-017's replay viewer and a WATCH observation in JOURNAL.md, not by the review distribution alone — ADR-0013.)

EVERY SCANNER GATE OWES A PROOF-OF-BITE TEST (ruled 2026-08-10 by the human, generalising G-019's third instance). A gate that decides by matching source text is only as good as its predicate, and three goals running produced the same silently-degraded predicate: a backslash consumed by a template literal, turning a word boundary into a two-letter character class. All three sat inside scanners - a purity check, a boundary fence, a partition guard - and all three changed no answer on the day they shipped.

THE STRUCTURAL POINT, WHICH IS WHY THIS IS A RULE AND NOT A NOTE: the gates check everything, and nothing checks the gates except proof-of-bite, which was done BY HAND AT BOOTSTRAP and never made standing. A scanner whose predicate has quietly stopped matching reports a clean tree forever, and it reports it most confidently about the thing it was built to catch.

It is cheap, because the technique is already in the repo three times over - `check-tripwire.mjs`, `check-measure.mjs` and `viewer.readonly.test.ts` all copy a gate, break the copy in one named way, and assert it goes red. A proof must fail for the RIGHT reason: G-019 shipped one that removed the scanned subject rather than the mention, so a predicate hard-coded to `false` satisfied it.

M3 — Circulation. Stairs and lifts as queued shared resources. Vertical pathing. Wait time as a first-class satisfaction input. This is where the genre's difficulty actually lives.

  M3 DOES CIRCULATION. THE INSTRUMENT TRACK IS CAPPED (ruled 2026-08-14, human — ADR-0043 §2). G-032b and G-032c finish; after them M3 runs circulation goals only, to G-026. ANY INSTRUMENT DEBT DISCOVERED BETWEEN HERE AND M3 EXIT IS WRITTEN TO AN M3-EXIT GOAL IN G-022'S SHAPE — not built when found. G-022's precedent stands; what moves is where it sits, at the exit rather than the entrance.

  THE EXCEPTION, AND IT IS BOUNDED: an instrument debt that makes a GATE STOP BEING EVIDENCE is not deferrable. ADR-0040 is exactly that case — a ruled-red row carrying a second, silent defect that nothing else would have found. If that shape recurs, ESCALATE RATHER THAN DEFER, AND SAY WHICH OF THE TWO IT IS: a gate that has stopped being evidence, or a debt that merely makes an instrument less good. Naming which, before any work starts, is the burden.

  WHY THE CAP EXISTS: M3 had one goal done and it was an instrument goal; the next two named were instrument goals; and three ADRs written in one day were all real findings and none was circulation. THE LOOP'S OUTPUT HAD SHIFTED FROM THE GAME TO THE LOOP, AND NO RULE NOTICED, BECAUSE EVERY INDIVIDUAL STEP WAS JUSTIFIED.

M4 — Economy. Nightly settlement, staff hiring and wages, upkeep and decay, reputation feeding demand, room pricing. Balance critic runs long simulations and the results are reviewed.

M3 HARD PREREQUISITES, TWO, RULED BY THE HUMAN AT M2 EXIT (2026-08-10). Neither held M2 open — M2's statement is about needs, and both of these are INSTRUMENT DEBTS. Both land on M3's FIRST goal, in the same shape as scenario capital for M4.

(1) I4's DEFECT B, REPAIRED — and the `--maxWorkers` stopgap expires with it. One gate carrying one defect clears the stated bar, so exit was permissible. But B is a LOAD-SENSITIVE flake and M3 is pathfinding and queued shared resources — the milestone most likely to add load. Carrying a load-sensitive unreliable gate into the milestone that stresses it is BAD SEQUENCING RATHER THAN ACCEPTABLE RISK. The cap was approved as provisional and has now had a milestone's worth of inertia.

(2) CI ACTUALLY RUN, GREEN, ON A REAL REMOTE, BEFORE M3 OPENS. This is the larger of the two and the human ranks it THE LARGEST UNVERIFIED CLAIM IN THE PROJECT. `JOURNAL.md`'s bootstrap entry records the gates as wired into a three-OS matrix; THAT MATRIX HAS NEVER EXECUTED. A claim has sat in the permanent record for nineteen goals, attested at a human sign-off, having inspected nothing — ADR-0007's defect class AT THE INFRASTRUCTURE LAYER, underneath everything this project has been rigorous about.

THE SPECIFIC EXPOSURE: I2 says byte-identical ON EVERY PLATFORM and has only ever been tested on one. It is the load-bearing invariant, the tripwire for the whole design, and ITS MOST DEMANDING CLAUSE IS THE UNTESTED ONE. Add a timing-derived bound now shipping inside `pnpm verify`, calibrated on a single machine, and M3 would be the first milestone where a cross-platform surprise costs real rework. If the first matrix run is red, that is the cheapest it will ever be to find out.

M4 HARD PREREQUISITE (ADR-0013 §5): the scenario-capital mechanism lands before the first M4 goal starts. --rooms N seeds stock that is cash at the refund rate — --rooms 3 carries 375,000p against a 500,000p starting constant — and every balance sweep in this project used that flag. Tuning demand and pricing against a 75%-inflated opening balance is how a whole milestone's evidence base goes bad quietly.

M5 — Render. Pixi cross-section view, camera, build tools, HUD, speed controls, save/load UI. The first playable build ships PLACEHOLDER ART — flat coloured shapes with clear silhouettes — and real art is a separate track that replaces them without touching the simulation (ADR-0014, decided 2026-08-08 so M5 neither relitigates it nor waits on it).

M6 — Content and feel. Room and item variety, guest archetypes, notifications, sound hooks, tutorial. Driven by playtest findings rather than a feature list.

9. Stop conditions and anti-patterns

THE MILESTONE QUESTION (RULED 2026-08-16, HUMAN — ADR-0046 §1). At each milestone exit, before sign-off, the human is asked ONE question that is not about the code:

  DOES THE THING ON SCREEN STILL LOOK LIKE THE GAME WE MEANT TO BUILD?

WHY IT IS HERE. A charter decision that no goal can question is not settled — IT IS UNEXAMINED. §1's projection was wrong from before the first line of code and survived thirty-two goals, six invariants, thirteen gates and two three-platform determinism proofs, because every one of those instruments takes the charter as given. ADR-0013 said a perceptual criterion needs a perceptual check; this is the same argument one level up, aimed at the charter rather than at a criterion.

ONE QUESTION, AT EXIT, ANSWERED BY THE HUMAN. If it grows a scanner, a rubric or a checklist, it has been misunderstood and the growth is itself the anti-pattern.

AND A BEHAVIOURAL GOAL THAT SHIPS WITH NO INSTRUMENT TO WATCH IT IS AN ESCALATION, NOT A RECORDED DEBT (ADR-0046 §7). ADR-0023 made apps/game the surface of record; when the surface of record is invalid, the next behavioural goal has no WATCH at all, which is precisely the state ADR-0013 was written to end.

Halt and escalate if you catch any of these:

You are writing feature code yourself instead of orchestrating.
A critic has produced a MINOR-only report three goals running — the critic prompt is too weak, fix it before continuing.
An invariant gate has been modified to make a test pass. Changing an invariant is a human decision, always.
Test coverage is being added to satisfy a number rather than to pin behaviour.
PARKING.md has stopped growing. That means scope is leaking into goals instead of being deferred.
Work has started on the render layer before M0 is signed off.
A goal has exceeded its round budget twice under different framings — the goal is wrong, not the implementation.
A criterion is being verified by an agent's judgement of something nobody can observe. (ADR-0013.)
The replay viewer is acquiring features, a public API, or defenders. Delete it rather than defend it.
A gate threshold is being cited that nobody can trace to a stated requirement (§2.1).
10. Bootstrap

First session, in order:

Scaffold the pnpm workspace per §3. Strict TypeScript. Vitest configured.
Write the six invariant gates from §2 before any game code exists. They should all pass trivially against an empty sim. Wire them into a single pnpm verify command and into CI.
Write .claude/agents/ for the eight agents in §6, each with its failure catalogue and the finding format.
Create GOALS.md seeded with the M0 goals, DECISIONS.md, JOURNAL.md, PARKING.md, ESCALATIONS.md — all with a one-line header explaining what they are for.
Write a CLAUDE.md that points at this file and states the invariants in short form, so they survive context compaction.
Commit. Then enter the loop at §5 SELECT.

Do not write a single line of simulation logic until steps 1 and 2 are done and pnpm verify is green.