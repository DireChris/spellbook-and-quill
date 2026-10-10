# Spellbook & Quill

A local-first Dungeons & Dragons campaign companion for desktop. Built with Electron, React, TypeScript, Tailwind CSS, Tiptap, and SQLite (`sql.js` WebAssembly). Campaign records live in the operating system's app-data folder; the app has no account, cloud sync, analytics, or network service dependency.

## Features

- **Session journal:** rich-text notes, headings, lists, bold/italic/underline/strike/code, links, undo/redo, browser/Electron spell-check, styled read-aloud callouts, autosave, dedicated tags, and inline `#tag` suggestions.
- **Global search:** searches note content, quest names/rewards/objectives/notes, the scratch pad, NPC profiles, NPC encounter logs, loot, and tag names. Tags can be edited directly on search-result cards.
- **Quest board:** giver/faction, status, rewards, notes, main and side objectives, objective completion, editing, and deletion.
- **Party vault:** PP/GP/SP/CP ledger, GP-equivalent value, item quantity/value, item type, description, tags, and removal.
- **NPC directory:** searchable name/faction/location/attitude profiles and append-only encounter logs.
- **Character reference:** ability scores/modifiers, HP, AC, initiative, speed, proficiency, passive scores, clickable spell/ability/attack cards, and a roll log. Dice formulas are validated and rolled in Electron's main process with cryptographic random integers.
- **Persistent side rail:** scratch pad with debounced autosave and collapsible character reference panel.
- **Seed campaign:** first launch creates a small example adventure so every module has content to explore. The seed only runs when no notes exist.

## Quick start

Requirements: Node.js 22+ (recommended), npm, and a platform that Electron supports. The database uses sql.js (SQLite compiled to WebAssembly), so it does not require native C/C++ compilation tools.

```bash
npm install
npm run dev
```

Typecheck and production build:

```bash
npm run typecheck
npm run build
```

Package for the current platform:

```bash
npm run package:dir
```

Installable builds (run the matching script on the target operating system):

```bash
npm run package:win
npm run package:mac
npm run package:linux
```

The database dependency (`sql.js`) is SQLite compiled to WebAssembly. There is no native SQLite addon, `node-gyp` compilation, or `electron-builder install-app-deps` postinstall step required. The app loads the SQLite file into memory and atomically exports changes to `spellbook-and-quill.sqlite` in the Electron `userData` directory.

## Project structure

```text
spellbook-and-quill/
├── docs/
│   └── database-schema.sql       # Full SQLite schema
├── src/
│   ├── main/
│   │   ├── index.ts              # BrowserWindow, IPC handlers, security policy
│   │   └── database.ts           # Schema creation, seed data, CRUD, search, dice rolls
│   ├── preload/
│   │   └── index.ts              # Narrow, typed contextBridge API
│   ├── renderer/
│   │   ├── components/
│   │   │   ├── CharacterPanel.tsx
│   │   │   ├── NoteEditor.tsx
│   │   │   ├── ScratchPad.tsx
│   │   │   ├── SearchResultList.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TagEditor.tsx
│   │   │   ├── Topbar.tsx
│   │   │   └── VaultPeek.tsx
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── NotesPage.tsx
│   │   │   ├── NpcsPage.tsx
│   │   │   ├── QuestsPage.tsx
│   │   │   └── VaultPage.tsx
│   │   ├── App.tsx               # App state, IPC orchestration, autosave/search
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── styles.css            # Tailwind layers + atmospheric application styling
│   └── shared/
│       ├── types.ts              # Shared renderer/main-process contracts
│       └── window.d.ts           # Typed preload bridge for the renderer
├── electron.vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── package.json
```

## SQLite schema and storage

The canonical SQL definition is in [`docs/database-schema.sql`](docs/database-schema.sql). Runtime initialization is currently implemented in `src/main/database.ts` so the app can apply pragmas and seed example content. The schema contains:

| Table | Purpose |
|---|---|
| `notes` | Tiptap HTML, note kind, creation/update timestamps |
| `quests`, `objectives` | Quest metadata, status, ordered main/side objectives |
| `npcs`, `npc_logs` | Directory entries and dated conversation/encounter records |
| `scratch_pad` | A single persistent quick-note entry |
| `party_currency`, `loot_items` | Party coin totals and item inventory |
| `tags`, `taggings` | Shared tags across note, quest, scratch, NPC, NPC log, and loot records |
| `characters`, `abilities`, `roll_log` | Character reference, rollable formulas, and roll history |

The SQLite file is `spellbook-and-quill.sqlite` inside Electron's `app.getPath('userData')` directory. Typical locations are `%APPDATA%/spellbook-and-quill/` on Windows, `~/Library/Application Support/spellbook-and-quill/` on macOS, and `~/.config/spellbook-and-quill/` on Linux (the exact folder name is managed by Electron and may vary by platform). Back up the database with the app closed; the app flushes pending changes and closes its in-memory database on shutdown.

## Security and design notes

- `nodeIntegration` is disabled; `contextIsolation` and renderer sandboxing are enabled.
- The renderer never imports SQLite or Node APIs. It can call only the explicit methods defined in `src/preload/index.ts`.
- Main-process IPC handlers reject calls from unexpected renderer URLs. User-provided content is stored locally and is not sent to a remote service.
- Roll expressions accept only `NdM`, `NdM+K`, or `NdM-K` with count/sides/modifier limits. They are parsed as numbers and never executed as code.
- All database values are passed through prepared statements. Rich-text note HTML is not rendered with `dangerouslySetInnerHTML` in the dashboard/search previews.
- Global search uses parameterized `LIKE` queries for portability and understandable partial matching. It is suitable for a personal campaign archive; if a campaign grows to hundreds of thousands of records, an FTS5 index would be a sensible next optimization.

## Current scope

This repository is a complete, runnable local application scaffold with functional core CRUD flows and a sample dataset. It is not a D&D rules engine: ability formulas are the rolls stored on each card, not a substitute for the full ruleset. Character statistics and the seeded ability list are reference data; editing those stats is an obvious extension point.

## Character Sheet & JSON Import

The Campaign Desk now includes a **Character Sheet** page. Edit the character identity, level, hit points, AC, initiative, speed, proficiency bonus, passive scores and all six ability scores. The same page lets you add, edit and remove the spell/ability/attack cards shown in the right-side Character Reference. Save writes these values to the local SQLite database.

Use **Export JSON** to back up the character and ability cards. **Import JSON** reads a user-selected local file into the form for review; it does not update the database until you press Save. The importer understands this app's own JSON format, common Roll20-style `attributes` / `attribs` arrays or objects, and common D&D Beyond-style `stats` arrays (ability IDs 1–6) when such a JSON file is available. Data structures vary by export source, so review the imported fields before saving. There is no direct login, scraping, or bypass of either service.

A starter JSON file is available at `docs/character-import-template.json`.

## Right-side Field Kit Scrolling

The right-side field kit has its own vertical scroll area. Character Reference, Party Vault and Scratch Pad cards retain their content height instead of shrinking, so the lower parts of the field kit can be reached by scrolling inside that rail.
