# GridPulse — Smart EV Charging & Grid Management

GridPulse is a real-time dashboard for managing EV charging within a building's
grid capacity envelope. It pairs a deterministic, explainable charging
allocator with live telemetry: solar generation, building demand, and
transformer headroom — so every charging decision is visible and justified.

## Features

- **Deterministic allocation** — two-phase control: priority service at full
  rate, then priority-weighted fair sharing of remaining headroom. The budget
  follows the transformer-import invariant so grid capacity can never be
  violated, including during solar surplus.
- **Explainable queue** — every vehicle exposes priority factors, status
  (charging / throttled / constraint-limited / scheduled / waiting /
  completed), energy needed, ETA, and honest reason strings for its rank and
  power level.
- **Live telemetry** — rolling power-demand chart, energy-flow topology, and
  scenario presets (normal / peak / solar surplus).
- **Persistent state** — simulation state syncs to Supabase with debounced
  saves.

## Tech stack

- [TanStack Start](https://tanstack.com/start) (SSR) + React 19 + TypeScript
- Tailwind CSS v4 (cyan/yellow instrument-panel theme)
- Recharts, Radix UI, lucide-react
- Supabase (state persistence)
- Vite + Nitro (Cloudflare Workers target)

## Getting started

```sh
npm i
cp .env.example .env.local   # then fill in your Supabase project values
npm run dev
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase publishable (anon) key |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Lint with ESLint |
| `npm run format` | Format with Prettier |

## Project structure

```
src/
  components/
    grid/          # GridPulse feature components (queue, charts, flow, controls)
    ui/            # Generic UI primitives (shadcn/radix)
  hooks/           # Shared React hooks
  integrations/
    supabase/      # Supabase client, SSR client, types
  lib/
    grid/          # Allocation engine, status taxonomy, persistence
  routes/          # TanStack Router routes
  server.ts        # SSR entry with error normalization
```

## Deployment

The app builds with Nitro and targets Cloudflare Workers, but deploys
anywhere Nitro presets are supported. On Vercel, `vercel --prod` builds and
deploys with zero extra config.
