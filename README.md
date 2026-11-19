# braid presentation

The deck, served at **https://kifirkin.github.io/**

About [braid](https://github.com/kifirkin/pi-braid) — an orchestrator layer for pi.

## No figures about the codebase

The page states capabilities in words: no version, no tally of tools, skills,
tests or files. A figure ages between releases, and a reader cannot tell which
ones still hold. Where a number survives, it is one a routine release cannot
change and the gate reads: the viewport list of this page's render gate.

## The facts gate

The page names the file that decides each of its claims: a provider id, a tool
name, a skill directory, a settings path. Those names live in another repository
and move when it moves, so `check-facts.mjs` reads them back and fails on the
page's own line when one has changed.

```bash
git clone https://github.com/kifirkin/pi-braid.git ../pi-braid   # if you have no checkout
npm run check                                                     # or: node check-facts.mjs
```

It reads four things: this page, a pi-braid checkout (`--source`, default
`../pi-braid`), pi's own path resolver for the settings snippet (`--pi`), and the
render gate on a build branch of this repository for the viewport count. A row
whose source cannot be read is reported unchecked, never as a pass; the run
prints how many claims it checked. A clone of the published branch carries no
build branch, so the viewport row reports unchecked there and names what it
needs; `--contract <file>` points it at a copy of that gate.

Exit codes: `0` every row checked and holds; `1` a claim moved, or the two
languages no longer carry the same number of spans; `2` the page cannot be read;
`3` at least one row could not be read. A moved claim outranks an unchecked row,
so a red run names the sentence to fix first.

### In CI

`.github/workflows/check-facts.yml` runs the gate on every push to `main` and on
any pull request. It clones pi-braid at its published branch and installs the pi
package the install section names, so three of the gate's four inputs are there.
The fourth is the build branch that carries the render gate, which no public
clone has: that row reports unchecked, and the workflow turns exit `3` into a
warning that names it instead of a red run nobody reads. A moved claim (exit
`1`) and an unreadable page (exit `2`) fail the job.

CI reads pi-braid's published branch, not your checkout. A page updated ahead of
that branch fails there until the tree is published, so run the gate locally
against your own checkout before trusting a green job.
