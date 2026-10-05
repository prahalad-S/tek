# Supabase connection status

Project: `pyjmujnwtxdgwqowiezp`

The local application now uses the supplied project URL and public publishable key from ignored `.env.local`. Both production and design-preview builds were rebuilt. The REST endpoint suffix was removed because the Supabase client needs the base project URL.

Read-only checks succeeded against Auth settings: email authentication is enabled, signup is enabled, and email confirmation is required. Employee and project REST queries returned PGRST205: these tables are not yet present in the exposed schema cache.

The user confirmed the initial schema ran successfully. Next: run `../Tekzenit-calendar-profile-update.sql` once to add migrations 006–010. The publishable key cannot execute privileged schema changes. Employee import and administrator setup are separate steps if not already completed.

After schema setup, import the prepared employee records using the private migration workflow and bootstrap the intended first administrator. Real sign-in requires both a verified Auth account and a provisioned employee email. The design preview continues to use fictional records.
