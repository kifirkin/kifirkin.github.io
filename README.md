# braid presentation

The deck, served at **https://kifirkin.github.io/**

About [braid](https://github.com/kifirkin/pi-braid) — an orchestrator layer for pi.

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
