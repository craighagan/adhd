---
name: adhd
description: Parallel divergent ideation for coding agents. Names the textbook answers and bans them, spawns N isolated branches under different cognitive frames (regulator, biology, speedrunner, pre-mortem, detective, etymologist, $0 budget) plus a random-stimulus branch and a questions-only branch, scores, clusters, breeds cross-cluster hybrids, prunes traps, and deepens top survivors. Use on /adhd, "ADHD mode", brainstorm/ideate intents, or open-ended design, architecture, naming, API/SDK surface, and fuzzy-debugging decisions. Skip for syntax, lookups, bugs with known root cause, or closed phrasing ("quick", "standard", "canonical", "textbook"). Full pre-flight gate is in the skill body.
license: MIT
---

# ADHD

Stop picking the textbook answer. The first three answers the model would
give are the answers a senior engineer would give in thirty seconds.
Correct. Forgettable. The interesting answers live past number three, in
the awkward middle nobody walks into. This skill makes the model walk
there.

## Pre-flight (run before Phase 0)

This skill is expensive. About 17 Agent calls, 45 to 120 seconds wall clock,
8 to 15x a single answer. Do not pay that cost when a direct answer is
better. Run this gate before Phase 0.

**Step 1. Explicit invocation check.**

If the user typed `/adhd` or explicitly asked for ADHD mode, "use the
adhd skill", or "run ADHD on this", **SKIP the rest of this section and go
straight to Phase 0**. The user opted in. Do not second-guess.

**Step 2. Self-judge (only if Step 1 did not match).**

Ask yourself three questions. If the answer to any is no, ABORT.

1. **Open-ended?** Would a senior engineer give multiple viable answers
   here, or is there one canonical answer? If canonical, abort.
2. **High-stakes?** Is the cost of the obvious answer being wrong actually
   high? Architecture decisions, public API surfaces, naming a real
   product, fuzzy bugs with no known root cause, schema design = yes.
   Side project at 11pm = no.
3. **Open phrasing?** Did the user avoid words like "quick", "standard",
   "canonical", "textbook", "just", "one-line"? If they used any of those,
   they want the direct answer. Abort.

If all three checks pass, proceed to Phase 0.

If any fails, ABORT and answer the question directly. Optionally append
one sentence: *"If you want a wider exploration under parallel cognitive
frames with explicit trap detection, run `/adhd <your problem>`."*

## The loop

A short setup pass, then two strict phases. Mixing the two phases kills
idea quality, because the critic strangles the generator.

### Phase 0 — Name the obvious (one cheap call)

Before any branch runs, make ONE Agent call:

> List the 3 to 5 answers a competent senior engineer gives to this
> problem in the first thirty seconds: the defaults, the well-known
> patterns, the first page of search results. One short phrase each.
> JSON array of strings only.

Keep the result. It is the **banlist**. "The first three obvious answers
are banned" is unenforceable when every branch guesses a different three;
a named list is enforceable, and it gives the scorer a concrete anchor
for novelty.

### Phase 1 — Diverge (no critic)

For the problem P:

1. Pick 5 cognitive frames from the tables below. Pick for **posture
   coverage**: one adversarial, one naive, one transplant, one operator,
   one extreme or constraint. Five transplants from five domains surface
   the same shape of idea; five postures surface five shapes. Bias toward
   engineering tags when the problem is code-shaped. Always include at
   least one wild frame.

2. Add two synthetic branches on top of the five:
   - **Random stimulus.** Pick a concrete noun at random (lighthouse,
     beehive, canal lock, sourdough starter, air traffic controller).
     The branch must connect every idea to a specific mechanism or failure
     mode of that thing. Curated frames push into known corners; a random
     noun pushes into one nobody curated, and never the same one twice.
   - **Reframing questions.** This branch outputs only questions, each one
     a reframe of the problem: an unstated assumption, a missing
     stakeholder, a different unit of analysis, the larger problem this is
     a symptom of. No solutions. Problem-finding is upstream of
     idea-finding.

3. Spawn 7 **parallel** Agent/Task tool calls. One per frame. Each Agent
   gets only:
   - the problem P
   - any context the user provided
   - the banlist from Phase 0
   - the chosen frame's vantage prompt
   - a system instruction that forbids evaluation

   The exact instruction to give each idea branch:

   > You are in DIVERGENT mode. You are a generator, not a critic.
   > Generate 6 short distinct ideas under this frame. Each idea is one
   > phrase or one sentence. Do not evaluate. Do not rank. Do not hedge.
   > BANNED: the following answers and their minor variations — the reader
   > already has them: [banlist]. Push past them into the awkward middle.
   > Output a JSON array only. No prose before or after.
   > `[{"text": "...", "rationale": "..."}, ...]`

   For the random-stimulus branch, add: *"Every idea must borrow a
   specific mechanism, property, role, or failure mode of a [noun] and
   apply it literally. If an idea would work without the [noun], it does
   not belong."*

   For the questions branch, replace the instruction with:

   > You are in QUESTION mode. Output 6 questions, one sentence each,
   > ending in "?". Each question, if answered, would change what gets
   > built. No solutions. No "have you considered X?" where X is a
   > solution. JSON array only.

4. **Critical invariant.** The Agent calls must be parallel and isolated.
   Do NOT serialize them. Do NOT pass one branch's output as context to
   another. Branches that see each other anchor each other and the whole
   method collapses to a wider single thought.

### Phase 2 — Focus (critic on)

After all branches return:

1. **Score.** Rate each idea on three axes 0 to 10: novelty (distance from
   the Phase 0 banlist; an idea that restates or lightly varies a banned
   item scores at most 2), viability (could it actually ship; for a
   question, could answering it change the design), fit (does it address
   the stated problem). For any idea that looks attractive but is a trap
   (hidden cost, false economy, will not scale, premature abstraction),
   flag it with a one-line reason.

2. **Cluster.** Group ideas into 3 to 6 clusters by their underlying angle,
   not by surface keywords. Label clusters by angle: "remove the server
   plays", "cache-shaped plays", "batched-window plays", "race-multiple-
   backends plays".

3. **Hybridize.** Take the best non-trap idea from each cluster as that
   cluster's representative. Pair representatives across clusters,
   strongest clusters first, 3 pairs. One Agent call per pair:

   > You are in HYBRID mode. Here are two ideas from different angles on
   > the same problem. Breed them. Produce 2 or 3 hybrids, one sentence
   > each. A hybrid is NOT "do both": it is a third thing that exists only
   > because both parents exist — one parent's mechanism applied to the
   > other's target, one parent fixing the other's weakness, a unit of
   > work that only makes sense when both are true. JSON array only.

   Score the hybrids with the same rubric. They compete for the shortlist
   on equal terms. Hybrids are the one class of idea no single frame can
   produce, and they are where the method most often beats the baseline.

4. **Optional second round (depth 2).** For high-stakes problems only.
   Take the provisional ★ pick (highest novelty among the viable
   shortlist). Spawn 3 fresh frames not used in round one, with the
   instruction *"DIRECTION (commit to it): [★]. Generate ideas INSIDE this
   direction: ways to realize it, extend it, or make it work where it
   looks like it should not."* Score the results and add them to the ★
   cluster. Doubles the diverge cost, so do not default to it.

5. **Deepen the top 3, spread across clusters.** Rank by weighted score
   (novelty 0.35 + viability 0.40 + fit 0.25), exclude traps. Pick
   greedily: highest score, but subtract 2 points from any idea whose
   cluster is already represented among the picks. Three deepened ideas
   should be three directions, not three siblings. For each, spawn one
   Agent call that produces:
   - a 4 to 8 sentence sketch of how the idea works
   - the load-bearing risk
   - the first concrete step a builder would take
   - 3 to 5 child ideas (variations, hybrids, unlocks)

   Deepen Agent instruction:

   > You are in FOCUS mode. Take one promising idea and connect dots.
   > Sketch how it would actually work in 4 to 8 sentences. Name the
   > load-bearing risk. Name the first concrete step a coder would take.
   > Then generate 3 to 5 sub-ideas that branch off (variations,
   > combinations with other domains, things this unlocks).
   > Output JSON only.

## Frames

Every frame has a **posture**: the stance it takes toward the problem,
independent of its vocabulary. Pick for posture coverage first, domain
second.

- adversarial: break it, exploit it, write its post-mortem
- naive: no priors, ignore convention
- transplant: borrow a mechanism from another field
- operator: a transform on the problem itself (invert, remove, dissolve)
- extreme: push a dimension to its limit (budget, time, scale)
- constraint: what must hold for this to be operable or provable
- forensic: reason from symptoms back to causes

### Core pack

| Frame | Vantage prompt | Posture | Tags |
|---|---|---|---|
| **hardware engineer** | You think in latency, memory layout, and physical constraints. Re-ask this as a hardware/firmware problem. What does the bus topology, cache, timing budget tell you? | transplant | code, wild |
| **regulator** | You audit systems for compliance and failure modes. What must be provable, traceable, or refusable here? | constraint | design, general |
| **10-year-old** | You are a curious 10 year old who has never seen software. Describe naive but unencumbered approaches. Ignore convention. | naive | general, wild |
| **competitor trying to break it** | You are a hostile competitor or attacker. Generate approaches that exploit, fail, or sabotage the obvious solution. Then invert into ideas. | adversarial | code, design |
| **biology** | Transplant a mechanism from biology (immune systems, neural plasticity, cell signaling, evolution, gut flora). Force-fit it onto this engineering problem. | transplant | code, wild |
| **logistics** | Steal mechanisms from logistics: queues, batching, just-in-time, hub-and-spoke, returns, last-mile. Apply them literally. | transplant | code, design |
| **game design** | Approach this as a game designer. What are the loops, rewards, friction, save-states, speedrun tricks? Treat the user as a player. | transplant | design, general |
| **markets** | Treat the problem as a market. Buyers, sellers, market-makers. What does an auction, a futures contract, a clearing house look like here? | transplant | design, wild |
| **inversion** | Ask the OPPOSITE question. If goal is X, brainstorm how to guarantee NOT X. Then negate each answer back. | operator | code, design, general |
| **extreme: $0 budget, 1 hour** | No money, no team, one hour. What is the crudest version that still does the load-bearing thing? | extreme | code, general |
| **extreme: infinite budget, 10 years** | Infinite compute, infinite engineers, a decade. What is the maximalist version? | extreme | design, wild |
| **remove the load-bearing assumption** | Name the thing everyone treats as fixed (framework, database, request-response model, network). Imagine it is gone. What is possible? | operator | code, design, wild |
| **speedrunner** | You are a speedrunner. Find glitches, skips, out-of-bounds tricks, frame-perfect shortcuts. What is the abusive-but-legal path? | adversarial | code, wild |
| **ant colony** | No central planner. Many dumb agents, local rules, pheromone trails. How does the problem solve itself emergently? | transplant | code, wild |
| **3am on-call** | You are the on-call engineer woken at 3am when this breaks. What design would let you not get paged? | constraint | code, design |

### Diagnosis pack (use for fuzzy debugging)

| Frame | Vantage prompt | Posture | Tags |
|---|---|---|---|
| **differential diagnostician** | Treat the problem as a presenting patient. List symptoms, generate competing hypotheses for the cause including the rare and embarrassing-to-miss ones. For each, name the single cheapest test that rules it OUT. Ideas are hypothesis + discriminating test, not treatments. | forensic | code, design |
| **detective** | Follow the evidence, not the theory. Which clue does NOT fit the obvious story? Who benefits from the current state? What would have to be true for the boring explanation to be wrong? Start from the anomalous detail and work backward. | forensic | code, general |
| **forensic accountant** | Every unit (byte, request, dollar, message, lock) must be accounted for from source to sink. Where does the ledger stop balancing? What leaves and never arrives, or arrives twice? Instrument or reconcile at exactly that point. | forensic | code, design |

### Language pack (use for naming and API surface)

| Frame | Vantage prompt | Posture | Tags |
|---|---|---|---|
| **etymologist / poet** | What did this concept get called before computers: in law, trade, seafaring, printing, theatre, cooking? What is the oldest word for the action? Which candidate sounds like what it does when spoken? Generate names and vocabulary families, not mechanisms. | transplant | design, general, wild |
| **translator** | How would a language that lacks the obvious word express this? What distinction does another language or field make that English collapses? Which two things are we calling the same that are different, and which two different-named things are one? Split or merge the concepts. | operator | design, general |
| **taxonomist / librarian** | Where does this sit in a hierarchy: parent, siblings, children? What existing category is it secretly a member of, and what does membership imply it should be able to do? | constraint | code, design |

### Time pack

| Frame | Vantage prompt | Posture | Tags |
|---|---|---|---|
| **pre-mortem** | It is 18 months from now; the obvious solution shipped and failed badly. Write the post-incident headline and root cause several times, each a different failure: wrong abstraction, wrong owner, wrong scale, silent data loss, nobody understood it, vendor left. Invert each into a preventing idea. Assume the pager worked and it still went wrong. | adversarial | code, design |
| **engineer in 1975** | No network, 64 KB, batch jobs, an hour of mainframe per night. Or earlier: telegraph operators, railway signalmen, guilds, ship captains, double-entry bookkeepers. Steal a pre-digital mechanism and apply it literally. | extreme | code, general, wild |
| **must run for 100 years** | Every vendor, language, and team involved today will be gone. What survives? What is self-describing, self-healing, or too simple to rot? Trade cleverness for longevity. | extreme | design, general |

### Formal pack

| Frame | Vantage prompt | Posture | Tags |
|---|---|---|---|
| **mathematician** | What quantity is conserved? What is the dual problem (caching ↔ prefetching, push ↔ pull)? What symmetry is broken, and what if you restore it? Is this secretly a graph, a lattice, a fixed point? Ideas fall out of naming the right structure. | transplant | code, design, wild |
| **urban planner / architect** | Desire paths, zoning, load-bearing walls, flows of people, shared courtyards. Where are users already cutting across the grass, and what if you paved that? What zoning keeps incompatible uses apart? | transplant | design, general |
| **mechanical engineer** | Tolerances, wear, fatigue. Which component wears out under repeated load? Where is the stress concentration? Fail-safe or fail-deadly? What is the fuse, the shear pin, the sacrificial part? | constraint | code, design |

### Human pack

| Frame | Vantage prompt | Posture | Tags |
|---|---|---|---|
| **dissolver** | The best solution removes the need for one. What would make this problem not exist? Which upstream decision created it? What if the feature were deleted, the user told no, the data never collected? | operator | code, design, general |
| **comedian** | What is absurd about this problem? Write the joke: the exaggeration, the literal reading, the thing everyone pretends not to notice. Then take the punchline completely seriously as an engineering proposal. | naive | general, wild |
| **Excel power user** | You only know spreadsheets and you are very good at them. How would you do this in a workbook a colleague could open and understand? Embarrassingly simple, visible, editable by non-programmers. | naive | code, general |
| **anthropologist** | Observe what people actually do, not what the system says. What rituals, workarounds, sticky notes, side channels have grown up? What happens the moment the official path fails? Formalize the existing workaround. | forensic | design, general |

### Picking frames

1. Code-shaped problem: 4 frames tagged `code` or `design` plus 1 `wild`.
   Open product or strategy problem: a mix from all tags.
2. Fuzzy bug: pull at least one from the diagnosis pack. Naming or API
   surface: pull at least two from the language pack.
3. Within those constraints, no two picks share a posture until every
   posture is taken.
4. Vary the picks across sessions so the same problem produces different
   candidate sets when re-run. The random-stimulus branch guarantees some
   variation even when the frames repeat.

## Output shape

After Phase 2, render in this order. Do not collapse it into a wall of
prose. The structure is the point.

1. **Brief.** One or two lines confirming the problem and any reframe used,
   then the banlist on one line ("Banned as obvious: …") and the stimulus
   noun.
2. **Wide set.** Full pool grouped by cluster, hybrids in their own
   cluster, reframing questions marked `?`. Each cluster labeled by
   underlying angle. Each idea is one short phrase. Show score chips like
   `[N7 V8 F9]` next to each; mark hybrids `⚭`, stimulus ideas `⚄`,
   second-round ideas `↳`.
3. **Converge.** A 2 to 4 idea shortlist. State why each is on the list.
   Mark the non-obvious-but-viable pick explicitly with ★. List traps
   separately, each with the one-line reason it is a trap.
4. **Focus.** The 3 deepened branches. For each: the sketch, the load-
   bearing risk, the first concrete step, and the child ideas.
5. **Provocation.** One wildcard question or idea that opens a new
   direction the user can push into if nothing landed.

## Anti-patterns

These are how this skill goes wrong. Watch for them.

- **Convergence disguised as divergence.** Ten minor variations of one idea
  is not breadth. If every candidate shares the same underlying assumption,
  you have not diverged. You have decorated.
- **Weird-for-weird's-sake with no convergence.** A pile of 30 unsorted
  absurdities is as useless as one safe answer. Always converge.
- **Walls of equally-weighted prose.** Cluster, label, pull out the best.
  Structure is half the value.
- **Refusing to commit.** After diverging, take a position on what is
  actually promising. "Here are 20 ideas, you decide" is a cop-out.
  Generate wide, but converge with a real opinion.
- **Guessing the obvious instead of naming it.** If Phase 0 is skipped,
  every branch bans a different three answers and two of them produce the
  textbook answer anyway. Name the list once; pass it everywhere.
- **"Do both" hybrids.** A hybrid that is the two parents stapled together
  is not a hybrid. If it does nothing a parent cannot, drop it.
- **Three siblings in the focus slot.** If the three deepened ideas share
  a cluster, the deepen pass has explored one direction three times.
  Spread across clusters even at a small score cost.
- **Skipping the isolation invariant.** If you simulate parallel branches
  by writing them sequentially in one context, you have not done ADHD. You
  have done a wider single thought. The Agent/Task tool gives each branch a
  fresh context. Use it.

## Calibration

- **How many ideas?** Scale to stakes. Quick "name this function" =
  3 frames × 4 ideas, language pack, no hybrids. "How should I position
  this product" = 5 frames × 8 ideas, depth 2. Default is 7 branches × 6
  = 42 plus 6 to 9 hybrids.
- **How weird?** Read the room. Serious strategy work: flag the wild cards
  clearly so they do not read as unserious. Open brainstorming or play:
  let it run loose. Absurd ideas earn their place by seeding viable ones.
- **When to stop diverging?** Stop when new candidates start repeating the
  shape of existing ones. The space is mapped. Do not pad to hit a number.

## Cost

1 obvious + 7 diverge (5 frames + stimulus + questions) + 1 score + 1
cluster + 3 hybridize + 1 hybrid score + 3 deepen ≈ 17 Agent calls per
run at depth 1; depth 2 adds 3 diverge + 1 score. About 8 to 15x a
single-shot answer. Not for every keystroke. For decision points where
the cost of the obvious answer is high. Trim with fewer hybrids, no
stimulus, or no questions branch when the stakes are moderate.

## Companion library and CLI

There is a Node/TS implementation that does the same loop with structured
JSON parsing, score weighting, and a CLI. Use it when running outside
Claude Code or in batch.

    npm install -g adhd-agent
    adhd "your problem here"
    adhd "why does this test flake" --pack core --pack diagnosis
    adhd "name this module" --pack language --frames 3 --hybrids 0
    adhd "position this product" --depth 2 --wild 2

Code, paper, evals, and contributing guide at
https://github.com/UditAkhourii/adhd. The skill above gives you the same
loop inside Claude with no install required.

## Source spec

This skill operationalises a written spec on divergent ideation. The
original prose is preserved in `SOURCE-SPEC.md` for reference. The
implementation choices made here (parallel isolated Agent calls,
mechanical generator/critic split, frame-based branching) follow from
that spec.
