# GitHub Copilot Agent Instructions

## Package Management

**NEVER run `npm install`, `npm ci`, `npm update`, or any package manager commands** unless explicitly asked by the user. These commands regenerate `package-lock.json` based on the agent's current OS/architecture, which strips platform-specific optional dependencies (e.g., `@esbuild/*` binaries for other platforms) and breaks cross-platform compatibility.

**NEVER modify `package-lock.json` directly.** If a task requires adding or removing a dependency, ask the user to run `npm install` locally instead.

## File Restrictions

Do not modify the following files unless the task explicitly requires it:
- `package-lock.json`
- `package.json` (unless adding/removing a dependency is the explicit goal)
- `functions/package-lock.json`
- `.env*` files

## Code Style

- This project uses Vue 3 with Composition API (`<script setup>`)
- Use the Composition API with `composables/` for shared logic
- Tailwind CSS for styling
- Firebase/Firestore for backend
- i18n keys are in `src/i18n/locales/` — add translations for both `zh-TW` and `en` when adding new UI text

## Testing

- Run `npm test` to execute Vitest tests before marking a task complete
- Tests are in the `tests/` directory
