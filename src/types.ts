export type Idea = {
  id: string;
  frameId: string;
  cluster?: string;
  text: string;        // one-line phrase, not a paragraph
  rationale?: string;  // optional, short
  score?: Score;
  depth: number;       // 0 = root divergence, 1+ = deepened or second-round
  parentId?: string;
  parentIds?: string[]; // hybrids: the two (or more) ideas this was bred from
  kind?: IdeaKind;     // where in the loop this idea came from, default "frame"
};

// "frame"     — a curated frame branch
// "stimulus"  — the random-stimulus branch (forced connection to a random noun)
// "question"  — the questions-only branch (reframed problem, not a solution)
// "hybrid"    — bred from two ideas in different clusters
// "round2"    — second-round divergence seeded by the non-obvious pick
export type IdeaKind = "frame" | "stimulus" | "question" | "hybrid" | "round2";

export type Score = {
  novelty: number;     // 0-10, away from the obvious
  viability: number;   // 0-10, could actually ship
  fit: number;         // 0-10, addresses the stated problem
  total: number;       // weighted
  trap?: string;       // if it looks good but is a trap, why
  strength?: string;   // the one concrete thing this idea gets right
};

export type Branch = {
  frameId: string;
  ideas: Idea[];
};

export type RunResult = {
  problem: string;
  reframe?: string;
  obvious: string[];          // the textbook answers named up front and banned from every branch
  stimulus?: string;          // the random noun the stimulus branch was forced to connect to
  branches: Branch[];         // raw divergence per frame (includes stimulus + question branches)
  hybrids: Idea[];            // cross-cluster hybrids bred in Phase 2
  secondRound: Branch[];      // depth-2 branches seeded by the non-obvious pick (empty at depth 1)
  clusters: Cluster[];        // converged shape of the space
  shortlist: Idea[];          // 2-4 most promising
  nonObviousPick: Idea | null;
  traps: Idea[];
  deepened: DeepenedIdea[];   // top branches expanded
  provocation: string;        // single wild-card question/idea
  failedFrames: { frameId: string; error: string }[]; // branches/deepens that threw
};

export type Cluster = {
  label: string;
  ideaIds: string[];
};

export type DeepenedIdea = {
  ideaId: string;
  sketch: string;       // 4-8 sentences: how it works, key risk, first step
  childIdeas: Idea[];   // sub-ideas surfaced while deepening
};

export type RunOptions = {
  problem: string;
  context?: string;                    // codebase snippets, constraints, stack
  framesPerRun?: number;               // curated frames per run, default 5
  ideasPerFrame?: number;              // default 6
  topK?: number;                       // how many to deepen, default 3
  concurrency?: number;                // parallel branches, default 4
  codeMode?: boolean;                  // bias frames toward engineering
  wild?: number;                       // wild-tagged frames reserved per run, default 1.
                                       // 0 = none reserved; framesPerRun = all wild.
  stripAnchors?: boolean;              // strip incidental anchors (current stack,
                                       // existing tool names) from the problem before
                                       // fan-out, default true. Real constraints
                                       // (compliance, budget, physical limits) are kept.
  banObvious?: boolean;                // name the 3-5 textbook answers first and pass
                                       // them to every branch as a banlist, default true
  stimulus?: boolean;                  // add one branch forced to connect the problem to
                                       // a random noun (Oblique Strategies), default true
  stimulusWord?: string;               // pin the stimulus noun (reproducible runs)
  questions?: boolean;                 // add one branch that outputs only reframed
                                       // questions, not solutions, default true
  hybridPairs?: number;                // cross-cluster pairs to breed in Phase 2, default 3.
                                       // 0 disables hybridization.
  depth?: 1 | 2;                       // 2 = re-diverge on the non-obvious pick with
                                       // fresh frames before deepening, default 1
  model?: string;                      // override SDK model (generator + critic)
  criticModel?: string;                // override model for the critic passes
                                       // (score + cluster) only; falls back to `model`.
                                       // Use a different family to decorrelate critic errors.
  packs?: string[];                    // frame packs to draw from, by name, default ["core"]
  onEvent?: (e: RunEvent) => void;     // stream progress to caller/CLI
  llm?: (opts: { model?: string; systemPrompt: string; userPrompt: string }) => Promise<string>;
                                       // replace the model call (tests, other providers).
                                       // Default: the Claude Agent SDK one-shot in llm.ts
};

export type RunEvent =
  | { kind: "reframe:done"; changed: boolean }
  | { kind: "obvious:done"; count: number }
  | { kind: "frame:start"; frameId: string; frameLabel: string }
  | { kind: "frame:done"; frameId: string; count: number }
  | { kind: "score:done"; total: number }
  | { kind: "cluster:done"; clusters: number }
  | { kind: "hybrid:start"; a: string; b: string }
  | { kind: "hybrid:done"; count: number }
  | { kind: "round2:start"; seed: string }
  | { kind: "round2:done"; count: number }
  | { kind: "deepen:start"; ideaId: string; text: string }
  | { kind: "deepen:done"; ideaId: string }
  | { kind: "frame:failed"; frameId: string; frameLabel: string; error: string }
  | { kind: "warn"; message: string };
