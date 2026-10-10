# Loot Manager

This independent multi-tenant guild loot application uses a separate Supabase project. The existing Stoics website and database are not modified.

## Supabase setup

1. Run `supabase/001_loot_manager.sql` in the new project's SQL Editor.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Sites environment settings.
3. Add `SUPABASE_SECRET_KEY` as a secret (or legacy `SUPABASE_SERVICE_ROLE_KEY`). Never use a `NEXT_PUBLIC_` name for the server key.
4. Publish after the migration and server secret are configured. Updating runtime variables requires a deployment to apply them.

Sites still hosts the website and provides ChatGPT sign-in. Supabase stores the guild records. The publishable key alone cannot authorize these server operations because ChatGPT identity is not a Supabase Auth JWT.

All application tables use the `loot_manager_` prefix with RLS enabled and direct access revoked from `anon` and `authenticated`. Only the backend's server key can call the operation function. The application and SQL function verify guild membership and role. Create-guild and accept-invitation operations are atomic. Ledger updates use an expected version so concurrent changes cannot silently overwrite each other.

The server key is used only for Supabase HTTPS requests; it is never sent to the browser or placed in a build manifest. No old credentials or webhook URLs are copied. No automatic fallback to D1 is implemented.

## Use

Sign in at `/login`, create or select a guild at `/guilds`, then invite managers using their ChatGPT account email in `/settings`. Share the generated invitation link yourself. Links expire after seven days. Owners can invite admins; owners and admins can invite managers and revoke access.

Protected pages are `/overview`, `/dungeon-runs`, `/loot-inventory`, `/sales`, `/statistics` and `/member-search`. Published guilds have `/shop?guild=<slug>` and `/inquiries?guild=<slug>`. Private guilds do not appear in the public directory. There is no member showcase page. Hosting audience controls are separate from guild publication.

## Development and validation

`npm ci`, `npm run test:supabase`, `npx tsc --noEmit` and `npm run build` validate the project. The PostgreSQL tests use an in-memory PGlite database, not production. `node --experimental-strip-types --test lib/run-party.test.mjs` checks run-specific member edits. `scripts/test-tenancy.mjs` exercises a local app with a separate disposable Supabase project and refuses non-local application URLs.

Local runtime configuration comes from ignored `.env` files. Production configuration is stored in Sites environment variables. Apply the SQL migration in Supabase; Sites does not apply it automatically.
