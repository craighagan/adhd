#!/usr/bin/env node
// CLI surface for connect-dots.
//
// Usage:
//   connect-dots "how should we shard this queue?"
//   connect-dots "..." --frames 6 --ideas 8 --top 4 --context ./CONTEXT.md
//   connect-dots "..." --json > result.json

import { readFileSync, statSync } from "node:fs";
import { run } from "./engine.js";
import { renderText } from "./render.js";
import type { RunEvent, RunOptions } from "./types.js";

type Flags = {
  problem: string;
  context?: string;
  frames?: number;
  ideas?: number;
  top?: number;
  concurrency?: number;
  codeMode: boolean;
  wild?: number;
  stripAnchors: boolean;
  banObvious: boolean;
  stimulus: boolean;
  stimulusWord?: string;
  questions: boolean;
  hybridPairs?: number;
  depth: 1 | 2;
  json: boolean;
  quiet: boolean;
  model?: string;
  criticModel?: string;
  packs?: string[];
};

function positiveInt(raw: string, flag: string, max: number, min = 1): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || !Number.isInteger(n)) {
    console.error(`Error: ${flag} must be an integer >= ${min}, got "${raw}"`);
    process.exit(1);
  }
  if (n > max) {
    console.error(`Error: ${flag} must be at most ${max}, got ${n}`);
    process.exit(1);
  }
  return n;
}

const MAX_CONTEXT_BYTES = 10 * 1024 * 1024; // 10 MB

function parse(argv: string[]): Flags {
  const f: Flags = {
    problem: "",
    codeMode: true,
    stripAnchors: true,
    banObvious: true,
    stimulus: true,
    questions: true,
    depth: 1,
    json: false,
    quiet: false,
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--frames": f.frames = positiveInt(argv[++i], "--frames", 20); break;
      case "--ideas": f.ideas = positiveInt(argv[++i], "--ideas", 50); break;
      case "--top": f.top = positiveInt(argv[++i], "--top", 20); break;
      case "--concurrency": f.concurrency = positiveInt(argv[++i], "--concurrency", 16); break;
      case "--context": {
        const path = argv[++i];
        const { size } = statSync(path);
        if (size > MAX_CONTEXT_BYTES) {
          console.error(`Error: context file is ${(size / 1024 / 1024).toFixed(1)} MB (max 10 MB)`);
          process.exit(1);
        }
        f.context = readFileSync(path, "utf8");
        break;
      }
      case "--model": f.model = argv[++i]; break;
      case "--critic-model": f.criticModel = argv[++i]; break;
      case "--pack": {
        const name = argv[++i];
        if (!name) {
          console.error("Error: --pack needs a pack name");
          process.exit(1);
        }
        (f.packs ??= []).push(name);
        break;
      }
      case "--wild": f.wild = positiveInt(argv[++i], "--wild", 20, 0); break;
      case "--hybrids": f.hybridPairs = positiveInt(argv[++i], "--hybrids", 10, 0); break;
      case "--depth": {
        const d = positiveInt(argv[++i], "--depth", 2);
        f.depth = d === 2 ? 2 : 1;
        break;
      }
      case "--stimulus": {
        const w = argv[++i];
        if (!w) {
          console.error("Error: --stimulus needs a word");
          process.exit(1);
        }
        f.stimulusWord = w;
        break;
      }
      case "--no-code-mode": f.codeMode = false; break;
      case "--no-anchor-strip": f.stripAnchors = false; break;
      case "--no-ban-obvious": f.banObvious = false; break;
      case "--no-stimulus": f.stimulus = false; break;
      case "--no-questions": f.questions = false; break;
      case "--json": f.json = true; break;
      case "--quiet": f.quiet = true; break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        rest.push(a);
    }
  }
  f.problem = rest.join(" ").trim();
  return f;
}

function printHelp() {
  console.log(`adhd — a skill for coding agents

  Stop your agent from picking the first answer. Fans out many parallel
  divergent thoughts under different cognitive frames, scores them,
  prunes traps, and deepens the survivors. Tree-of-thought with pruning,
  built on the Claude Agent SDK.

USAGE
  adhd "<problem>" [flags]

FLAGS
  --frames N        curated frames per run (default 5). The random-stimulus
                    and reframing-questions branches run in addition.
  --wild N          wild-tagged frames reserved among those (default 1;
                    0 = none reserved, N = all wild)
  --ideas N         ideas per branch (default 6)
  --top N           how many to deepen / focus on (default 3)
  --hybrids N       cross-cluster pairs to breed after clustering (default 3;
                    0 disables)
  --depth 1|2       2 = re-diverge on the non-obvious pick with 3 fresh frames
                    before deepening (default 1)
  --stimulus WORD   pin the random-stimulus noun (reproducible runs)
  --concurrency N   max parallel LLM calls (default 4)
  --context PATH    file to inject as context (code, constraints, stack)
  --model NAME      override the SDK model (generator + critic)
  --critic-model N  override the model for the critic passes only
                    (score + cluster); decorrelates critic errors
  --pack NAME       draw frames from this pack (default core); repeat to
                    pool several packs
  --no-code-mode    don't bias frames toward engineering
  --no-anchor-strip don't strip incidental anchors (stack, tool names) from
                    the problem before fan-out; keep the raw problem as-is
  --no-ban-obvious  skip naming the textbook answers up front and passing
                    them to every branch as a banlist
  --no-stimulus     skip the random-stimulus branch
  --no-questions    skip the reframing-questions branch
  --json            emit RunResult as JSON
  --quiet           suppress progress events
  -h, --help

EXAMPLES
  adhd "design a rate limiter that survives a leader election"
  adhd "name this function" --frames 3 --ideas 8 --top 2
  adhd "..." --context ./snippet.ts --json > out.json
  adhd "..." --pack core --pack diagnosis --depth 2 --wild 2
`);
}

async function main() {
  const flags = parse(process.argv.slice(2));
  if (!flags.problem) { printHelp(); process.exit(1); }

  const onEvent = flags.quiet ? undefined : (e: RunEvent) => {
    switch (e.kind) {
      case "reframe:done": if (e.changed) process.stderr.write(`  ↺ anchors stripped from problem\n`); break;
      case "obvious:done": process.stderr.write(`  ⊘ ${e.count} obvious answers banned\n`); break;
      case "hybrid:start": process.stderr.write(`  ⚭ breeding: ${e.a} × ${e.b}\n`); break;
      case "hybrid:done":  process.stderr.write(`  ${e.count} hybrids\n`); break;
      case "round2:start": process.stderr.write(`  ↳ second round on: ${e.seed}\n`); break;
      case "round2:done":  process.stderr.write(`  ${e.count} second-round ideas\n`); break;
      case "frame:start": process.stderr.write(`  ▸ ${e.frameLabel}…\n`); break;
      case "frame:done":  process.stderr.write(`    ${e.count} ideas (${e.frameId})\n`); break;
      case "score:done":  process.stderr.write(`  scored ${e.total} ideas\n`); break;
      case "cluster:done":process.stderr.write(`  ${e.clusters} clusters\n`); break;
      case "deepen:start":process.stderr.write(`  ◎ focus → ${e.text}\n`); break;
      case "frame:failed":process.stderr.write(`  ✗ ${e.frameLabel} failed: ${e.error}\n`); break;
      case "warn":        process.stderr.write(`  ! ${e.message}\n`); break;
    }
  };

  const opts: RunOptions = {
    problem: flags.problem,
    context: flags.context,
    framesPerRun: flags.frames,
    ideasPerFrame: flags.ideas,
    topK: flags.top,
    concurrency: flags.concurrency,
    codeMode: flags.codeMode,
    wild: flags.wild,
    stripAnchors: flags.stripAnchors,
    banObvious: flags.banObvious,
    stimulus: flags.stimulus,
    stimulusWord: flags.stimulusWord,
    questions: flags.questions,
    hybridPairs: flags.hybridPairs,
    depth: flags.depth,
    model: flags.model,
    criticModel: flags.criticModel,
    packs: flags.packs,
    onEvent,
  };

  const result = await run(opts);

  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(renderText(result) + "\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
