# Agent guidelines

## Git workflow

- Never rewrite published git history (no force pushes, rebases, amends, or
  squashes of commits already pushed to `origin/main`).
- Keep `main` in a working state — the branch syncs to the deployed site.

## Commands

- Package manager: **npm** (lockfile: `package-lock.json`).
- Dev: `npm run dev` — dev server on port 8080.
- Build: `npm run build`; typecheck via build output.
- Lint: `npm run lint`; format: `npm run format`.

## Conventions

- TanStack Start with SSR; server entry is `src/server.ts`.
- Tailwind CSS v4 theme tokens live in `src/styles.css` (`--primary` is the
  cyan accent, `--solar` the yellow accent). Prefer token classes
  (`text-primary`, `bg-solar/10`) over raw hex/oklch values in components.
- Path alias `@/` → `src/`.
- The EV allocation engine (`src/lib/grid/`) is pure and deterministic —
  keep it free of React imports.
- Never commit `.env*` files; they are gitignored.
