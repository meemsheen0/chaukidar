# چوکیدار · Chaukidar

**The watchman for your repo.** Chaukidar scans your code for hardcoded PII and secrets — emails, phone numbers, SSNs, credit cards, IPs, and API keys — and flags them before they land on `main`. Runs as a GitHub Action or a CLI / pre-commit hook.

> *Chaukidar* (چوکیدار) is the Urdu word for a night watchman — the one who stands guard at the gate.

---

## Why

The easiest way to leak personal data isn't a sophisticated breach — it's a real email in a test fixture, a customer's phone number in a seed file, or an API key pasted into a config. Chaukidar catches those at the gate.

It's **regex-first and dependency-free**, so it's fast and safe to run in CI. A privacy tool shouldn't itself be a liability — Chaukidar never sends your code anywhere (the optional LLM layer is opt-in and off by default; see [Roadmap](#roadmap)).

## Quick start — GitHub Action

```yaml
# .github/workflows/pii-scan.yml
name: PII Scan
on: [pull_request]

jobs:
  chaukidar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0          # needed for "changed files" mode
      - uses: meemsheen0/chaukidar@v1
        with:
          fail-on: high           # off | low | medium | high
          scan: changed           # changed | all
```

Findings show up as inline annotations on the PR diff plus a job-summary table. If anything at/above `fail-on` is found, the check fails.

## Quick start — CLI

```bash
npx chaukidar scan .
npx chaukidar scan . --fail-on=medium --scan=all
```

As a pre-commit hook (with [husky](https://typicode.github.io/husky/) or similar):

```bash
npx chaukidar scan . --scan=changed --fail-on=high
```

## What it detects

| Type | Severity | Notes |
| --- | --- | --- |
| Email address | medium | dummy domains (`example.com`, `test@…`) allowlisted |
| Phone number | medium | NANP / E.164; `555-01xx` test range ignored |
| US SSN | high | invalid area/group/serial ranges excluded |
| Credit card | high | Luhn-validated to cut false positives |
| IP address | low | private / reserved ranges skipped |
| API key / token | high | AWS, GitHub, OpenAI, Slack, Google, Stripe, JWT, private keys |

Matches are always **masked** in output (`jo******hn`) so Chaukidar never reprints a full secret.

## Configuration

Drop a `.chaukidar.yml` in your repo root (see [`.chaukidar.example.yml`](./.chaukidar.example.yml)):

```yaml
fail-on: high
scan: changed
ignore:
  paths:
    - "test/fixtures/**"
  patterns:
    - "support@meemsheen.com"
detectors:
  ip-address: off
```

CLI flags override the config file.

## How it works

A small, layered pipeline:

1. **Walk** the file tree (or just `git diff` in `changed` mode), skipping binaries, `node_modules`, and ignored globs.
2. **Detect** — each detector inspects a line and returns findings with a severity and confidence.
3. **Allowlist** — obvious placeholders and your configured exceptions are dropped, so the first run isn't all noise.
4. **Report** — console output, GitHub annotations, and a Markdown job summary; exit code set by your `fail-on` threshold.

Detectors live in [`src/detectors/`](./src/detectors) — one file each, easy to add or contribute.

## Roadmap

- **v1** *(this release)* — regex + heuristics, GitHub Action + CLI.
- **v2** — local NER model to catch names and entities in free text (offline, no network).
- **v3** — opt-in, provider-agnostic LLM pass for context-aware detection (quasi-identifiers, sensitive categories). Default off; supports local models; only ever sees candidate snippets, never the whole repo.

## Development

```bash
npm install
npm run build
node dist/cli.js scan .
```

## License

MIT
