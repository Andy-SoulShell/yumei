# ADR 0001 — Toolchain choices for local development

- **Status:** Accepted
- **Date:** 2026-04-29
- **Decision-makers:** Project owner; Claude (assistant)

## Context

The MVP ships without an opinion on local-dev tooling. A new contributor on
macOS would need to invent their own setup for Node, package manager, and
MySQL. We want a predictable bootstrap path that:

- works on Apple Silicon (the owner's machine);
- aligns with the production target (containers on Railway);
- gives version pinning so CI and contributors share runtimes;
- requires no proprietary licenses.

## Decision

| Concern              | Choice                             | Alternatives considered            |
| -------------------- | ---------------------------------- | ---------------------------------- |
| OS package manager   | **Homebrew**                       | MacPorts, Nix                      |
| Node version manager | **mise**                           | nvm, fnm, asdf, Volta              |
| Node runtime         | **Node 22 LTS** (`22.22.2` pinned) | Node 20 (older), Node 24 (current) |
| JS package manager   | **pnpm 10**                        | npm, yarn, bun                     |
| Container runtime    | **OrbStack**                       | Docker Desktop, Colima, podman     |
| Local DB             | **MySQL 8 in docker**              | host MySQL via brew, sqlite-shim   |

Versions are pinned in:

- `.tool-versions` — `node 22.22.2` (read by mise/asdf)
- `package.json` — `"packageManager"` field (TODO Phase 0 follow-up)
- `docker pull mysql:8` — image tag

## Rationale

- **Homebrew** is the de-facto macOS package manager. No friction onboarding.
- **mise** is asdf's spiritual successor — single binary, faster, supports
  `.tool-versions` (asdf-compatible) so anyone using asdf today still works.
  Picked over nvm because nvm is bash-init-time only and doesn't pin the
  PNPM/Python/Java side. Picked over Volta because mise's project-local
  pinning ergonomics are better.
- **Node 22 LTS**: tsx + Vite 7 + Drizzle Kit all need ≥ 20; LTS gives us
  3-year support. Node 24 is current but not LTS yet.
- **pnpm**: the project already ships `pnpm-lock.yaml`. Switching cost = 0.
  Side benefit: pnpm's strict-store catches phantom-deps issues that npm
  silently passes.
- **OrbStack** over Docker Desktop:
  - free for personal use;
  - lower CPU/RAM footprint (no Electron UI);
  - faster filesystem on Apple Silicon (virtiofs + APFS);
  - the docker CLI is bit-compatible — no project-side change needed.
- **MySQL in docker** (vs `brew install mysql`): mirrors what we'll deploy on
  Railway, so we don't get bitten by macOS-only collation defaults.

## Consequences

- Contributors on Linux must `apt install mise pnpm docker.io` (or
  equivalent) — we'll add a Linux section to `README.md` in Phase 5.
- Contributors on Windows must use WSL 2 — same as above. We won't support
  PowerShell-native flows.
- `mise` activation needs to be in shell init. The Phase 0 README will tell
  users to add `eval "$(mise activate zsh)"` to `~/.zprofile`.
- The MySQL container is **not** managed by `docker-compose` yet — Phase 5
  introduces compose for the full local stack. For now a single
  `docker run -d --name yumei-mysql ...` is enough.

## Follow-ups

- [ ] Add `"packageManager": "pnpm@10.x.x"` to `package.json` (Phase 0
      cleanup commit).
- [ ] Phase 5: introduce `docker-compose.yml` and replace ad-hoc
      `docker run` instructions in the README.
- [ ] Phase 5: GitHub Actions runner Node version reads from
      `.tool-versions` (`actions/setup-node` v4 supports this).
