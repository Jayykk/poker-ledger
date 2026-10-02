/**
 * Client error reports → GitHub issues.
 *
 * The app sends uncaught errors here (reportClientError). Each kind of error
 * (same message and top stack frame, build hashes and line numbers ignored)
 * gets one doc in `clientErrors/{signature}` and one GitHub issue in a private
 * repo, so an assistant can read the issues straight from GitHub and fix them:
 *   - first time: open an issue with the message, stack, page, device, build
 *   - again: bump the count; at 2, 5, 10, 25, 50, 100, then every 100 add a
 *     comment with the latest sample and reopen the issue if it was closed
 *     (an issue closed as fixed that comes back means the fix didn't hold, or
 *     an old build is still cached)
 *
 * Configuration (functions/.env, written from GitHub Secrets at deploy):
 *   ERRORS_GITHUB_TOKEN  fine-grained token, Issues: read and write, on the repo below
 *   ERRORS_GITHUB_REPO   owner/name of the private issues repo (default Jayykk/poker-ledger-errors)
 * Without a token reports are still counted in Firestore, just not filed.
 *
 * `clientErrors` is unreachable from clients (denied in firestore.rules).
 */
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';

export const ERRORS_COLLECTION = 'clientErrors';
const DEFAULT_REPO = 'Jayykk/poker-ledger-errors';
// At most this many new issues a day (Asia/Taipei), so a flood of distinct
// errors can't spam the repo; later ones are still counted in Firestore.
export const MAX_NEW_ISSUES_PER_DAY = 20;

const LIMITS = {
  message: 500, stack: 4000, context: 80, route: 200, build: 60, userAgent: 300,
};

/**
 * Trim a value to a bounded string.
 * @param {*} value Raw value
 * @param {number} max Maximum length
 * @return {string} Clean string
 */
function clip(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/**
 * Validate and bound a client report.
 * @param {object} data Callable payload
 * @return {?object} Clean report, or null when it carries no error
 */
export function sanitizeReport(data = {}) {
  const message = clip(data.message, LIMITS.message).trim();
  if (!message) return null;
  return {
    message,
    stack: clip(data.stack, LIMITS.stack),
    context: clip(data.context, LIMITS.context),
    route: clip(data.route, LIMITS.route),
    build: clip(data.build, LIMITS.build),
    userAgent: clip(data.userAgent, LIMITS.userAgent),
    standalone: data.standalone === true,
    inLine: data.inLine === true,
    online: data.online !== false,
  };
}

/**
 * The first stack frame that points at app code (not a vendor chunk), with the
 * build hash and line / column numbers taken out so every build agrees.
 * @param {string} stack Error stack
 * @return {string} Normalized frame, or ''
 */
export function topFrame(stack = '') {
  const frames = String(stack).split('\n').map((l) => l.trim()).filter((l) => /\.js|\.vue/.test(l));
  const pick = frames.find((l) => !/vendor|node_modules/.test(l)) || frames[0] || '';
  return pick
    .replace(/https?:\/\/[^/\s)]+/g, '')
    .replace(/-[A-Za-z0-9_]{6,}\.(js|css)/g, '.$1')
    .replace(/:\d+(:\d+)?/g, '')
    .replace(/\?[^\s)]*/g, '');
}

/**
 * Stable id for a kind of error.
 * @param {object} report Clean report
 * @return {string} 16-hex signature
 */
export function errorSignature(report) {
  const msg = report.message
    .replace(/\b[0-9a-f]{8,}\b/gi, '#')
    .replace(/\d+/g, '#');
  return createHash('sha1').update(`${msg}|${topFrame(report.stack)}`).digest('hex').slice(0, 16);
}

/**
 * Counts that add a comment (and reopen a closed issue).
 * @param {number} count Occurrences so far
 * @return {boolean} Whether this one is reported on the issue
 */
export function isMilestone(count) {
  return [2, 5, 10, 25, 50, 100].includes(count) || (count > 100 && count % 100 === 0);
}

const taipeiDay = (ms = Date.now()) => new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * Markdown for one occurrence.
 * @param {object} r Clean report
 * @param {object} extra { count, signature, uid }
 * @return {string} Markdown
 */
export function reportMarkdown(r, { count, signature, uid } = {}) {
  const device = [
    r.standalone ? '主畫面 App' : '瀏覽器',
    r.inLine ? 'LINE' : '',
    r.online ? '' : '離線',
  ].filter(Boolean).join(' · ');
  return [
    `**${r.message}**`,
    '',
    '| | |',
    '|---|---|',
    `| 頁面 | \`${r.route || '-'}\` |`,
    `| 來源 | \`${r.context || '-'}\` |`,
    `| 版本 | \`${r.build || '-'}\` |`,
    `| 裝置 | ${device} |`,
    `| User agent | \`${r.userAgent || '-'}\` |`,
    `| 使用者 | ${uid ? `\`${uid.slice(0, 8)}…\`` : '未登入'} |`,
    count ? `| 累計次數 | ${count} |` : null,
    signature ? `| 簽章 | \`${signature}\` |` : null,
    '',
    r.stack ? ['```', r.stack, '```'].join('\n') : '_沒有 stack_',
  ].filter((l) => l !== null).join('\n');
}

/**
 * Call the GitHub REST API.
 * @param {string} path e.g. /repos/o/r/issues
 * @param {object} options { method, body, token, fetchImpl }
 * @return {Promise<object>} JSON response
 */
async function github(path, { method = 'GET', body, token, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.github.com${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status}`);
  return res.json();
}

/**
 * Record one client error and file / update its GitHub issue.
 * @param {object} data Callable payload
 * @param {object} deps { db, uid, env, fetchImpl, now }
 * @return {Promise<object>} { ok, signature?, count?, issue? }
 */
export async function reportClientError(data, {
  db, uid = null, env = process.env, fetchImpl = fetch, now = Date.now(),
} = {}) {
  const report = sanitizeReport(data);
  if (!report) return { ok: false };
  const signature = errorSignature(report);
  const ref = db.collection(ERRORS_COLLECTION).doc(signature);
  const dayRef = db.collection(ERRORS_COLLECTION).doc(`_day_${taipeiDay(now)}`);

  // Count it; decide whether this one needs a new issue (and fits today's cap)
  const { count, issueNumber, wantsIssue } = await db.runTransaction(async (t) => {
    const [snap, daySnap] = await Promise.all([t.get(ref), t.get(dayRef)]);
    const prev = snap.exists ? snap.data() : null;
    const next = (prev?.count || 0) + 1;
    // issueFiling: another report of this error is opening its issue right now
    const filing = prev?.issueFiling && now - prev.issueFiling < 60 * 1000;
    const newIssue = !prev?.issueNumber && !filing
      && (daySnap.data()?.newIssues || 0) < MAX_NEW_ISSUES_PER_DAY;
    t.set(ref, {
      signature,
      message: report.message,
      count: next,
      lastSeen: now,
      lastSample: report,
      ...(prev ? {} : { firstSeen: now }),
      ...(newIssue ? { issueFiling: now } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (newIssue) t.set(dayRef, { newIssues: FieldValue.increment(1) }, { merge: true });
    return { count: next, issueNumber: prev?.issueNumber || null, wantsIssue: newIssue };
  });

  const token = env.ERRORS_GITHUB_TOKEN;
  const repo = env.ERRORS_GITHUB_REPO || DEFAULT_REPO;
  if (!token) return { ok: true, signature, count };

  try {
    if (!issueNumber && wantsIssue) {
      const issue = await github(`/repos/${repo}/issues`, {
        method: 'POST',
        token,
        fetchImpl,
        body: {
          title: `[client] ${report.message.slice(0, 90)}`,
          labels: ['client-error'],
          body: [
            reportMarkdown(report, { count, signature, uid }),
            '',
            '---',
            '_由 reportClientError 自動建立。修好後關閉即可；同樣的錯誤再發生會自動重開並留言。_',
          ].join('\n'),
        },
      });
      await ref.set({ issueNumber: issue.number }, { merge: true });
      return { ok: true, signature, count, issue: issue.number };
    }
    if (issueNumber && isMilestone(count)) {
      await github(`/repos/${repo}/issues/${issueNumber}/comments`, {
        method: 'POST',
        token,
        fetchImpl,
        body: { body: `又發生了（累計 ${count} 次）\n\n${reportMarkdown(report, { uid })}` },
      });
      await github(`/repos/${repo}/issues/${issueNumber}`, {
        method: 'PATCH', token, fetchImpl, body: { state: 'open' },
      });
    }
  } catch (err) {
    // GitHub down / token expired: the count is already in Firestore
    console.error('[clientErrors] GitHub:', err.message);
  }
  return { ok: true, signature, count, issue: issueNumber };
}
