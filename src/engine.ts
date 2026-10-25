// Tree-of-thought engine with pruning.
//
// The Steve-Jobs "connecting the dots" loop:
//   0. Reframe — strip incidental anchors. Name the obvious answers and ban them.
//   1. Diverge wide — fan out N parallel branches, each running under a
//      different cognitive frame, plus a random-stimulus branch and a
//      questions-only branch. No critic, no cross-talk. ADHD-mode.
//   2. Score every leaf on novelty / viability / fit.
//   3. Cluster — surface the SHAPE of the idea space, not just the leaves.
//   4. Hybridize — breed ideas across clusters. Hybrids are the one class of
//      idea no single frame can produce.
//   5. (depth 2) Re-diverge on the non-obvious pick with fresh frames.
//   6. Prune to top-K, spread across clusters, and DEEPEN those by recursive
//      expansion. This is where the agent "focuses".
//   7. Pick the non-obvious-but-viable one. Flag traps. Provoke once.
//
// Convergence happens after divergence, never during.

import pLimit from "p-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { callLLM, parseJSON, type LLMOptions } from "./llm.js";
import { selectFrames, type Frame } from "./frames.js";
import { pickStimulusWord, stimulusFrame, STIMULUS_FRAME_ID } from "./stimulus.js";
import type {
  Branch,
  Cluster,
  DeepenedIdea,
  Idea,
  IdeaKind,
  RunOptions,
  RunResult,
  Score,
} from "./types.js";

const DivergeRowSchema = z.array(
  z.object({ text: z.string(), rationale: z.string().optional() }),
);

const ObviousSchema = z.array(z.string());

const ScoreRowSchema = z.array(
  z.object({
    id: z.string(),
    novelty: z.number().min(0).max(10),
    viability: z.number().min(0).max(10),
    fit: z.number().min(0).max(10),
    trap: z.string().optional(),
    strength: z.string().optional(),
  }),
);

const ClusterSchema = z.array(
  z.object({ label: z.string(), ideaIds: z.array(z.string()) }),
);

const DeepenSchema = z.object({
  sketch: z.string(),
  childIdeas: z.array(
    z.object({ text: z.string(), rationale: z.string().optional() }),
  ),
});

const ReframeSchema = z.object({
  reframed: z.string(),
  changed: z.boolean(),
  note: z.string().optional(),
});

const DIVERGE_SYSTEM = `You are in DIVERGENT mode. You are a generator, not a critic.
Rules:
- Output a JSON array only. No prose before/after.
- Generate the requested number of distinct ideas.
- Each idea is a SHORT phrase or single sentence. No paragraphs.
- Push past the obvious. If a BANNED list is given, those answers and
  their minor variations are off the table — assume the reader already
  had them. Aim for the awkward middle.
- Bad, weird, and absurd ideas are welcome; they seed better ones.
- Do not evaluate, hedge, or rank. Just generate.`;

const QUESTION_SYSTEM = `You are in QUESTION mode. You are a generator of reframings, not of solutions.
Rules:
- Output a JSON array only. No prose before/after.
- Every item is a QUESTION, one sentence, ending in "?".
- Each question, if answered, would change what gets built: it names an
  unstated assumption, a hidden stakeholder, a missing constraint, a
  different unit of analysis, or a different problem that this one is a
  symptom of.
- No solutions. No "have you considered X?" where X is a solution.
- If a BANNED list is given, do not ask questions whose answer is one of
  those items.
- Do not evaluate, hedge, or rank. Just ask.`;

const OBVIOUS_SYSTEM = `You name the textbook answers. Given a problem, list the answers a competent
senior engineer gives in the first thirty seconds: the defaults, the
well-known patterns, the first page of search results. These will be
BANNED from a brainstorm, so be complete about the obvious and say
nothing about the non-obvious. One short phrase each, 3 to 5 items.
Output a JSON array of strings only.`;

const SCORE_SYSTEM = `You are in CONVERGENT mode. You are now the critic.
Score each idea on three axes 0-10:
- novelty: distance from the obvious default solution. If an OBVIOUS list
  is given, novelty is distance from THAT list: an idea that restates or
  lightly varies an item on it scores at most 2.
- viability: could this actually ship / work in practice. For an idea
  phrased as a question, viability means: could answering it realistically
  change the design.
- fit: how directly it addresses the stated problem

Tell the truth about weaknesses — don't soften the substance. But the
critic's job is to produce two symmetric signals, not just one:

- "strength": required for every idea, even weak ones. The single most
  concrete thing this idea gets right that a competing idea doesn't.
- "trap" (optional): if the idea looks attractive but has a hidden cost
  (false economy, won't scale, premature abstraction), name it as a
  specific, actionable heads-up — e.g. "solid for a prototype, breaks
  past 10k concurrent users" — not a dismissal like "bad idea." The
  fact stays the fact; only the framing changes: information you can
  act on, not a verdict on the idea's worth.

Output JSON only.`;

const CLUSTER_SYSTEM = `You group ideas into 3-6 clusters by their UNDERLYING ANGLE
(not by surface keywords). Cluster labels name the angle, e.g.
"remove-the-server plays", "push-work-to-client plays", "cache-shaped plays".
Output JSON only.`;

const HYBRID_SYSTEM = `You are in HYBRID mode. You are given two ideas that came from different
angles on the same problem. Breed them.
Rules:
- Output a JSON array only. No prose before/after.
- Produce 2 or 3 hybrids. Each is one sentence.
- A hybrid is NOT "do both". It is a third thing that exists only because
  the two parents exist: one parent's mechanism applied to the other's
  target, one parent fixing the other's weakness, or a new unit of work
  that only makes sense when both are true.
- rationale: one clause naming what each parent contributes.
- Do not evaluate or rank. Generate.`;

const REFRAME_SYSTEM = `You strip load-bearing anchors from a problem statement before divergent
brainstorming. An anchor is an incidental implementation detail (a specific
tech stack, an existing tool name, the current architecture) that isn't a
real constraint but silently narrows every downstream idea to variations on
what's already there.

Rules:
- Keep anchors that are genuine immutable constraints: compliance/legal
  requirements, hard budget or time limits, physical/protocol constraints,
  anything the user would reject an answer for violating.
- Strip anchors that are just "how it happens to be built today" — current
  database, current framework, current team structure — UNLESS removing
  them would make the problem meaningless or invite disallowed options.
- If you strip something, restate the problem as the underlying
  job-to-be-done, not the current implementation.
- If nothing needs stripping, return the problem unchanged and set
  "changed" to false.
Output JSON only: {"reframed": "...", "changed": true|false, "note": "one clause on what was stripped, omit if unchanged"}`;

const DEEPEN_SYSTEM = `You are in FOCUS mode. Take one promising idea and connect dots:
- Sketch how it would actually work (4-8 sentences).
- Name the load-bearing risk.
- Name the first concrete step a coder would take.
- Then generate 3-5 sub-ideas that branch off this one (variations,
  combinations with other domains, things this unlocks).
Output JSON only.`;

export const QUESTION_FRAME_ID = "reframing-questions";

// The one seam into the model. Injectable so the loop can run against a
// fake (tests) or a different provider (library users).
export type LLMFn = (opts: LLMOptions) => Promise<string>;

const QUESTION_FRAME: Frame = {
  id: QUESTION_FRAME_ID,
  label: "Reframing questions",
  prompt:
    "Do not solve the problem. Ask the questions that would change what the problem IS: " +
    "which assumption is unstated, who is missing from the room, what is being optimized that " +
    "nobody chose, what larger problem this is a symptom of, what the unit of analysis should be.",
  tags: ["code", "design", "general"],
  posture: "operator",
};

function banlistBlock(obvious: string[]): string {
  if (obvious.length === 0) return "";
  return `BANNED (the textbook answers — the reader already has these; do not produce them or minor variations):
${obvious.map((o) => `- ${o}`).join("\n")}

`;
}

async function reframeProblem(
  llm: LLMFn,
  problem: string,
  context: string | undefined,
  model: string | undefined,
): Promise<{ reframed: string; changed: boolean }> {
  const userPrompt = `PROBLEM:
${problem}

${context ? `CONTEXT:\n${context}\n\n` : ""}Strip incidental anchors, keep real constraints. Output JSON only.`;

  const raw = await llm({ model, systemPrompt: REFRAME_SYSTEM, userPrompt });

  try {
    const parsed = parseJSON(raw, ReframeSchema);
    return { reframed: parsed.reframed, changed: parsed.changed };
  } catch {
    // Fail open — if the reframe pass breaks, fan out from the original.
    return { reframed: problem, changed: false };
  }
}

// Name the obvious so it can be banned by name. "The first three answers are
// banned" is unenforceable when every branch guesses a different three.
async function listObvious(
  llm: LLMFn,
  problem: string,
  context: string | undefined,
  model: string | undefined,
): Promise<string[]> {
  const userPrompt = `PROBLEM:
${problem}

${context ? `CONTEXT:\n${context}\n\n` : ""}List the 3-5 textbook answers. Output a JSON array of strings only.`;

  const raw = await llm({ model, systemPrompt: OBVIOUS_SYSTEM, userPrompt });
  try {
    return parseJSON(raw, ObviousSchema)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 6);
  } catch {
    // Fail open — no banlist is the pre-existing behaviour.
    return [];
  }
}

async function divergeBranch(
  llm: LLMFn,
  problem: string,
  context: string | undefined,
  frame: Frame,
  ideasPerFrame: number,
  obvious: string[],
  model: string | undefined,
  kind: IdeaKind,
  seed?: Idea,
): Promise<Branch> {
  const direction = seed
    ? `DIRECTION (commit to it):
${seed.text}
You are generating ideas INSIDE this direction: ways to realize it, extend it,
or make it work where it looks like it should not. Do not return to the
general problem.

`
    : "";
  const ask =
    kind === "question"
      ? `Ask ${ideasPerFrame} reframing questions under this frame.`
      : `Generate ${ideasPerFrame} ideas under this frame.`;

  const userPrompt = `PROBLEM:
${problem}

${context ? `CONTEXT:\n${context}\n\n` : ""}${direction}${banlistBlock(obvious)}FRAME — ${frame.label}:
${frame.prompt}

${ask}
Output JSON array: [{"text": "...", "rationale": "..."}]
- text: one phrase/sentence, the ${kind === "question" ? "question" : "idea"} itself
- rationale: 1 short clause on why this frame surfaces it (optional)`;

  const raw = await llm({
    model,
    systemPrompt: kind === "question" ? QUESTION_SYSTEM : DIVERGE_SYSTEM,
    userPrompt,
  });

  let rows: z.infer<typeof DivergeRowSchema>;
  try {
    rows = parseJSON(raw, DivergeRowSchema);
  } catch {
    return { frameId: frame.id, ideas: [] };
  }

  const ideas: Idea[] = rows.map((r) => ({
    id: randomUUID(),
    frameId: frame.id,
    text: r.text,
    rationale: r.rationale,
    depth: seed ? seed.depth + 1 : 0,
    parentId: seed?.id,
    kind,
  }));
  return { frameId: frame.id, ideas };
}

async function scoreIdeas(
  llm: LLMFn,
  problem: string,
  ideas: Idea[],
  obvious: string[],
  model: string | undefined,
): Promise<Map<string, Score>> {
  if (ideas.length === 0) return new Map();

  const userPrompt = `PROBLEM:
${problem}

${obvious.length > 0 ? `OBVIOUS ANSWERS (already on the table — novelty is distance from these):\n${obvious.map((o) => `- ${o}`).join("\n")}\n\n` : ""}IDEAS (id → text):
${ideas.map((i) => `${i.id} :: ${i.text}`).join("\n")}

Score each. Output JSON array:
[{"id":"...","novelty":0-10,"viability":0-10,"fit":0-10,"strength":"...","trap":"... or omit"}]`;

  const raw = await llm({
    model,
    systemPrompt: SCORE_SYSTEM,
    userPrompt,
  });

  let rows: z.infer<typeof ScoreRowSchema>;
  try {
    rows = parseJSON(raw, ScoreRowSchema);
  } catch {
    return new Map();
  }

  const out = new Map<string, Score>();
  for (const r of rows) {
    out.set(r.id, withTotal(r));
  }
  return out;
}

// Weight: novelty matters because the whole point is escaping the obvious,
// but viability is the gatekeeper — a brilliant unshippable idea is a trap.
export function withTotal(r: Omit<Score, "total">): Score {
  return { ...r, total: r.novelty * 0.35 + r.viability * 0.4 + r.fit * 0.25 };
}

async function clusterIdeas(
  llm: LLMFn,
  problem: string,
  ideas: Idea[],
  model: string | undefined,
): Promise<Cluster[]> {
  if (ideas.length === 0) return [];

  const userPrompt = `PROBLEM:
${problem}

IDEAS:
${ideas.map((i) => `${i.id} :: ${i.text}`).join("\n")}

Output JSON: [{"label":"...","ideaIds":["...","..."]}]`;

  const raw = await llm({
    model,
    systemPrompt: CLUSTER_SYSTEM,
    userPrompt,
  });

  try {
    return parseJSON(raw, ClusterSchema);
  } catch {
    return [];
  }
}

async function hybridize(
  llm: LLMFn,
  problem: string,
  a: Idea,
  b: Idea,
  model: string | undefined,
): Promise<Idea[]> {
  const userPrompt = `PROBLEM:
${problem}

PARENT A (${a.cluster ?? "unclustered"}):
${a.text}
${a.rationale ? `(${a.rationale})` : ""}

PARENT B (${b.cluster ?? "unclustered"}):
${b.text}
${b.rationale ? `(${b.rationale})` : ""}

Breed 2-3 hybrids. Output JSON array: [{"text": "...", "rationale": "A gives …; B gives …"}]`;

  const raw = await llm({ model, systemPrompt: HYBRID_SYSTEM, userPrompt });

  let rows: z.infer<typeof DivergeRowSchema>;
  try {
    rows = parseJSON(raw, DivergeRowSchema);
  } catch {
    return [];
  }
  return rows.map((r) => ({
    id: randomUUID(),
    frameId: "hybrid",
    text: r.text,
    rationale: r.rationale,
    depth: Math.max(a.depth, b.depth),
    parentIds: [a.id, b.id],
    kind: "hybrid" as const,
  }));
}

export const HYBRID_CLUSTER_LABEL = "hybrids (cross-cluster)";

// Choose which ideas to breed: the best non-trap idea in each cluster is that
// cluster's representative; pair representatives of the strongest clusters,
// nearest-ranked first. Exported for tests.
export function pickHybridPairs(ideas: Idea[], clusters: Cluster[], pairs: number): [Idea, Idea][] {
  if (pairs <= 0) return [];
  const reps: Idea[] = [];
  for (const c of clusters) {
    const members = c.ideaIds
      .map((id) => ideas.find((i) => i.id === id))
      .filter((i): i is Idea => Boolean(i && i.score && !i.score.trap));
    if (members.length === 0) continue;
    members.sort((x, y) => y.score!.total - x.score!.total);
    reps.push(members[0]);
  }
  reps.sort((x, y) => y.score!.total - x.score!.total);
  const out: [Idea, Idea][] = [];
  // (0,1), (0,2), (1,2), (0,3), (1,3), (2,3), … — strongest clusters first.
  for (let j = 1; j < reps.length && out.length < pairs; j++) {
    for (let i = 0; i < j && out.length < pairs; i++) {
      out.push([reps[i], reps[j]]);
    }
  }
  return out;
}

// Greedy maximal-marginal-relevance pick: highest total, with a penalty for
// landing in a cluster already represented. Three deepened ideas should be
// three directions, not three siblings. Exported for tests.
export function pickDiverse(ranked: Idea[], k: number, penalty = 2.0): Idea[] {
  const picked: Idea[] = [];
  let remaining = [...ranked];
  const bucket = (i: Idea) => i.cluster ?? `~${i.id}`;
  while (picked.length < k && remaining.length > 0) {
    const seen = new Set(picked.map(bucket));
    let best = remaining[0];
    let bestScore = -Infinity;
    for (const i of remaining) {
      const s = (i.score?.total ?? 0) - (seen.has(bucket(i)) ? penalty : 0);
      if (s > bestScore) {
        best = i;
        bestScore = s;
      }
    }
    picked.push(best);
    remaining = remaining.filter((i) => i.id !== best.id);
  }
  return picked;
}

async function deepenIdea(
  llm: LLMFn,
  problem: string,
  idea: Idea,
  siblings: Idea[],
  model: string | undefined,
): Promise<DeepenedIdea> {
  const userPrompt = `PROBLEM:
${problem}

FOCUS IDEA:
${idea.text}
${idea.rationale ? `(${idea.rationale})` : ""}

SIBLING IDEAS (use for recombination if useful):
${siblings
  .filter((s) => s.id !== idea.id)
  .slice(0, 12)
  .map((s) => `- ${s.text}`)
  .join("\n")}

Output JSON:
{
  "sketch": "4-8 sentences. How it works. Load-bearing risk. First concrete step.",
  "childIdeas": [
    {"text": "...", "rationale": "variation / hybrid / unlock"}
  ]
}`;

  const raw = await llm({
    model,
    systemPrompt: DEEPEN_SYSTEM,
    userPrompt,
  });

  let parsed: z.infer<typeof DeepenSchema>;
  try {
    parsed = parseJSON(raw, DeepenSchema);
  } catch {
    return { ideaId: idea.id, sketch: "(deepen pass failed to parse)", childIdeas: [] };
  }

  const childIdeas: Idea[] = parsed.childIdeas.map((c) => ({
    id: randomUUID(),
    frameId: idea.frameId,
    text: c.text,
    rationale: c.rationale,
    depth: idea.depth + 1,
    parentId: idea.id,
  }));

  return { ideaId: idea.id, sketch: parsed.sketch, childIdeas };
}

function nonObvious(shortlist: Idea[]): Idea | null {
  if (shortlist.length === 0) return null;
  return [...shortlist].sort(
    (a, b) =>
      (b.score!.novelty + b.score!.viability * 0.5) -
      (a.score!.novelty + a.score!.viability * 0.5),
  )[0];
}

export async function run(opts: RunOptions): Promise<RunResult> {
  const {
    problem,
    context,
    framesPerRun = 5,
    ideasPerFrame = 6,
    topK = 3,
    concurrency = 4,
    codeMode = true,
    wild = 1,
    stripAnchors = true,
    banObvious = true,
    stimulus = true,
    stimulusWord,
    questions = true,
    hybridPairs = 3,
    depth = 1,
    model,
    criticModel,
    packs,
    onEvent,
    llm = callLLM,
  } = opts;

  // The critic (score + cluster) can run on a different model from the
  // generator to decorrelate errors. Defaults to the generator model.
  const critic = criticModel ?? model;

  // Selected before the reframe so an unknown pack fails before any LLM call.
  const curated = selectFrames(framesPerRun, codeMode, packs, { wild });
  const word = stimulus ? (stimulusWord ?? pickStimulusWord()) : undefined;
  const synthetic: { frame: Frame; kind: IdeaKind }[] = [];
  if (word) synthetic.push({ frame: stimulusFrame(word), kind: "stimulus" });
  if (questions) synthetic.push({ frame: QUESTION_FRAME, kind: "question" });
  const roster: { frame: Frame; kind: IdeaKind }[] = [
    ...curated.map((frame) => ({ frame, kind: "frame" as const })),
    ...synthetic,
  ];
  const frameLabel = (id: string) =>
    roster.find((r) => r.frame.id === id)?.frame.label ??
    (id === "hybrid" ? "hybrid" : id);

  // PHASE 0 — REFRAME. Strip incidental anchors (current stack, existing
  // tool names) from the problem statement before it ever reaches a branch.
  // Every branch otherwise sees the same raw problem, so an anchor buried
  // in it infects all N branches regardless of branch isolation. Real
  // constraints (compliance, budget, physical limits) are preserved.
  // Convergence (score/cluster/deepen) still judges against the ORIGINAL
  // problem — an idea has to fit the real constraints to be viable.
  let divergeProblem = problem;
  let reframe: string | undefined;
  if (stripAnchors) {
    const r = await reframeProblem(llm, problem, context, model);
    if (r.changed && r.reframed.trim().length > 0) {
      divergeProblem = r.reframed;
      reframe = r.reframed;
    }
    onEvent?.({ kind: "reframe:done", changed: Boolean(reframe) });
  }

  // PHASE 0b — NAME THE OBVIOUS. One cheap call lists the textbook answers;
  // every branch gets them as a banlist, and the scorer measures novelty as
  // distance from them instead of from a vibe.
  let obvious: string[] = [];
  if (banObvious) {
    obvious = await listObvious(llm, divergeProblem, context, critic);
    onEvent?.({ kind: "obvious:done", count: obvious.length });
  }

  const limit = pLimit(concurrency);
  const failedFrames: { frameId: string; error: string }[] = [];

  // Fan a roster out in parallel, collecting failures instead of aborting.
  // allSettled, not all: one branch's callLLM throwing (rate limit, timeout,
  // unrecoverable response) shouldn't discard every other branch's work.
  async function fanOut(
    list: { frame: Frame; kind: IdeaKind }[],
    seed?: Idea,
  ): Promise<Branch[]> {
    const settled = await Promise.allSettled(
      list.map(({ frame, kind }) =>
        limit(async () => {
          onEvent?.({ kind: "frame:start", frameId: frame.id, frameLabel: frame.label });
          const b = await divergeBranch(
            llm, divergeProblem, context, frame, ideasPerFrame, obvious, model, kind, seed,
          );
          onEvent?.({ kind: "frame:done", frameId: frame.id, count: b.ideas.length });
          return b;
        }),
      ),
    );
    const out: Branch[] = [];
    settled.forEach((result, i) => {
      const f = list[i].frame;
      if (result.status === "fulfilled") {
        out.push(result.value);
      } else {
        const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
        failedFrames.push({ frameId: f.id, error });
        onEvent?.({ kind: "frame:failed", frameId: f.id, frameLabel: f.label, error });
      }
    });
    return out;
  }

  // PHASE 1 — DIVERGE. Pure parallel fan-out. No branch sees another.
  const branches = await fanOut(roster);

  if (branches.length === 0) {
    throw new Error(
      `all ${roster.length} divergence branches failed: ${failedFrames.map((f) => `${f.frameId}: ${f.error}`).join("; ")}`,
    );
  }

  const allIdeas: Idea[] = branches.flatMap((b) => b.ideas);

  // PHASE 2 — SCORE + CLUSTER. Critic comes back online.
  const [scoreMap, clusters] = await Promise.all([
    scoreIdeas(llm, problem, allIdeas, obvious, critic),
    clusterIdeas(llm, problem, allIdeas, critic),
  ]);
  for (const i of allIdeas) i.score = scoreMap.get(i.id);
  // Stamp cluster label onto each idea for nicer rendering.
  for (const c of clusters) for (const id of c.ideaIds) {
    const idea = allIdeas.find((x) => x.id === id);
    if (idea) idea.cluster = c.label;
  }
  onEvent?.({ kind: "score:done", total: allIdeas.length });
  onEvent?.({ kind: "cluster:done", clusters: clusters.length });

  // PHASE 2b — HYBRIDIZE. Pair the strongest idea from each cluster across
  // clusters and breed. Hybrids are scored and compete for the shortlist.
  const hybrids: Idea[] = [];
  const pairs = pickHybridPairs(allIdeas, clusters, hybridPairs);
  if (pairs.length > 0) {
    const settled = await Promise.allSettled(
      pairs.map(([a, b]) =>
        limit(async () => {
          onEvent?.({ kind: "hybrid:start", a: a.text, b: b.text });
          return hybridize(llm, problem, a, b, model);
        }),
      ),
    );
    for (const s of settled) {
      if (s.status === "fulfilled") hybrids.push(...s.value);
      else {
        const error = s.reason instanceof Error ? s.reason.message : String(s.reason);
        failedFrames.push({ frameId: "hybrid", error });
        onEvent?.({ kind: "frame:failed", frameId: "hybrid", frameLabel: "hybrid", error });
      }
    }
    if (hybrids.length > 0) {
      const hs = await scoreIdeas(llm, problem, hybrids, obvious, critic);
      for (const h of hybrids) {
        h.score = hs.get(h.id);
        h.cluster = HYBRID_CLUSTER_LABEL;
      }
      clusters.push({ label: HYBRID_CLUSTER_LABEL, ideaIds: hybrids.map((h) => h.id) });
    }
    onEvent?.({ kind: "hybrid:done", count: hybrids.length });
  }

  let pool: Idea[] = [...allIdeas, ...hybrids];
  const viable = () =>
    pool.filter((i) => i.score && !i.score.trap).sort((a, b) => b.score!.total - a.score!.total);

  // PHASE 2c — SECOND ROUND. Re-diverge on the provisional non-obvious pick
  // with fresh frames (none reused from round one). Doubles the diverge cost,
  // so opt-in via depth: 2.
  const secondRound: Branch[] = [];
  if (depth >= 2) {
    const seed = nonObvious(pickDiverse(viable(), Math.max(2, Math.min(4, topK + 1))));
    if (seed) {
      onEvent?.({ kind: "round2:start", seed: seed.text });
      const used = roster.map((r) => r.frame.id);
      const fresh = selectFrames(3, codeMode, packs, { wild: 1, exclude: used });
      const r2 = await fanOut(fresh.map((frame) => ({ frame, kind: "round2" as const })), seed);
      const r2Ideas = r2.flatMap((b) => b.ideas);
      if (r2Ideas.length > 0) {
        const r2Scores = await scoreIdeas(llm, problem, r2Ideas, obvious, critic);
        for (const i of r2Ideas) {
          i.score = r2Scores.get(i.id);
          i.cluster = seed.cluster;
        }
        const home = clusters.find((c) => c.label === seed.cluster);
        if (home) home.ideaIds.push(...r2Ideas.map((i) => i.id));
      }
      secondRound.push(...r2);
      // Round-two frames become part of the roster for label lookups.
      for (const f of fresh) roster.push({ frame: f, kind: "round2" });
      pool = [...pool, ...r2Ideas];
      onEvent?.({ kind: "round2:done", count: r2Ideas.length });
    }
  }

  // Shortlist: top by total, spread across clusters, excluding traps.
  // Traps reported separately.
  const traps = pool.filter((i) => i.score?.trap);
  const ranked = viable();
  const shortlist = pickDiverse(ranked, Math.max(2, Math.min(4, topK + 1)));

  // Non-obvious pick = highest novelty among the viable shortlist.
  const nonObviousPick = nonObvious(shortlist);

  // PHASE 3 — FOCUS / DEEPEN top-K. This is the "connecting the dots" pass.
  // Spread across clusters so the three deepened ideas are three directions.
  const toDeepen = pickDiverse(ranked, topK);
  const deepenSettled = await Promise.allSettled(
    toDeepen.map((idea) =>
      limit(async () => {
        onEvent?.({ kind: "deepen:start", ideaId: idea.id, text: idea.text });
        const d = await deepenIdea(llm, problem, idea, pool, model);
        onEvent?.({ kind: "deepen:done", ideaId: idea.id });
        return d;
      }),
    ),
  );

  const deepened: DeepenedIdea[] = [];
  deepenSettled.forEach((result, i) => {
    const idea = toDeepen[i];
    if (result.status === "fulfilled") {
      deepened.push(result.value);
    } else {
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      failedFrames.push({ frameId: idea.frameId, error });
      onEvent?.({ kind: "frame:failed", frameId: idea.frameId, frameLabel: frameLabel(idea.frameId), error });
    }
  });

  // One provocation = the highest-novelty leaf, reframed as a question.
  // A reframing question is already a provocation; use it as-is.
  // Cheap, doesn't need another LLM call.
  const wildcard = pool
    .filter((i) => i.score)
    .sort((a, b) => b.score!.novelty - a.score!.novelty)[0];
  const provocation = wildcard
    ? wildcard.kind === "question"
      ? wildcard.text
      : `What if we took this seriously: ${wildcard.text}`
    : "What's the assumption nobody named yet?";

  return {
    problem,
    reframe,
    obvious,
    stimulus: word,
    branches,
    hybrids,
    secondRound,
    clusters,
    shortlist,
    nonObviousPick,
    traps,
    deepened,
    provocation,
    failedFrames,
  };
}

export { STIMULUS_FRAME_ID };
