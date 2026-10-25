# Frames — the cognitive distortions

[← back to README](../README.md)

A frame is a *vantage operator*: a system-prompt payload that re-poses the entire problem from a different cognitive position. Not a persona, not a domain expert — a deliberate distortion that forces the generator into a corner it would not naturally drift toward.

31 built-in frames ship in 6 packs. Each is a vantage prompt plus tags plus a **posture**.

## Postures

A posture is the stance a frame takes toward the problem, independent of its vocabulary. Five transplants from five domains tend to surface the same *shape* of idea; selection spreads a run across postures so five picks are five shapes.

| Posture | Stance |
|---|---|
| `adversarial` | break it, exploit it, write its post-mortem |
| `naive` | no priors, ignore convention |
| `transplant` | borrow a mechanism from another field |
| `operator` | a transform on the problem itself: invert, remove, dissolve, split |
| `extreme` | push one dimension to its limit: budget, time, scale, horizon |
| `constraint` | what must hold for this to be operable or provable |
| `forensic` | reason from symptoms back to causes |

## `core` (15 frames, default)

| Frame | Vantage | Posture | Tags |
|---|---|---|---|
| **Hardware engineer** | latency, memory layout, physical constraints | transplant | code, wild |
| **Regulator / auditor** | what must be provable, traceable, refusable? | constraint | design, general |
| **10-year-old** | ignore convention; the naive, unencumbered approach | naive | general, wild |
| **Competitor trying to break it** | adversarial; surface ideas by inversion | adversarial | code, design |
| **Biology** | immune systems, neural plasticity, cell signaling, gut flora | transplant | code, wild |
| **Logistics** | queues, batching, just-in-time, hub-and-spoke, returns | transplant | code, design |
| **Game design** | loops, rewards, friction, save-states, speedrun tricks | transplant | design, general |
| **Markets** | auctions, futures contracts, clearing houses | transplant | design, wild |
| **Inversion** | ask the opposite question, then negate | operator | code, design, general |
| **$0 budget, 1 hour** | the crudest version that still does the load-bearing thing | extreme | code, general |
| **Infinite budget, 10 years** | the maximalist version | extreme | design, wild |
| **Remove the load-bearing assumption** | what's possible if the framework / DB / network is gone? | operator | code, design, wild |
| **Speedrunner** | glitches, skips, frame-perfect shortcuts | adversarial | code, wild |
| **Ant colony / swarm** | no central planner, local rules, emergent behavior | transplant | code, wild |
| **3am on-call** | what design would let you not get paged? | constraint | code, design |

## `diagnosis` (3 frames) — fuzzy debugging

The skill promises help with fuzzy bugs; `core` has no frame that reasons from symptoms.

| Frame | Vantage | Posture | Tags |
|---|---|---|---|
| **Differential diagnostician** | competing hypotheses, each paired with the cheapest test that rules it out | forensic | code, design |
| **Detective** | the clue that does not fit the obvious story; who benefits from the current state | forensic | code, general |
| **Forensic accountant** | every unit accounted for source to sink; where the ledger stops balancing | forensic | code, design |

## `language` (3 frames) — naming and API surface

Running hardware-engineer on "what do we call this" produces noise. These frames think in words.

| Frame | Vantage | Posture | Tags |
|---|---|---|---|
| **Etymologist / poet** | what this was called before computers; roots, metaphor, sound | transplant | design, general, wild |
| **Translator** | distinctions another language makes that English collapses; split or merge the concepts | operator | design, general |
| **Taxonomist / librarian** | parent, siblings, children; what category it secretly belongs to | constraint | code, design |

## `time` (3 frames)

`core` touches time only through the budget extremes.

| Frame | Vantage | Posture | Tags |
|---|---|---|---|
| **Pre-mortem** | it shipped and failed 18 months later; write the headline, invert it. Strategic failure, not operability | adversarial | code, design |
| **Engineer in 1975** | 64 KB, batch jobs, no network; or telegraphs, guilds, ship captains | extreme | code, general, wild |
| **Must run for 100 years** | every vendor and team gone; what survives? | extreme | design, general |

## `formal` (3 frames)

| Frame | Vantage | Posture | Tags |
|---|---|---|---|
| **Mathematician** | invariants, duals, symmetries; is this secretly a graph or a fixed point? | transplant | code, design, wild |
| **Urban planner / architect** | desire paths, zoning, load-bearing walls, flows of people | transplant | design, general |
| **Mechanical engineer** | tolerances, wear, fatigue; fail-safe vs fail-deadly; the shear pin | constraint | code, design |

## `human` (4 frames)

Every `core` frame assumes the problem should be solved.

| Frame | Vantage | Posture | Tags |
|---|---|---|---|
| **Dissolver** | what would make this problem not exist? | operator | code, design, general |
| **Comedian** | write the joke, then take the punchline literally | naive | general, wild |
| **Excel power user** | how would you do this in a workbook a colleague could open? | naive | code, general |
| **Anthropologist** | the workarounds and side channels people already use | forensic | design, general |

## Two branches that are not frames

Both run in addition to the curated frames on every run (turn off with `--no-stimulus` / `--no-questions`):

- **Random stimulus.** One branch is forced to connect the problem to a random concrete noun — *lighthouse, beehive, canal lock, sourdough starter, air traffic controller* — drawn from ~180 in [`src/stimulus.ts`](../src/stimulus.ts). Every idea must borrow a specific mechanism or failure mode of that thing. Curated frames push into known corners; a random noun pushes into one nobody curated, and never the same one twice. Pin the word with `--stimulus WORD` for reproducible runs.
- **Reframing questions.** One branch outputs only questions, each a reframe of the problem: an unstated assumption, a missing stakeholder, a different unit of analysis, the larger problem this is a symptom of. No solutions. Problem-finding is upstream of idea-finding. Questions are scored like ideas (viability = could answering it change the design) and the highest-novelty question often becomes the run's provocation.

## How frames are selected

- Frames live in packs. A run draws from `core` unless `--pack NAME` (repeatable) or `packs` in `RunOptions` names others. Packs pool.
- `codeMode` (default `true`) biases selection toward `code` and `design` tags.
- `--wild N` (default 1) reserves that many slots for `wild`-tagged frames so divergence stays weird. `0` reserves none; `N = --frames` makes the whole run wild.
- The remaining slots fill by **posture coverage**: each pass takes at most one frame per posture not yet represented. A posture repeats only when every posture in the pool is already taken. Five picks from `core` are always five distinct postures.
- `--depth 2` runs a second round of 3 frames on the non-obvious pick; those frames are drawn with the first round's frames excluded.

## Authoring your own

A frame is ~6 lines in a pack under [`src/packs/`](../src/packs/): add it to an existing pack or to a pack of its own for another domain. A good frame passes at least two of:

- **Distinct vocabulary** — concepts no existing frame uses (pheromone trails, futures contracts, frame-perfect skip, shear pin, desire path).
- **Distinct posture** — one of the seven above, and preferably not `transplant` if the pack already has three.
- **Reproducible distortion** — consistently surfaces ideas the other frames don't.

Full guide in [CONTRIBUTING.md](../CONTRIBUTING.md#authoring-a-new-frame).
