# Jarvis page awareness

Jarvis discovers enabled links, buttons and tabs from the current rendered page whenever it receives a command. It uses accessible labels, button text and nearby card names. It excludes hidden, disabled and Jarvis's own controls. Existing UI handlers and Supabase permissions continue to apply.

Examples:
- Open projects / click projects
- Switch to list view / grid view (only if the current page offers it)
- Open Akhil Nutakki profile / close profile
- Click Add entry / click Export / close dialog
- What can I do here?
- Log out

Exact, unique matches run directly. Multiple or approximate matches are shown as suggestions. Say the choice's name, first/second, or number; or click it. Suggested controls are rechecked before clicking.

No, stop, delete and clear remain interrupt commands. Delete controls are excluded from generic page activation. Say remove employee to open the existing admin removal dialog.

The assistant is available after login. It does not enter login credentials or bypass access checks. It does not infer the behavior of invisible controls or arbitrary source code. No source files or page contents are sent to an AI service by this feature.

Implementation:
- src/lib/jarvisPageActions.ts: live control discovery, matching, suggestions and fresh-control validation.
- src/features/JarvisOverlay.tsx: conversation, routes, profile lookup, suggestions and existing task actions.

When adding a new UI control, give it a clear aria-label or visible text. This makes it discoverable without adding a separate Jarvis command. Controls with the same label need distinct labels or nearby card names to avoid ambiguity.
