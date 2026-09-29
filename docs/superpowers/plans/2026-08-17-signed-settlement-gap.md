# Signed Settlement Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display an explicit plus or minus sign for every non-zero chip gap in the timed cash-game settlement modal and its confirmation prompt while keeping zero gaps hidden.

**Architecture:** Add one presentation formatter beside `formatNumber`, then use it at the two approved `GameView` presentation points. Preserve the existing `gap !== 0` rendering guard and leave calculations, persistence, translations, styles, and copied reports unchanged.

**Tech Stack:** Vue 3 Composition API, JavaScript ES modules, Vitest

## Global Constraints

- A positive gap displays as `+1,000` and a negative gap displays as `-1,000`.
- A zero gap remains hidden in the settlement modal.
- Only the settlement modal and settlement confirmation message adopt the signed format.
- Do not modify copied text reports, translations, calculations, Firestore writes, Cloud Functions, dependencies, or package lockfiles.
- Do not create a git commit unless the user explicitly requests one.

---

### Task 1: Signed Number Formatter

**Files:**
- Modify: `tests/formatters.test.js`
- Modify: `src/utils/formatters.js`

**Interfaces:**
- Consumes: `formatNumber(n)` from `src/utils/formatters.js`
- Produces: `formatSignedNumber(n): string`, returning a plus prefix only when `Number(n) > 0`

- [ ] **Step 1: Write the failing formatter tests**

Add `formatSignedNumber` to the formatter import and add this suite after the existing `formatNumber` tests:

```js
describe('formatSignedNumber', () => {
  it('adds an explicit sign to non-zero values', () => {
    expect(formatSignedNumber(1000)).toBe('+1,000');
    expect(formatSignedNumber(-1000)).toBe('-1,000');
  });

  it('formats zero without a sign', () => {
    expect(formatSignedNumber(0)).toBe('0');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/formatters.test.js`

Expected: FAIL because `formatSignedNumber` is not exported from `src/utils/formatters.js`.

- [ ] **Step 3: Add the minimal formatter implementation**

Add immediately after `formatNumber`:

```js
/**
 * Format a number with an explicit sign when positive
 * @param {number} n - Number to format
 * @returns {string} Signed formatted number string
 */
export const formatSignedNumber = (n) => {
  const formatted = formatNumber(n);
  return Number(n) > 0 ? `+${formatted}` : formatted;
};
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/formatters.test.js`

Expected: PASS with the positive, negative, and zero signed-format cases covered.

### Task 2: Cash Settlement Gap Presentation

**Files:**
- Modify: `tests/cashSettlementClient.test.js`
- Modify: `src/views/GameView.vue`

**Interfaces:**
- Consumes: `formatSignedNumber(n): string` from Task 1
- Produces: signed gap text in the settlement modal and `confirmSettlementGap` interpolation

- [ ] **Step 1: Write the failing client contract test**

Add this case to `cash settlement client contract`:

```js
it('shows signed non-zero gaps while keeping zero gaps hidden', () => {
  expect(viewSource).toContain('v-if="gap !== 0"');
  expect(viewSource).toContain("{{ $t('game.gap') }}: {{ formatSignedNumber(gap) }}");
  expect(handleSettleSource).toContain(
    "t('game.confirmSettlementGap', { gap: formatSignedNumber(gap.value) })",
  );
});
```

- [ ] **Step 2: Run the client test and verify RED**

Run: `npm test -- tests/cashSettlementClient.test.js`

Expected: FAIL because `GameView` still calls `formatNumber` for the two gap displays.

- [ ] **Step 3: Connect the formatter to both display points**

Update the import:

```js
import { formatNumber, formatSignedNumber, formatCash, calculateNet } from '../utils/formatters.js';
```

Update the modal while retaining its existing guard:

```vue
<div v-if="gap !== 0" class="text-rose-400 text-center text-xs mb-4">
  {{ $t('game.gap') }}: {{ formatSignedNumber(gap) }}
</div>
```

Update the confirmation interpolation:

```js
message: gap.value !== 0
  ? t('game.confirmSettlementGap', { gap: formatSignedNumber(gap.value) })
  : t('game.confirmSettlement'),
```

- [ ] **Step 4: Run both focused suites and verify GREEN**

Run: `npm test -- tests/formatters.test.js tests/cashSettlementClient.test.js`

Expected: PASS for both suites.

- [ ] **Step 5: Run complete verification**

Run: `npm test`

Expected: All Vitest suites pass with no new errors.