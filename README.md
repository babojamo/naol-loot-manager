# Loot Manager

A separate multi-tenant guild loot application. This project has its own Sites project, source repository and D1 database. It does not import or alter the Stoics production site.

## Use

Sign in with ChatGPT at `/login`, create a guild at `/guilds`, and invite managers using their account email in `/settings`. Invitation links expire after seven days; share them yourself. Owners can invite admins; owners and admins can invite managers and revoke access. A person can belong to multiple guilds and switch workspaces.

The protected ledger pages are `/overview`, `/dungeon-runs`, `/loot-inventory`, `/sales`, `/statistics` and `/member-search`. Each guild starts with an empty ledger. Guild settings let an owner or admin publish `/shop?guild=<slug>` and `/inquiries?guild=<slug>`. Private guilds do not appear in the public directory. There is no member showcase page.

## Isolation

Every protected request checks the platform-authenticated user against the selected guild's membership. State changes include both guild ID and ledger version, protecting against stale updates and guild changes in another tab. Settings mutations carry the expected guild ID. Invitations store only a token hash and require the invited email. Recorded sales and runs containing sold loot cannot be rewritten. Public routes expose only published guild stock and player rewards.

No original account credentials, player data, Discord webhook or media files were copied. Site audience controls are separate from the per-guild publication setting; the hosting audience must allow visitors before other guild users can sign in.

## Development

Run `npm ci`, `npm run build`, then apply the generated Drizzle SQL to the local D1 database and run `npm start -- --port 4179`. `node scripts/test-tenancy.mjs` checks access controls against that local server with disposable fixtures. It refuses non-local targets. `node --experimental-strip-types --test lib/run-party.test.mjs` covers run-specific member edits.

Production migrations are packaged under `drizzle/`; production starts empty. Sites owns authenticated request headers in production. Local test headers are only a testing mechanism and must never be implemented as public login fields.
