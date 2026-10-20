/**
 * Event expenses (代墊分帳): someone pays for a group order (Uber Eats,
 * foodpanda, drinks, the venue) and the event's players pay them back.
 *
 * An expense is a list of lines. Each line is a food item or an extra fee
 * (delivery, service, an order-level discount). Only lines ticked as
 * `charged` are collected, split evenly between the line's assignees. Items
 * start ticked, fees start unticked: extras are the payer's to absorb unless
 * they choose to share them. Everything charged that isn't the payer's own
 * share is what the others owe the payer.
 *
 * Pure (no Vue / Firebase) so the maths and the receipt parsing can be unit
 * tested; useEventExpenses wires these to Firestore and Gemini.
 */

export const LINE_KIND = { ITEM: 'item', FEE: 'fee' };

// ── Receipt recognition (Gemini) ─────────────────────────────────────

/** Plain SchemaRequest literal for firebase/ai's `responseSchema`. */
export const RECEIPT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING', nullable: true },
    platform: { type: 'STRING', nullable: true },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity: { type: 'INTEGER' },
          amount: { type: 'NUMBER' },
          person: { type: 'STRING', nullable: true }
        },
        required: ['name', 'amount']
      }
    },
    fees: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          amount: { type: 'NUMBER' }
        },
        required: ['name', 'amount']
      }
    },
    total: { type: 'NUMBER', nullable: true }
  },
  required: ['items']
};

export const RECEIPT_PROMPT = `You are reading a screenshot or photo of a food delivery order or a receipt (Uber Eats, foodpanda, a restaurant or drink shop bill).
Extract:
- "merchant": the store / restaurant name as printed (often at the top of the order), or null.
- "platform": the delivery app if recognisable ("Uber Eats", "foodpanda", ...), or null.
- "items": every ordered line. "name" as printed (keep the original language, drop add-on detail lines unless they carry their own price), "quantity" (default 1), "amount" = the TOTAL price of that line (quantity x unit price) after any discount printed on that specific line, as a plain number without currency symbols.
  "person": group orders list items under each participant's name (e.g. "Amy's items", "Amy", "Amy 的餐點"); put that name here exactly as shown. Use null when the screenshot does not say who ordered it.
- "fees": extra charges shown as separate lines (delivery fee, service fee, small order fee, bag fee, tip, tax) and order-level discounts or promotions. Discounts are NEGATIVE amounts.
- "total": the final amount charged, or null.
Rules:
- Never list subtotal or total lines as items or fees, and never count a discount twice.
- A discount printed under one item belongs to that item's amount, not to fees.
- If the image is not a receipt or order, return empty lists.
Respond with JSON only: {"merchant":"店名","platform":"Uber Eats","items":[{"name":"雞腿飯","quantity":1,"amount":120,"person":"Amy"}],"fees":[{"name":"外送費","amount":39},{"name":"優惠","amount":-50}],"total":229}`;

const toNumber = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number(v.replace(/[^\d.-]/g, ''));
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
};

const cleanText = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Turn the model's JSON into a clean receipt. Lines without a name or a
 * readable amount are dropped; item amounts must be positive.
 *
 * @param {unknown} raw
 * @returns {{ merchant: string, platform: string, items: Array<{name: string, quantity: number, amount: number, person: string}>,
 *   fees: Array<{name: string, amount: number}>, total: number | null }}
 */
export function normalizeReceipt(raw) {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const items = [];
  for (const e of Array.isArray(obj.items) ? obj.items : []) {
    if (!e || typeof e !== 'object') continue;
    const name = cleanText(e.name);
    const amount = toNumber(e.amount);
    if (!name || amount === null || amount <= 0) continue;
    const q = Math.round(toNumber(e.quantity) || 1);
    items.push({ name, quantity: q > 0 ? q : 1, amount, person: cleanText(e.person) });
  }
  const fees = [];
  for (const e of Array.isArray(obj.fees) ? obj.fees : []) {
    if (!e || typeof e !== 'object') continue;
    const name = cleanText(e.name);
    const amount = toNumber(e.amount);
    if (!name || amount === null || amount === 0) continue;
    fees.push({ name, amount });
  }
  const total = toNumber(obj.total);
  return {
    merchant: cleanText(obj.merchant),
    platform: cleanText(obj.platform),
    items,
    fees,
    total: total !== null && total > 0 ? total : null
  };
}

/**
 * A name for the expense from a recognised receipt: "Uber Eats · 八方雲集",
 * or whichever of the two was read.
 */
export function receiptTitle(receipt) {
  const merchant = cleanText(receipt?.merchant);
  const platform = cleanText(receipt?.platform);
  if (merchant && platform && !normalizeName(merchant).includes(normalizeName(platform))) {
    return `${platform} · ${merchant}`;
  }
  return merchant || platform;
}

// ── Name matching ────────────────────────────────────────────────────

/** Lower-case, width-fold and strip spaces / punctuation / emoji. */
export function normalizeName(s) {
  if (typeof s !== 'string') return '';
  return s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// "Amy's items" / "Amy 的餐點" → "Amy"
const stripOwnerSuffix = (s) => s
  .replace(/['’]s\s+(items?|order)\s*$/i, '')
  .replace(/\s*的(餐點|品項|訂單)?\s*$/, '');

/**
 * Find the event player a name printed on a receipt belongs to. Exact match
 * first, then one name containing the other (at least 2 characters). Returns
 * null unless exactly one player fits, so a wrong guess never silently
 * charges someone.
 *
 * @param {string} label name printed on the receipt
 * @param {Array<{uid: string, name: string}>} people
 * @returns {string | null} uid
 */
export function matchPersonName(label, people = []) {
  const key = normalizeName(stripOwnerSuffix(cleanText(label)));
  if (!key) return null;
  const named = people
    .filter((p) => p && p.uid)
    .map((p) => ({ uid: p.uid, key: normalizeName(p.name) }))
    .filter((p) => p.key);

  const exact = named.filter((p) => p.key === key);
  if (exact.length) return exact.length === 1 ? exact[0].uid : null;

  const partial = named.filter((p) => {
    const shorter = p.key.length < key.length ? p.key : key;
    const longer = shorter === key ? p.key : key;
    return shorter.length >= 2 && longer.includes(shorter);
  });
  return partial.length === 1 ? partial[0].uid : null;
}

// ── Lines ────────────────────────────────────────────────────────────

let lineSeq = 0;
/** Short id for a line, unique within an expense. */
export function newLineId() {
  lineSeq = (lineSeq + 1) % 1e6;
  return `l${Date.now().toString(36)}${lineSeq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** A blank line; items start charged, fees don't. */
export function blankLine(kind = LINE_KIND.ITEM) {
  const isFee = kind === LINE_KIND.FEE;
  return {
    id: newLineId(),
    kind: isFee ? LINE_KIND.FEE : LINE_KIND.ITEM,
    name: '',
    quantity: 1,
    amount: null,
    charged: !isFee,
    assignees: [],
    person: ''
  };
}

/**
 * Lines for a recognised receipt: items ticked and pre-assigned when the
 * printed name matches one player, fees unticked and unassigned.
 *
 * @param {ReturnType<typeof normalizeReceipt>} receipt
 * @param {Array<{uid: string, name: string}>} people
 */
export function linesFromReceipt(receipt, people = []) {
  const items = (receipt?.items || []).map((it) => {
    const uid = it.person ? matchPersonName(it.person, people) : null;
    return {
      ...blankLine(LINE_KIND.ITEM),
      name: it.name,
      quantity: it.quantity || 1,
      amount: it.amount,
      assignees: uid ? [uid] : [],
      person: it.person || ''
    };
  });
  const fees = (receipt?.fees || []).map((f) => ({
    ...blankLine(LINE_KIND.FEE),
    name: f.name,
    amount: f.amount
  }));
  return [...items, ...fees];
}

const lineAmount = (line) => {
  const n = toNumber(line?.amount);
  return n === null ? 0 : n;
};

/** Lines that are collected: ticked, with a non-zero amount. */
export function chargedLines(lines = []) {
  return lines.filter((l) => l && l.charged && lineAmount(l) !== 0);
}

/** A line nothing was typed into yet (dropped on save, never an error). */
export function isBlankLine(line) {
  return !cleanText(line?.name) && toNumber(line?.amount) === null;
}

/**
 * What's wrong with an expense before it can be saved.
 * - `unassigned`: charged lines nobody was picked for
 * - `badAmount`: charged lines without a usable amount (items must be > 0)
 * - `empty`: nothing entered at all
 * Blank lines are ignored.
 */
export function expenseProblems(expense) {
  const unassigned = [];
  const badAmount = [];
  const lines = (expense?.lines || []).filter((l) => l && !isBlankLine(l));
  for (const l of lines) {
    if (!l.charged) continue;
    const n = toNumber(l.amount);
    if (n === null || n === 0 || (l.kind !== LINE_KIND.FEE && n < 0)) badAmount.push(l.id);
    if (!(l.assignees || []).length) unassigned.push(l.id);
  }
  const empty = lines.length === 0;
  return { unassigned, badAmount, empty, ok: !empty && unassigned.length === 0 && badAmount.length === 0 };
}

/** Sum of every line on the receipt (charged or not). */
export function linesTotal(lines = []) {
  return lines.reduce((s, l) => s + lineAmount(l), 0);
}

/** Sum of the charged lines. */
export function chargedTotal(lines = []) {
  return chargedLines(lines).reduce((s, l) => s + lineAmount(l), 0);
}

/**
 * Each person's share of an expense's charged lines, whole dollars. A line is
 * split evenly between its assignees. Includes the payer's own share. Each
 * person is rounded on their own, so the payer absorbs the odd dollar rather
 * than someone being charged one they didn't spend.
 *
 * @param {{ lines: Array }} expense
 * @returns {Record<string, number>} uid → amount
 */
export function expenseShares(expense) {
  const exact = {};
  for (const l of chargedLines(expense?.lines)) {
    const who = [...new Set(l.assignees || [])].filter(Boolean);
    if (!who.length) continue;
    const each = lineAmount(l) / who.length;
    for (const uid of who) exact[uid] = (exact[uid] || 0) + each;
  }
  const shares = {};
  for (const [uid, amount] of Object.entries(exact)) shares[uid] = Math.round(amount);
  return shares;
}

/**
 * Who owes the payer what for one expense (the payer's own share is left out).
 * @returns {Array<{ uid: string, amount: number }>} sorted by amount, largest first
 */
export function expenseDebts(expense) {
  const shares = expenseShares(expense);
  return Object.entries(shares)
    .filter(([uid, amount]) => uid !== expense?.payerUid && amount !== 0)
    .map(([uid, amount]) => ({ uid, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Everyone's net over all of an event's expenses: positive = others owe them,
 * negative = they owe. Names come from each expense's `names` snapshot.
 *
 * @param {Array<{ id?: string, payerUid: string, payerName?: string, names?: Record<string,string>, lines: Array }>} expenses
 * @returns {Array<{ uid: string, name: string, net: number, receive: number, pay: number }>}
 *   sorted by net, largest first; people at exactly 0 are dropped
 */
export function aggregateExpenses(expenses = []) {
  const map = new Map();
  const row = (uid, name) => {
    if (!map.has(uid)) map.set(uid, { uid, name: name || '', net: 0, receive: 0, pay: 0 });
    const r = map.get(uid);
    if (!r.name && name) r.name = name;
    return r;
  };
  for (const e of expenses) {
    if (!e || !e.payerUid) continue;
    const names = e.names || {};
    for (const { uid, amount } of expenseDebts(e)) {
      const payer = row(e.payerUid, e.payerName || names[e.payerUid]);
      const debtor = row(uid, names[uid]);
      payer.receive += amount;
      payer.net += amount;
      debtor.pay += amount;
      debtor.net -= amount;
    }
  }
  return [...map.values()]
    .filter((r) => r.receive !== 0 || r.pay !== 0)
    .sort((a, b) => b.net - a.net);
}

/**
 * Merge the poker ranking with the expense nets into the event's final
 * amounts (總和). Players are matched by uid (the ranking's odId), falling
 * back to the name for guests without an account.
 *
 * @param {Array<{ odId?: string, name: string, profitCash: number }>} ranking
 * @param {ReturnType<typeof aggregateExpenses>} expenseRows
 * @returns {Array<{ key: string, name: string, poker: number, expense: number, total: number }>}
 *   sorted by total, largest first
 */
export function combineEventTotals(ranking = [], expenseRows = []) {
  const map = new Map();
  for (const p of ranking) {
    const key = p.odId || `name:${p.name}`;
    map.set(key, { key, name: p.name || '', poker: Number(p.profitCash) || 0, expense: 0 });
  }
  for (const r of expenseRows) {
    const cur = map.get(r.uid);
    if (cur) cur.expense += r.net;
    else map.set(r.uid, { key: r.uid, name: r.name, poker: 0, expense: r.net });
  }
  return [...map.values()]
    .map((r) => ({ ...r, total: r.poker + r.expense }))
    .sort((a, b) => b.total - a.total);
}

// ── People ───────────────────────────────────────────────────────────

/**
 * Everyone who can be charged: the union of every period's roster (first
 * name seen wins), plus the host.
 *
 * @param {object} session sessions/{id} doc
 * @returns {Array<{ uid: string, name: string }>}
 */
export function eventPeople(session) {
  const map = new Map();
  for (const p of session?.periods || []) {
    for (const r of p?.roster || []) {
      if (r && r.uid && !map.has(r.uid)) map.set(r.uid, { uid: r.uid, name: r.name || '' });
    }
  }
  if (session?.hostUid && !map.has(session.hostUid)) {
    map.set(session.hostUid, { uid: session.hostUid, name: session.hostName || '' });
  }
  return [...map.values()];
}

/**
 * The stored form of an expense being saved: amounts as numbers, empty lines
 * dropped, and a uid → name snapshot so it still reads right after someone
 * leaves the event.
 */
export function serializeExpense(draft, people = []) {
  const nameOf = new Map(people.map((p) => [p.uid, p.name]));
  const lines = (draft.lines || [])
    .filter((l) => l && !isBlankLine(l))
    .map((l) => ({
      id: l.id || newLineId(),
      kind: l.kind === LINE_KIND.FEE ? LINE_KIND.FEE : LINE_KIND.ITEM,
      name: cleanText(l.name),
      quantity: Math.max(1, Math.round(toNumber(l.quantity) || 1)),
      amount: toNumber(l.amount) ?? 0,
      charged: !!l.charged,
      assignees: [...new Set(l.assignees || [])].filter(Boolean),
      person: cleanText(l.person)
    }));
  const names = {};
  const keep = (uid, fallback) => {
    if (!uid) return;
    names[uid] = nameOf.get(uid) || draft.names?.[uid] || fallback || '';
  };
  keep(draft.payerUid, draft.payerName);
  for (const l of lines) for (const uid of l.assignees) keep(uid);
  const receiptTotal = toNumber(draft.receiptTotal);
  return {
    title: cleanText(draft.title),
    payerUid: draft.payerUid,
    payerName: names[draft.payerUid] || '',
    lines,
    names,
    receiptTotal: receiptTotal !== null && receiptTotal > 0 ? receiptTotal : null
  };
}
