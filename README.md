# Loot Manager

Independent playground loot management. Uses the new Supabase project; the Stoics site and its database remain separate.

## Setup

Run `supabase/001_loot_manager.sql`, then `002_playgrounds_accounts_plans.sql`, `003_public_features.sql`, and `004_discord_and_plan_pauses.sql` in order. Keep `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SECRET_KEY` in Sites environment settings.

Enable Supabase email/password registrations and email confirmation. Set Site URL to `https://loot-manager.lokwensio.com` and allow `https://loot-manager.lokwensio.com/auth/callback` and `https://loot-manager.kevinloquencio.chatgpt.site/auth/callback`. Configure custom SMTP in Supabase for public registration email delivery; the default mail service restricts recipient delivery.

The initial platform administrator is the verified Supabase Auth account `kevin.loquencio@gmail.com`. Register and confirm that email before opening `/admin`. Other registrations do not receive administrator privileges.

## Accounts and playgrounds

Register with email, password, name and a unique username at `/register`. Choose create or join at `/playgrounds`. Code-based joining requires owner approval; email invitations grant Manager access only to the invited registered email. Managers cannot manage users, roles, settings or deletion. Each playground has one Owner; all other users are Managers.

Free: own 1 playground, create up to 5 current runs total, no managers. Elite: own 5 playgrounds, unlimited runs, up to 5 managers per playground. Legend: unlimited playgrounds, runs and managers. Joining other playgrounds does not consume the ownership allowance. Pending invitations reserve manager capacity.

The owner’s plan governs each playground. Individual limit overrides apply to only that account. Plan pauses temporarily use Free limits, preserve data, and expire automatically if a resume time is set; indefinite pauses require manual resumption. Existing runs may still be edited or sold after a downgrade, but additional runs above the new limit are rejected. Bans block protected access and hide owned public pages.

`/pricing` shows monthly Free, Elite (1B Penya), Legend (5B Penya) prices. Assignment, payment and renewal are manual; no checkout or automatic billing is implemented. `/plans` is also available.

## Public features and Discord

Owners separately configure Public Shop and Public Inquiries in `/settings`. Both default off, cannot be enabled on Free or while a paid plan is paused, and are disabled when downgraded to Free. Public links use `/shop?playground=<slug>` and `/inquiries?playground=<slug>`. Each directory includes only enabled playgrounds for that feature.

Discord logging is available on all plans. Owners save one channel webhook per playground and can disable or remove it. Webhook URLs stay in protected database storage and are omitted from all settings/list/context responses. No shared Stoics webhook is copied. Log records are transactionally queued with saved ledger changes. Requests try to deliver pending messages; failed delivery remains queued and can be retried in settings after one minute. Disabling removes pending logs. A timeout after Discord accepted a request can result in duplicate delivery on retry because Discord does not offer an idempotency key.

All application tables have RLS enabled and direct browser access revoked. Server code verifies Supabase Auth identities and calls transactional RPCs with the secret key. Public endpoints return only public stock or inquiry projections, never raw ledgers. No server secret is included in client code.

## Development

`npm ci`, `node scripts/test-playgrounds.mjs`, `npx tsc --noEmit`, `npm run build`. SQL tests run in disposable in-memory PostgreSQL using PGlite. Production migrations are applied manually in Supabase, not by Sites deployment.
