# HouseholdOS

A mobile app for managing a shared home: groceries, pantry inventory, chores, and expenses in one place.

Built for roommates, couples, and families using **React Native, Expo, TypeScript, and Supabase**. This repository contains an ongoing personal project, not a released production app.

## What is in the project?

- **Kitchen:** household food inventory and grocery management.
- **Tasks:** shared chores, recurring schedules, rotation, and completion history.
- **Money:** shared bills, expenses, and household balances.
- **Scanning:** barcode lookup and receipt import with a review step.
- **Household sync:** Supabase-backed data and realtime updates.

These areas have implementation code in the repository. End-to-end behavior depends on backend configuration and device testing.

## Technical overview

| Area | Technology |
| --- | --- |
| Mobile UI and navigation | React Native, Expo SDK 54, Expo Router |
| Language | TypeScript |
| Server state and caching | TanStack Query |
| Client state | Zustand |
| Database and backend | Supabase, SQL migrations, Edge Functions |
| Animation | React Native Reanimated |

## Where to start reading

| Location | Purpose |
| --- | --- |
| [src/features](src/features) | Feature modules for kitchen, tasks, money, and scanning |
| [src/lib](src/lib) | Supabase client, database types, and query configuration |
| [src/hooks/use-household-realtime-sync.ts](src/hooks/use-household-realtime-sync.ts) | Realtime household synchronization |
| [supabase/migrations](supabase/migrations) | Database schema and server-side operations |
| [supabase/functions](supabase/functions) | Barcode lookup and receipt-processing endpoints |
| [supabase/tests/database](supabase/tests/database) | Database tests |
| [docs/development](docs/development) | Detailed milestone reports and plans |

## Run locally

1. Install dependencies: `npm ci`.
2. Copy [.env.example](.env.example) to `.env` and fill in your Supabase URL and publishable key.
3. Configure a Supabase project with the migrations in `supabase/migrations`. Scanning also requires the corresponding Edge Functions and their service configuration.
4. Run `npm start` and select a supported Expo development environment.

Only client-safe values belong in `EXPO_PUBLIC_*` variables. Keep server credentials outside the mobile app.

## Checks

```bash
npm run lint
npm test
```

The test scripts cover money, task, and receipt-processing logic. Database tests live separately under `supabase/tests/database`.

## Project status

Active development. The milestone documents record implementation details and future work; they are not a claim that every planned feature is complete.
