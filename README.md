# A & E Podcast

The episode library is shared across devices through Netlify Database. YouTube hosts the videos; this site stores only their episode IDs. Visitors can watch without an account. Only invited, confirmed Netlify Identity users with the `admin` role can add, import, or remove episodes.

## Deploy and invite administrators

Deploy this repository to Netlify. The deployment builds the frontend, publishes `dist`, enables Identity, and applies the generated database migration. No database credentials need to be added to the frontend.

1. In the Netlify project's Identity settings, set registration to **Invite only** and set the site URL to the production Netlify address or your custom domain.
2. In Identity's user management, invite each administrator by email.
3. Edit each invited user's roles and add the exact role `admin`. Do not assign this role to ordinary visitors.
4. Open the invitation email's link and choose a password. Then use **Admin • Add Episode** to sign in with the invited email address.

The server rejects public signup validation and requires both a confirmed invitation and the server-managed `admin` role for changes. The old browser-only username/password login is no longer used. Invitations and password-reset links are handled by the site's sign-in dialog.

## Recover existing episodes

Previously, episodes were saved separately in each browser. On the device and browser where you originally added them, open the same Netlify site address, sign in as an invited administrator, and select **Publish episodes saved on this device**. Confirm to import them into the shared library. Repeat on other browsers with their own saved episodes if needed. Duplicate episode IDs are ignored, and local data is cleared only after a successful import.

Browser storage belongs to a specific site address. If your older episodes were added on the GitHub Pages address or a different domain, open that old address in the original browser and re-add its YouTube links on the Netlify site. The new site cannot read another domain's local storage. GitHub Pages alone cannot run the server-side API.

New additions and removals persist in the database. Other open devices refresh the library every 30 seconds and when the page regains focus or becomes visible. Reloading also fetches the shared library. The refresh does not restart videos when the library is unchanged.

## Local development

Run `npm install`, then `netlify dev --port 8889` to use the frontend with Netlify's local runtime. The database schema is in `db/schema.ts`. After schema changes, generate a migration with `npx drizzle-kit generate --name describe_the_change`; Netlify applies migrations during deployment. Do not apply migrations manually.

Run `npm run typecheck` for server-side TypeScript checks. Production database connectivity and invitation emails must be verified after deployment.
