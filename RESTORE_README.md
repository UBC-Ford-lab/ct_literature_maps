# lit-map — restore notes

**Last updated:** 2026-05-29

## What happened
To save disk space, three regenerable folders were deleted from this local copy:

| Deleted | Size | How to get it back |
|---------|------|--------------------|
| `node_modules/` | ~587 MB | `npm install` |
| `dist/` | ~26 MB | `npm run build` |
| `.git/` | ~111 MB | re-clone (see below) — this copy is no longer a git repo |

Everything you actually wrote (the `src/` code, configs, `examples/`, and the
`public/data/` visualization data) is **still here** and untouched.

## Where the repo lives
- **GitHub:** https://github.com/UBC-Ford-lab/ct_literature_maps
- **Branch / commit this copy matched when trimmed:** `main` @ `ae0a5dfd26302df8bf4a4fec4274239d7e8bcf3f`
- At the time of trimming, local `main` was fully in sync with `origin/main`
  and all Git LFS objects were confirmed pushed — nothing was lost.

## How to get it running again

### Option A — keep this local copy (fastest)
Since `src/`, `public/data/`, and configs are all still here, you only need deps:
```bash
cd lit-map
npm install        # restores node_modules
npm run dev        # start the dev server (Vite)
# or:
npm run build      # regenerates dist/
npm run preview    # serve the production build
```

### Option B — start fresh from GitHub
```bash
git clone https://github.com/UBC-Ford-lab/ct_literature_maps.git
cd ct_literature_maps
git lfs pull       # pulls the large data files in public/data/ (LFS)
npm install
npm run dev
```

## Notes
- **npm** is the package manager (a `package-lock.json` is present). No specific
  Node version is pinned in `package.json`; a recent LTS Node should work.
- Scripts available: `dev`, `build`, `lint`, `preview`.
- **Git LFS** tracks `public/data/*.json` and `public/data/*.bin` (see
  `.gitattributes`). Those data files are present in this local copy; if you
  re-clone, run `git lfs pull` to fetch them.
- This folder is **no longer a git repo** (`.git` was removed). To reconnect it
  to GitHub, either re-clone (Option B) or run `git init` + add the remote.

## Related — IMPORTANT
The raw paper data (downloaded abstracts, references, author info) lives in the
sibling folder `../semantic-pipeline/` — that folder is **NOT** on GitHub and is
**not** backed up anywhere. Do not delete it without backing it up first.
