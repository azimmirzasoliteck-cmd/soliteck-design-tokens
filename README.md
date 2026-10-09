# 🎨 Soliteck Unified Design Tokens Pipeline

Welcome to the single source of truth for Soliteck's design infrastructure. This repository acts as an automated engineering handshake, translating design tokens created in Figma into platform-ready Tailwind CSS configurations using **Style Dictionary** and **GitHub Actions**.

## 🏗️ The 2-Tier Token Architecture

To maintain cross-platform flexibility, our design variables follow a strict 2-tier architectural token taxonomy. Do not hardcode values directly into UI components.

1. **Tier 1: Global / Base Tokens (`global.json`)**
   * Context-agnostic raw design values (e.g., `color.slate.500: #2A2A72`, `spacing.4: 16px`).
   * *Safe to edit:* Changing a value here updates the entire visual theme instantly without altering code keys.
2. **Tier 2: Semantic / Alias Tokens (`semantic.json`)**
   * Contextual, functional variables that describe intent (e.g., `bg.action.primary`, `padding.md`).
   * *Locked Contracts:* These reference Tier 1 tokens. Do not change their names without notifying engineering.

---

## 🚀 Automated CI/CD Handoff Flow

No more manual asset handoffs, Slack exchanges, or detached JSON file sharing. The pipeline is fully automated:

┌──────────────┐      Tokens Studio      ┌────────────────────────┐     GitHub Actions      ┌───────────────────────────┐
│  Figma UI    │  ────────────────────>  │   GitHub Repository    │  ─────────────────────>  │ Compiled Tailwind Output  │
│  Variables   │   Automated Sync Push   │  (Raw Token JSON Data) │  Runs Style Dictionary   │ (build/web/tailwind-tokens)│
└──────────────┘                         └────────────────────────┘                          └───────────────────────────┘
1. **Design Layer:** Designers update or add properties inside the Figma **Tokens Studio** workspace.
2. **Sync Action:** Pushing variables from the plugin pushes updates straight to `tokens.json` in this repository.
3. **Compilation Server:** GitHub Actions detects the change, builds the node engine, and passes the schema through **Style Dictionary**.
4. **Engineering Review:** The system generates compiled utility targets at `build/web/tailwind-tokens.js` and automatically opens a clean **Pull Request (PR)** for review.

---

## 🛠️ Protocols for Design & Engineering

### 🟢 Adding New Tokens (Safe Action)
Feel free to add new tokens in Figma as required by product expansions. When you push, the engine makes them immediately available in the upcoming PR file tree for developers to reference in their components.

### ⚠️ Renaming Existing Tokens (Breaking Action)
Renaming a semantic token contract will break the current live application build if code strings are left unmapped. Follow this protocol:
1. **Communicate:** Alert the frontend engineering squad before saving name refactors.
2. **Find & Replace:** When the automated PR generates, developers must run a global search-and-replace to match code properties to the new token names *before* merging the pull request into production.

---

## ⚙️ Local Development Scripts

To audit or test style dictionary structural compilations locally on your machine, initialize your dependencies and run the build compiler manually:

```bash
# Install required build environments
npm install

# Run localized compilation sequences
npm run build-tokens
```
