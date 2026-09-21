# Signed Settlement Gap Design

## Scope

Make non-zero chip gaps in the timed cash-game settlement flow visually unambiguous. This is a presentation-only change; the existing gap calculation, settlement data, and validation behavior remain unchanged.

## Display Behavior

- A positive gap is displayed as `+1,000`.
- A negative gap is displayed as `-1,000`.
- A zero gap remains hidden by the settlement modal's existing conditional rendering.
- The signed format is used in both the settlement modal and the confirmation message shown after selecting finish and save.
- The copied text report remains unchanged.

## Implementation

Add a signed-number formatter beside the existing number formatter. It adds a plus sign only for positive values, preserves the minus sign for negative values, and formats zero as `0` at the utility boundary.

`GameView` uses this formatter for the two approved gap presentation points. No translation text, styling, calculations, Firestore writes, or Cloud Function behavior changes.

## Tests

- The signed formatter returns `+1,000` for a positive value.
- The signed formatter returns `-1,000` for a negative value.
- The signed formatter returns `0` for zero.
- The settlement modal retains its non-zero visibility condition.
- The focused formatter tests and the complete Vitest suite pass.