#!/usr/bin/env node
// check-facts.mjs — re-read the names index.html prints against the tree that decides them.
//
// The page promises that every claim names the file that decides it. A name moves
// as readily as a number: a provider id is renamed, two tools become one, a skill
// directory changes its name, a settings path stops resolving. Each row below
// reads the deciding file in a pi-braid checkout and compares it to the sentence
// in the page, so a stale name fails here instead of aging quietly in prose.
//
// A row whose source cannot be read is reported unchecked and is never counted as
// a pass. Nothing here uses the network, and nothing writes.
//
//   node check-facts.mjs [--file index.html] [--source ../pi-braid]
//                        [--pi <pi-core package dir>] [--contract <deck-gate.mjs>]
//
// Exit 0 every row checked and holds; 1 a claim moved; 2 the page is unreadable;
// 3 at least one row could not be checked.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();

// ── Arguments ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { file: join(HERE, "index.html"), source: null, pi: null, contract: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--file") opts.file = value, i++;
    else if (flag === "--source") opts.source = value, i++;
    else if (flag === "--pi") opts.pi = value, i++;
    else if (flag === "--contract") opts.contract = value, i++;
    else if (flag === "--help" || flag === "-h") { console.log(usage()); process.exit(0); }
    else { console.error(`unknown argument ${flag}\n\n${usage()}`); process.exit(64); }
  }
  return opts;
}

function usage() {
  return "usage: node check-facts.mjs [--file index.html] [--source ../pi-braid] [--pi <pi-core package dir>] [--contract <deck-gate.mjs>]";
}

// The checkout is a sibling by default because that is where a reader of this
// page keeps it; the environment variable is for a machine that keeps it
// elsewhere. Neither is a guess the gate can hide: a missing checkout fails.
function findSource(opts) {
  if (opts.source) return resolve(opts.source);
  if (process.env.BRAID_SOURCE) return resolve(process.env.BRAID_SOURCE);
  return resolve(HERE, "..", "pi-braid");
}

// pi's own resolver is the instrument for a settings path: a path is correct
// here only if the function pi runs on it says so. Release directories are
// version-named, so the newest sort last.
function findPi(opts) {
  if (opts.pi) return resolve(opts.pi);
  if (process.env.PI_CORE) return resolve(process.env.PI_CORE);
  const releases = join(HOME, ".pi/agent/install/releases");
  if (!existsSync(releases)) return null;
  const candidates = readdirSync(releases)
    .sort()
    .map((name) => join(releases, name, "node_modules/@earendil-works/pi-coding-agent"))
    .filter((dir) => existsSync(join(dir, "dist/utils/paths.js")));
  return candidates.length ? candidates.at(-1) : null;
}

// ── Reading the page ─────────────────────────────────────────────────────────

const opts = parseArgs(process.argv.slice(2));
const deckDir = dirname(resolve(opts.file));
let html;
try {
  html = readFileSync(opts.file, "utf8");
} catch (error) {
  console.error(`FAIL: cannot read ${opts.file} (${error.message})`);
  process.exit(2);
}

const lineAt = (index) => html.slice(0, index).split("\n").length;
const lineOf = (fragment) => {
  const at = html.indexOf(fragment);
  return at < 0 ? null : lineAt(at);
};
const lineOfPattern = (pattern) => {
  const match = html.match(pattern);
  return match && match.index !== undefined ? lineAt(match.index) : null;
};
const readText = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);
const relativeTo = (root, path) => path.startsWith(root) ? path.slice(root.length + 1) : path;

// The library index is one section. `.tn` also labels the native tool grid, so the
// selector is scoped to the section rather than matched across the page: a class
// name alone would call four tools skills.
const SKILLS_SECTION = (() => {
  const open = html.indexOf('<section class="spread" id="skills">');
  if (open < 0) return "";
  const close = html.indexOf("</section>", open);
  return close < 0 ? html.slice(open) : html.slice(open, close);
})();
const listedSkills = () =>
  [...SKILLS_SECTION.matchAll(/<span class="tn">([^<]*)<\/span>/g)].flatMap((row) =>
    row[1].split(",").map((name) => name.trim()).filter(Boolean),
  );

// Languages are held to one count by the page's own contract: a correction in
// one language only leaves the other lying. This is not a claim about the
// repository, so it is reported as a document invariant beside the rows.
const spanCount = (lang) => (html.match(new RegExp(`class="lang-${lang}"`, "g")) || []).length;

// ── Rows ─────────────────────────────────────────────────────────────────────
// Each row returns ok(detail), moved(expected, found) or unchecked(reason).
// `expected` states what the deciding file says; `found` states what the page
// prints. A reader can settle a failure without re-running the gate.

const ok = (detail) => ({ state: "ok", detail });
const moved = (expected, found) => ({ state: "moved", expected, found });
const unchecked = (reason) => ({ state: "unchecked", reason });

const ROWS = [
  {
    // A provider id is the name a user's settings reference. Renaming it breaks
    // configs silently, so the page must print the id the package registers.
    id: "provider-id",
    claim: "the providers paragraph names the gateway by the id the package registers",
    anchor: "Venice models through the",
    section: "suite",
    check(ctx) {
      const file = join(ctx.source, "packages/providers/ring-lifecycle.ts");
      const src = readText(file);
      if (src === null) return unchecked(`cannot read ${file}`);
      const match = src.match(/export const AGENT_ZERO_ID: ProviderId = "([^"]+)"/);
      if (!match) return unchecked(`no AGENT_ZERO_ID declaration in ${relativeTo(ctx.source, file)}`);
      const id = match[1];
      const missing = [];
      if (!ctx.html.includes(`the ${id} gateway`)) missing.push(`the English sentence does not name "the ${id} gateway"`);
      if (!ctx.html.includes(`шлюз ${id}`)) missing.push(`the Russian sentence does not name "шлюз ${id}"`);
      if (missing.length) return moved(`the gateway registers as "${id}" (${relativeTo(ctx.source, file)})`, missing.join("; "));
      return ok(`gateway id "${id}" from ${relativeTo(ctx.source, file)}`);
    },
  },
  {
    // The page's sentence says how many tools carry the check: a second tool
    // would make "one tool" false, and a renamed tool would make the name false.
    id: "topic-drift-tool",
    claim: "the topic-drift sentence names one tool and the actions that tool takes",
    anchor: "topic_drift",
    section: "calibration",
    check(ctx) {
      const file = join(ctx.source, "packages/core/src/extensions/cognitive/topic-drift/index.ts");
      const src = readText(file);
      if (src === null) return unchecked(`cannot read ${file}`);
      const tools = [...src.matchAll(/^\s*name: "([a-z0-9_]+)",$/gm)].map((m) => m[1]);
      if (tools.length === 0) return unchecked(`no tool definition found in ${relativeTo(ctx.source, file)}`);
      const actions = [...new Set([...src.matchAll(/action=([a-z]+)/g)].map((m) => m[1]))];
      const missing = [];
      if (!new RegExp(`\\b(one|single) tool\\b`, "i").test(ctx.html)) missing.push("the page does not say the check is one tool");
      if (!/один инструмент/i.test(ctx.html)) missing.push("the Russian sentence does not say the check is one tool");
      for (const name of tools) if (!ctx.html.includes(name)) missing.push(`the page does not name the tool ${name}`);
      for (const action of actions) if (!ctx.html.includes(`action=${action}`)) missing.push(`the page does not name action=${action}`);
      if (tools.length !== 1) missing.push(`the extension now holds ${tools.length} tools (${tools.join(", ")})`);
      if (missing.length) return moved(`${relativeTo(ctx.source, file)}: ${tools.length} tool(s) [${tools.join(", ")}], actions [${actions.join(", ")}]`, missing.join("; "));
      return ok(`one tool "${tools[0]}", actions ${actions.map((a) => `action=${a}`).join(" and ")}`);
    },
  },
  {
    // The memory tool reaches three stores through different actions. Saying one
    // action crosses all three is the failure this row exists to catch.
    id: "memory-actions",
    claim: "the memory sentence names the action that reads each store",
    anchor: "reads the semantic store",
    section: "memory",
    check(ctx) {
      const file = join(ctx.source, "packages/core/src/extensions/memory/memory-agent-bridge/memory-tool.ts");
      const src = readText(file);
      if (src === null) return unchecked(`cannot read ${file}`);
      const block = src.match(/action:\s*StringEnum\(\s*\[([\s\S]*?)\]\s*,/);
      if (!block) return unchecked(`no action enum in ${relativeTo(ctx.source, file)}`);
      const actions = new Set([...block[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
      const required = ["recall_search", "episodes_search", "heuristics_list"];
      const absent = required.filter((action) => !actions.has(action));
      if (absent.length) return unchecked(`the action enum no longer holds ${absent.join(", ")} (${relativeTo(ctx.source, file)})`);
      const missing = [];
      for (const action of required) if (!ctx.html.includes(action)) missing.push(`the page does not name ${action}`);
      for (const stale of ["All three stores are cross-searchable", "Все три хранилища доступны для кросс-поиска"]) {
        if (ctx.html.includes(stale)) missing.push(`the page still says ${JSON.stringify(stale)}`);
      }
      if (missing.length) return moved(`one action per store: ${required.join(", ")} (${relativeTo(ctx.source, file)})`, missing.join("; "));
      return ok(`${required.length} actions named, one per store`);
    },
  },
  {
    // Authoring and measuring are separate procedures. The page attributed both
    // to one skill; the row reads which skill owns the file.
    id: "skill-split",
    claim: "the meta-improvement sentence leaves writing a skill to skill-authoring",
    anchor: "skill-authoring writes",
    section: "longloop",
    check(ctx) {
      const core = join(ctx.source, "packages/core/skills");
      const meta = readText(join(core, "meta-improvement/SKILL.md"));
      const author = readText(join(core, "skill-authoring/SKILL.md"));
      if (meta === null || author === null) return unchecked(`cannot read both ${relativeTo(ctx.source, core)}/meta-improvement/SKILL.md and skill-authoring/SKILL.md`);
      if (!/not for authoring/i.test(meta)) return unchecked("meta-improvement's description no longer says what it does not do, so the split cannot be read from it");
      const missing = [];
      if (!ctx.html.includes("meta-improvement")) missing.push("the page does not name meta-improvement");
      if (!ctx.html.includes("skill-authoring")) missing.push("the page does not name skill-authoring");
      for (const stale of ["meta-improvement creates and revises skills", "meta-improvement создаёт и пересматривает навыки"]) {
        if (ctx.html.includes(stale)) missing.push(`the page still says ${JSON.stringify(stale)}`);
      }
      if (missing.length) return moved("meta-improvement measures; skill-authoring writes the file (packages/core/skills/*/SKILL.md)", missing.join("; "));
      return ok("both procedures named, and the measuring one still disclaims authoring");
    },
  },
  {
    // A skill index is prose that names directories. Every name must resolve, or
    // a reader is sent to a skill that does not exist.
    id: "skill-names",
    claim: "every skill the index prints is a directory in one of the two packs",
    anchor: "The index below is a selection",
    section: "skills",
    check(ctx) {
      const core = join(ctx.source, "packages/core/skills");
      const satellite = join(ctx.source, "packages/skills/skills");
      if (!existsSync(core) || !existsSync(satellite)) return unchecked(`cannot read ${relativeTo(ctx.source, core)} and ${relativeTo(ctx.source, satellite)}`);
      const dirs = (root) => readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
      const known = new Set([...dirs(core), ...dirs(satellite).filter((name) => name !== "_shared")]);
      const listed = listedSkills();
      if (listed.length === 0) return unchecked("the page prints no skill index");
      const missing = [];
      for (const name of listed) {
        if (!known.has(name)) missing.push(`${name} (line ${lineOfPattern(new RegExp(`<span class="tn">[^<]*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^<]*<\\/span>`))})`);
      }
      if (missing.length) return moved(`directories in ${relativeTo(ctx.source, core)} and ${relativeTo(ctx.source, satellite)}`, `names that resolve to no directory: ${missing.join(", ")}`);
      return ok(`${listed.length} names, all resolving to a directory`);
    },
  },
  {
    // The page used to imply its index was the whole library. It prints 21 names
    // where the two packs hold 34, so the sentence must call itself a selection,
    // and the census is what decides whether that is still the true word.
    id: "skill-census",
    claim: "the index calls itself a selection, and the two packs hold more procedures than it lists",
    anchor: "The index below is a selection",
    section: "skills",
    check(ctx) {
      const core = join(ctx.source, "packages/core/skills");
      const satellite = join(ctx.source, "packages/skills/skills");
      if (!existsSync(core) || !existsSync(satellite)) return unchecked(`cannot read ${relativeTo(ctx.source, core)} and ${relativeTo(ctx.source, satellite)}`);
      const count = (root, skip) => readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && !skip.includes(e.name)).length;
      const census = count(core, []) + count(satellite, ["_shared"]);
      const listed = listedSkills().length;
      const missing = [];
      if (!/selection, not a census/.test(ctx.html)) missing.push("the English lede does not call the index a selection");
      if (!/выборка, а не перепись/.test(ctx.html)) missing.push("the Russian lede does not call the index a selection");
      if (listed >= census) missing.push(`the index lists ${listed} of ${census} procedures, so "selection" is no longer true`);
      if (missing.length) return moved(`the two packs hold ${census} procedure directories; the index lists ${listed}`, missing.join("; "));
      return ok(`${listed} listed of ${census} directories, so the index is a selection`);
    },
  },
  {
    // A settings path is correct when pi's own resolver returns a path that
    // exists. `file:` is not a scheme the resolver strips; a leading `~` is.
    id: "install-path",
    claim: "the settings snippet holds path forms pi resolves",
    anchor: "\"packages\"",
    section: "install",
    check(ctx) {
      const snippet = ctx.html.match(/<pre class="shell" style="margin-top:1rem">([\s\S]*?)<\/pre>/);
      if (!snippet) return unchecked("the page carries no settings snippet");
      const text = snippet[1].replace(/<[^>]*>/g, "");
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        return moved("a settings snippet that parses as JSON", `it does not parse: ${error.message}`);
      }
      const entries = Array.isArray(parsed.packages) ? parsed.packages : null;
      if (!entries || entries.length === 0) return moved("a non-empty packages array", "the snippet declares no packages");
      if (!ctx.resolvePath) return unchecked("pi's resolver was not found, so no path can be settled");
      const missing = [];
      for (const entry of entries) {
        if (typeof entry !== "string") { missing.push(`${JSON.stringify(entry)} is not a string`); continue; }
        if (/^file:/i.test(entry)) {
          missing.push(`${JSON.stringify(entry)}: pi strips file: only for a file:// URL, so this resolves to a path under the agent directory`);
        }
        const resolved = ctx.resolvePath(entry, ctx.agentDir, { homeDir: HOME, trim: true });
        const expected = entry.startsWith("~/") ? join(HOME, entry.slice(2)) : entry;
        if (entry.startsWith("~/") && resolved !== expected) missing.push(`${JSON.stringify(entry)} resolves to ${resolved}, not ${expected}`);
        if (resolved.includes("file:")) missing.push(`${JSON.stringify(entry)} resolves to ${resolved}, which contains the unparsed scheme`);
        const parts = entry.replace(/^~\//, "").split("/");
        if (parts[1] !== "packages") missing.push(`${JSON.stringify(entry)} points at no workspace under the checkout`);
        else if (!existsSync(join(ctx.source, "packages", parts[2]))) missing.push(`${JSON.stringify(entry)}: this checkout has no packages/${parts[2]}`);
      }
      if (missing.length) return moved("entries pi resolves to a checkout's packages/core and packages/skills", missing.join("; "));
      return ok(`${entries.length} entries resolve through pi's own resolvePath`);
    },
  },
  {
    // The page describes the render gate that measured it. The count of viewports
    // is read from that gate, which lives on a build branch of this repository
    // rather than in the published tree.
    id: "render-probes",
    claim: "the probes line states the viewport count the render gate measured",
    anchor: "render probes at",
    section: "built",
    check(ctx) {
      const found = renderGate(ctx);
      if (found.state) return found;
      const count = found.viewports.length;
      const desktop = found.viewports.filter((name) => name.startsWith("desktop")).length;
      const missing = [];
      const enCount = EN_NUMBER[count];
      const enDesktop = EN_NUMBER[desktop];
      if (!enCount || !enDesktop) return unchecked(`the render gate measures ${count} viewports (${desktop} desktop), and this gate has no word for that count`);
      if (!ctx.html.includes(`at ${enCount} viewport`)) missing.push(`the English line does not say "at ${enCount} viewport(s)"`);
      if (!ctx.html.includes(`${enDesktop} desktop width`)) missing.push(`the English line does not say "${enDesktop} desktop width(s)"`);
      if (!ctx.html.includes("tablet") || !ctx.html.includes("phone")) missing.push("the English line does not name tablet and phone");
      const ruLoc = RU_LOCATIVE[count];
      const ruNom = RU_NOMINATIVE[desktop];
      if (!ruLoc || !ruNom) return unchecked(`the render gate measures ${count} viewports (${desktop} desktop), and this gate has no Russian word for that count`);
      if (!ctx.html.includes(`на ${ruLoc} вьюпорт`)) missing.push(`the Russian line does not say "на ${ruLoc} вьюпорт(ах)"`);
      if (!ctx.html.includes(`${ruNom} ширины десктопа`)) missing.push(`the Russian line does not say "${ruNom} ширины десктопа"`);
      if (!ctx.html.includes("планшет") || !ctx.html.includes("телефон")) missing.push("the Russian line does not name планшет and телефон");
      if (missing.length) return moved(`the render gate measured ${count} viewports, ${desktop} of them desktop (${found.from})`, missing.join("; "));
      return ok(`${count} viewports, ${desktop} desktop, from ${found.from}`);
    },
  },
  {
    // The page's closing promise is a claim about its own claims. Its first half
    // is checkable: the rows above are the claims, and each one is either read or
    // named unchecked. Its second half is the script that does the reading.
    id: "end-self-claim",
    claim: "the closing lede states what the page can promise, and the rows above keep it",
    anchor: "A name can move as well as a number",
    section: "end",
    check(ctx, prior) {
      const missing = [];
      if (!ctx.html.includes("Every claim names the file that decides it")) missing.push("the closing lede does not say the claim names its file");
      if (!/script beside this page/.test(ctx.html)) missing.push("the closing lede names no script beside the page");
      if (ctx.html.includes("carry paths instead of figures")) missing.push("the closing lede still says a path never moves");
      const contradicted = prior.filter((row) => row.result.state === "moved").map((row) => row.id);
      if (contradicted.length) missing.push(`the rows above contradict it: ${contradicted.join(", ")}`);
      if (missing.length) return moved("a promise the rows above can keep", missing.join("; "));
      return ok(`${prior.length} rows above hold`);
    },
  },
  {
    // The head describes the page to a search engine. It carried the same
    // absolute promise as the closing lede, so it carries the same correction.
    id: "head-self-claim",
    claim: "the page description promises only what the page can show",
    anchor: "A presentation about Braid",
    section: null,
    check(ctx, prior) {
      const description = ctx.html.match(/<meta name="description" content="([^"]*)">/);
      if (!description) return unchecked("the page carries no meta description");
      const missing = [];
      if (!description[1].includes("Every claim names the file")) missing.push("the description does not say the claim names its file");
      if (!/script beside this page/.test(description[1])) missing.push("the description names no script beside the page");
      const contradicted = prior.filter((row) => row.result.state === "moved").map((row) => row.id);
      if (contradicted.length) missing.push(`the rows above contradict it: ${contradicted.join(", ")}`);
      if (missing.length) return moved("a description that promises only what the rows can show", missing.join("; "));
      return ok(`${prior.length} rows above hold`);
    },
  },
];

const EN_NUMBER = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const RU_LOCATIVE = [null, "одном", "двух", "трёх", "четырёх", "пяти", "шести", "семи", "восьми", "девяти", "десяти", "одиннадцати", "двенадцати"];
const RU_NOMINATIVE = [null, "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять", "десять", "одиннадцать", "двенадцать"];

// The render gate is not shipped: the published tree is the page and the checks
// that read it. The gate that measured the page lives on a build branch, so this
// reads the object without checking anything out. Two branches that disagree
// about the viewport list leave the row unsettled rather than picking one.
function renderGate(ctx) {
  if (ctx.contractPath) {
    const text = readText(ctx.contractPath);
    if (text === null) return unchecked(`cannot read ${ctx.contractPath}`);
    return parseViewports(text, ctx.contractPath);
  }
  const refs = spawnSync("git", ["-C", ctx.deckDir, "for-each-ref", "--format=%(refname)", "refs/heads"], { encoding: "utf8" });
  if (refs.status !== 0) return unchecked("this working tree is not a git repository, so no build branch can be read");
  const found = [];
  for (const ref of refs.stdout.split("\n").filter(Boolean)) {
    const exists = spawnSync("git", ["-C", ctx.deckDir, "cat-file", "-e", `${ref}:scripts/deck-gate.mjs`]);
    if (exists.status !== 0) continue;
    const show = spawnSync("git", ["-C", ctx.deckDir, "show", `${ref}:scripts/deck-gate.mjs`], { encoding: "utf8" });
    if (show.status === 0) found.push(parseViewports(show.stdout, `${ref}:scripts/deck-gate.mjs`));
  }
  if (found.length === 0) return unchecked("no local branch carries scripts/deck-gate.mjs; pass --contract <file> to name the render gate to read");
  if (found.some((entry) => entry.state)) return found.find((entry) => entry.state);
  const shapes = new Set(found.map((entry) => entry.viewports.join(",")));
  if (shapes.size > 1) return unchecked(`the build branches disagree about the viewport list (${[...shapes].join(" vs ")})`);
  return found[0];
}

function parseViewports(text, from) {
  const block = text.match(/viewports:\s*\[([\s\S]*?)\]/);
  if (!block) return unchecked(`no viewports array in ${from}`);
  const viewports = [...block[1].matchAll(/name:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  if (viewports.length === 0) return unchecked(`the viewports array in ${from} names none`);
  return { viewports, from };
}

// ── Run ──────────────────────────────────────────────────────────────────────

const source = findSource(opts);
const pi = findPi(opts);
const ctx = {
  html,
  deckDir,
  source,
  pi,
  contractPath: opts.contract ? resolve(opts.contract) : null,
  agentDir: process.env.PI_CODING_AGENT_DIR ? resolve(process.env.PI_CODING_AGENT_DIR) : join(HOME, ".pi/agent"),
  resolvePath: null,
};
if (pi && existsSync(join(pi, "dist/utils/paths.js"))) {
  try {
    const paths = await import(pathToFileURL(join(pi, "dist/utils/paths.js")).href);
    ctx.resolvePath = paths.resolvePath ?? null;
  } catch {
    ctx.resolvePath = null;
  }
}

const results = [];
for (const row of ROWS) {
  const prior = results.map((entry) => ({ id: entry.id, result: entry.result }));
  let result;
  try {
    result = await row.check(ctx, prior);
  } catch (error) {
    result = unchecked(`${error && error.message ? error.message : error}`);
  }
  results.push({ id: row.id, claim: row.claim, line: locate(row), result });
}

// A failure has to be findable. The sentence's own line is used when its text is
// still on the page; when the text a row looks for is what went missing, the
// enclosing spread's opening line is the next honest answer, and it says so.
function locate(row) {
  const direct = lineOf(row.anchor);
  if (direct !== null) return `line ${direct}`;
  if (row.section) {
    const head = lineOf(`<section class="spread" id="${row.section}">`);
    if (head !== null) return `line ${head} (section head)`;
  }
  return "line ?";
}

// ── Report ───────────────────────────────────────────────────────────────────

const bytes = statSync(opts.file).size;
console.log(`file:   ${opts.file} (${bytes} bytes, ${html.split("\n").length} lines)`);
console.log(`source: ${source}${existsSync(source) ? "" : "  (missing)"}`);
console.log(`pi:     ${pi ?? "(not found; the settings row cannot settle a path)"}`);
console.log("");
for (const entry of results) {
  const where = entry.line;
  if (entry.result.state === "ok") {
    console.log(`  ok         ${entry.id.padEnd(15)} ${where.padEnd(10)} ${entry.result.detail}`);
  } else if (entry.result.state === "moved") {
    console.log(`  FAIL       ${entry.id.padEnd(15)} ${where.padEnd(10)} ${entry.claim}`);
    console.log(`             expected: ${entry.result.expected}`);
    console.log(`             found:    ${entry.result.found}`);
  } else {
    console.log(`  unchecked  ${entry.id.padEnd(15)} ${where.padEnd(10)} ${entry.result.reason}`);
  }
}

const en = spanCount("en");
const ru = spanCount("ru");
console.log("");
console.log(`document: ${en} lang-en spans, ${ru} lang-ru spans${en === ru ? " (parity holds)" : " (PARITY BROKEN)"}`);

const checked = results.filter((entry) => entry.result.state === "ok").length;
const failures = results.filter((entry) => entry.result.state === "moved");
const unknown = results.filter((entry) => entry.result.state === "unchecked");
console.log(`checked ${checked} of ${results.length} claims, ${failures.length} moved, ${unknown.length} unchecked`);

if (failures.length > 0 || en !== ru) {
  console.log("RESULT: FAIL");
  process.exit(1);
}
if (unknown.length > 0) {
  console.log("RESULT: UNCHECKED");
  process.exit(3);
}
console.log("RESULT: PASS");
