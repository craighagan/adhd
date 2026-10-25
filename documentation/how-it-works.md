# How ADHD works

[← back to README](../README.md)

A setup pass, then a two-phase loop with a hard wall between the phases. Mixing the phases is what kills idea quality, because the critic strangles the generator.

## Phase 0 — Reframe and name the obvious

Two cheap calls before any branch runs:

1. **Reframe.** Strip incidental anchors (current stack, tool names) from the problem. Real constraints stay.
2. **Name the obvious.** List the 3–5 textbook answers a senior engineer gives in thirty seconds. This is the **banlist**. "The first three answers are banned" is unenforceable when each branch guesses a different three; a named list is enforceable, and it gives the critic a concrete anchor for novelty.

## Phase 1 — Diverge (ADHD mode)

Pick N **cognitive frames** from the [frame library](./frames.md), spread across **postures** (adversarial, naive, transplant, operator, extreme, constraint, forensic) so five picks are five stances rather than five domains. Add two synthetic branches: a **random-stimulus** branch forced to connect every idea to a random concrete noun, and a **reframing-questions** branch that outputs only questions. Spawn them all as **parallel** Agent SDK queries, each one a fresh isolated session.

Each branch sees:
- the problem
- the banlist
- *one* frame's vantage prompt (e.g. *"You think in latency, memory layout, and physical constraints. Re-ask this as a hardware problem."*)
- a system prompt that **forbids evaluation, ranking, or hedging** — pure generation, JSON array out, no prose.

Critically: branches **do not see each other**. The "regulator" branch never reads what the "speedrunner" branch wrote. No anchoring, no shared context, no convergence pressure.

## Phase 2 — Focus

Now the critic comes back online. Five passes:

1. **Score** every leaf on `novelty / viability / fit`, with novelty measured as distance from the banlist. Tag traps with reasons.
2. **Cluster** by underlying angle, not surface keywords ("remove-the-server plays", "cache-shaped plays") — surfaces the *shape* of the space.
3. **Hybridize.** The best non-trap idea in each cluster represents it; representatives of the strongest clusters are paired (3 pairs by default) and bred in separate calls. A hybrid is not "do both" — it is a third thing that exists only because both parents do. Hybrids are scored with the same rubric and compete for the shortlist on equal terms.
4. **Second round** (`depth: 2`, opt-in). Re-diverge on the provisional non-obvious pick with 3 fresh frames, instruction *"commit to this direction"*. Doubles the diverge cost.
5. **Deepen** top-K, chosen by greedy maximal-marginal-relevance: highest score, minus a penalty for a cluster already represented, so three deepened ideas are three directions. For each: sketch how it works, name the load-bearing risk, name the first concrete step, generate 3–5 child ideas.

Output:
- the wide set, clustered
- a 2–4 idea shortlist
- the **non-obvious-but-viable pick** flagged explicitly
- the trap list, each trap with the reason it's a trap
- the deepened branches — the "connected dots"
- one provocation (a wildcard question)

---

## Architecture — the mechanism, not the metaphor

For researchers and infra folks.

### Context-window management

Each divergent branch is its own `query()` call against the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk) — a fresh, **stateless session** with no shared KV-cache, no shared message history, no shared system prompt beyond the `claude_code` preset. The only tokens that enter a branch are:

```
system  = preset + "forbid evaluation/ranking/hedging, JSON array out"
user    = problem + optional_context + banlist + frame_vantage_prompt
```

Token cost scales **linearly** in branches (`O(N × per_branch)`), not quadratically — there's no broadcast of prior branches into later ones. The "ADHD" fan-out is true concurrent inference, not interleaved decoding on a shared trajectory. See [`src/llm.ts`](../src/llm.ts) and `divergeBranch` in [`src/engine.ts`](../src/engine.ts).

### Pruning & convergence criteria

Convergence is a set of **separate LLM calls** with inverted system prompts (critic posture, evaluation mandatory). See `scoreIdeas`, `clusterIdeas`, `pickHybridPairs`, `hybridize`, `pickDiverse`, and `deepenIdea` in [`src/engine.ts`](../src/engine.ts):

1. **Score** — every leaf scored on `novelty / viability / fit` (0–10 each), structured JSON. Traps tagged with a mechanistic reason (e.g. *"shelve isn't thread-safe under multi-writer load"*), not a vague risk label.
2. **Cluster** — angle-level grouping ("remove-the-server plays", "cache-shaped plays"), not surface-keyword clustering. Surfaces the *shape* of the design space.
3. **Deepen top-K** — for the K highest combined-score non-trap leaves, generate: sketch, load-bearing risk, first concrete step, 3–5 child ideas (variations / hybrids / unlocks).

No heuristic threshold and no logit-bias steering. The critic's structured output is the pruning decision; the only arithmetic on top is the fixed score weighting (0.35 / 0.40 / 0.25) and a 2-point cluster-repeat penalty in top-K selection. Default `K=3`; the `nonObviousPick` field surfaces the highest-novelty viable leaf even if it's not the highest-fit.

### Routing & orchestration

Multi-agent orchestration via parallel `query()` calls, gated by a configurable semaphore (`concurrency`, default 4). Frame selection (see [`src/frames.ts`](../src/frames.ts)) reserves `wild` slots, then fills by posture coverage, with a `codeMode` bias toward engineering vantage points. Each frame is a **system-prompt payload** that re-poses the entire question — *"re-ask this as a hardware problem"*, *"re-ask this as a regulator"*, *"re-ask this as a 10-year-old"* — not a logit-level intervention.

```ts
// the load-bearing call shape — src/engine.ts
const branches = await Promise.all(
  frames.map(frame => withSemaphore(concurrency, () => callLLM({
    systemPrompt: `${frame.vantage}\n\nFORBIDDEN: evaluation, ranking, hedging. JSON array out.`,
    userPrompt:   `${problem}\n\n${context ?? ""}`,
  })))
);
// branches[i] never sees branches[j] during divergence — by construction.
```

The generator-critic split is **mechanical** (different API calls, different system prompts) rather than promised in-prompt to the same session. This is the load-bearing design choice that distinguishes ADHD from in-context Tree-of-Thought. See [vs-cot-and-tot.md](./vs-cot-and-tot.md) for the full comparison.
