# NAOL email review

## Application messages

| Email | Recipient | Shared design | Delivery behavior retained |
| --- | --- | --- | --- |
| Plan upgrade/downgrade | Account whose assigned tier changed | Yes | Atomic outbox, private delivery, frozen retry payload and provider idempotency |
| Manual admin mail | Explicitly selected accounts | Yes | Review before sending, separate recipient messages, delivery history and safe retries |
| Playground invitation | Invited email | Yes | Seven-day expiry, canonical NAOL join token, registration continuation and existing idempotency key |
| Restricted shared run | Explicit recipient emails | Yes | Individual messages, verified-email instructions, permanent link with changeable access and per-revision idempotency |
| Contact form, including support/subscription requests | Platform administrator | Yes | Submitter Reply-To, account/guest context, rate limits, honeypot and existing idempotency key |

All application messages have both readable plain text and HTML. User-controlled text is escaped, subjects have control characters removed, and buttons include visible copyable fallback links. The common frame uses presentation tables and inline styles, with a narrow-screen adjustment and readable content when images are blocked. No email clients are claimed to have been exhaustively tested.

## Provider-managed authentication

The app uses Supabase for email verification/magic links, password resets and email-change confirmations. A matching 13-template package also covers signup, Auth invitations, reauthentication and optional security notices. Applying it requires the Supabase dashboard or Management API; website publishing alone cannot update these settings. See `supabase/email-templates/README.md`.

The password-reset template uses a NAOL `/auth/confirm` link with Supabase’s `TokenHash` placeholder. Only recovery tokens are accepted there; the existing account checks and session-bound recovery grant still protect password changes. The old PKCE callback remains for previously sent links. Other `ConfirmationURL` and OTP placeholders, signup/invitation continuation and email-change checks remain intact. No SMTP settings or notification enablement flags are changed by the design package.

## Verification and scope

Use mocked-provider checks for recipient privacy, escaping, transport failures, idempotency and link correctness. No real test emails are sent. Existing platform-mail retries retain the payload frozen for their original attempt; the new shared design applies when new payloads are prepared. Already delivered email cannot be restyled.

This is a design and delivery-code review, not a new delivery-history system for Supabase Auth or every application sender. Platform plan/manual-mail history remains in Admin Mail; Supabase manages authentication delivery records separately.
