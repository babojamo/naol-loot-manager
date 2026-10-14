# NAOL authentication email design

These templates match the application’s plan-upgrade email: NAOL logo, warm background, white card, purple buttons, readable copy and consistent account/contact links.

## Apply all templates

Run this from PowerShell or Command Prompt (no PowerShell execution-policy change is needed):

```powershell
node D:/codes/loot-manager/scripts/apply-auth-email-design.mjs
```

The script prompts for a Supabase **personal access token** locally. Get one from [Supabase account access tokens](https://supabase.com/dashboard/account/tokens). Do not paste it into chat, put it in the NAOL environment variables, or save it in this repository. The token is used only in memory against the NAOL project `jpevnyalkjzfjtsqkagp`.

The script backs up existing subjects/templates in `outputs/email-template-backups`, changes only email subjects and HTML, then reads them back to verify the update. It preserves SMTP credentials, redirect URLs, authentication settings and security-notification enablement. It sends no emails. It stops without applying changes if it detects custom authentication links that need individual review.

To validate the local package without credentials or network calls:

```powershell
& D:/codes/loot-manager/scripts/apply-auth-email-design.ps1 -ValidateOnly
```

## Apply manually instead

Open [NAOL’s Supabase Email Templates](https://supabase.com/dashboard/project/jpevnyalkjzfjtsqkagp/auth/templates). For each template listed in `subjects.json`, copy its subject and the full contents of its matching `.html` file. Keep `{{ .ConfirmationURL }}`, `{{ .Token }}` and the other provider placeholders unchanged.

Six authentication templates are included: signup confirmation, Auth account invitation, magic link/email verification, email-change confirmation, password reset and reauthentication. Seven security-notification templates are included for password, email, phone, sign-in-method and verification-method changes. Optional notifications remain enabled or disabled according to the project’s existing settings.

Supabase Auth templates are project configuration, not a SQL migration and not part of website deployment. The application’s playground invitations are separate from Supabase Auth account invitations; both have matching designs.

## Maintain

The shared renderer is `lib/email-design.mjs`. Regenerate Auth HTML and the Management API JSON after changing it:

```powershell
node D:/codes/loot-manager/scripts/generate-auth-email-templates.mjs
```

Provider reference: [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
