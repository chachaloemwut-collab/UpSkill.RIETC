/*
 * Smart search for option lists (Select, Combobox, command palettes…).
 *
 * One box that "just finds it":
 *  - any part of the text, down to a single character, in label / description / group / keywords / value
 *  - several words in any order ("ใต้ กรุง" finds "กรุงเทพฯ ฝั่งใต้")
 *  - ignores case, Latin accents, Thai tone marks and punctuation/spaces ("0812345678" finds "081-234-5678",
 *    "กรุงเทพ" finds "กรุงเทพฯ", "นา" finds "น่า")
 *  - fuzzy: letters in order with gaps ("bkk" finds "BangKoK", "กทม" finds "กรุงเทพมหานคร")
 *  - typed with the wrong keyboard layout: "l;ylfu" finds "สวัสดี", "ฟหกด" finds "asdf"
 * Results are ranked (exact > starts with > word start > contains > fuzzy) and return the matched
 * character ranges of the label so the UI can highlight them.
 */

export interface Searchable {
  label: string;
  description?: string;
  group?: string;
  keywords?: readonly string[];
  value?: string;
}

export interface SearchHit<T> {
  item: T;
  score: number;
  /** [start, end) ranges in the original label to highlight. */
  ranges: [number, number][];
}

export interface SearchResult<T> {
  hits: SearchHit<T>[];
  /** Set when the matches came from reading the query in the other keyboard layout. */
  layoutQuery?: string;
}

/* ---------- normalisation (with an index map back to the original string) ---------- */
const THAI_TONES = /[็-๎]/; // ็ ่ ้ ๊ ๋ ์ ํ ๎
const COMBINING = /[̀-ͯ]/g;
const JUNK = /[\s\-_.,/\\|()[\]{}:;'"`~!@#$%^&*+=?<>ฯๆ]/;

interface Folded {
  text: string;
  map: number[];
}

function fold(s: string, loose: boolean): Folded {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const base = ch!.normalize("NFKD").replace(COMBINING, "").toLowerCase();
    if (!base) continue;
    if (loose && (THAI_TONES.test(ch!) || JUNK.test(ch!))) continue;
    for (const b of base) {
      text += b;
      map.push(i);
    }
  }
  return { text, map };
}

const foldQuery = (s: string, loose: boolean) => fold(s, loose).text;

/* ---------- Thai Kedmanee ↔ US QWERTY ---------- */
const EN = "`1234567890-=qwertyuiop[]\\asdfghjkl;'zxcvbnm,./~!@#$%^&*()_+QWERTYUIOP{}|ASDFGHJKL:\"ZXCVBNM<>?";
const TH = "_ๅ/-ภถุึคตจขชๆไำพะัีรนยบลฃฟหกดเ้่าสวงผปแอิืทมใฝ%+๑๒๓๔ู฿๕๖๗๘๙๐\"ฎฑธํ๊ณฯญฐ,ฅฤฆฏโฌ็๋ษศซ.()ฉฮฺ์?ฒฬฦ";
const EN_TO_TH = new Map<string, string>();
const TH_TO_EN = new Map<string, string>();
for (let i = 0; i < EN.length; i++) {
  EN_TO_TH.set(EN[i]!, TH[i]!);
  if (!TH_TO_EN.has(TH[i]!)) TH_TO_EN.set(TH[i]!, EN[i]!);
}
const THAI_CHAR = /[฀-๿]/;

/** Re-reads text typed on the wrong layout: Latin → Thai if it has no Thai letters, Thai → Latin otherwise. */
export function swapLayout(s: string): string | undefined {
  const toThai = !THAI_CHAR.test(s);
  if (toThai && !/[a-z;',./[\]\\`\-=]/i.test(s)) return undefined; // digits only etc.
  const table = toThai ? EN_TO_TH : TH_TO_EN;
  let out = "";
  for (const ch of s) out += ch === " " ? " " : (table.get(ch) ?? ch);
  return out === s ? undefined : out;
}

/* ---------- matching one token against one field ---------- */
interface TokenMatch {
  score: number;
  ranges?: [number, number][];
}

function isWordStart(text: string, i: number) {
  if (i === 0) return true;
  const prev = text[i - 1];
  return /[\s\-_/.(,]/.test(prev!);
}

function contiguous(f: Folded, token: string, base: number): TokenMatch | null {
  if (!token) return null;
  let best: TokenMatch | null = null;
  let from = 0;
  for (;;) {
    const i = f.text.indexOf(token, from);
    if (i < 0) break;
    const exact = i === 0 && token.length === f.text.length;
    const score = base + (exact ? 60 : i === 0 ? 40 : isWordStart(f.text, i) ? 25 : 0) - Math.min(i, 20) * 0.3;
    if (!best || score > best.score) best = { score, ranges: [[f.map[i]!, f.map[i + token.length - 1]! + 1]] };
    from = i + 1;
  }
  return best;
}

/** Letters of `token` in order, with gaps. Prefers matches at word starts and tight clusters. */
function subsequence(f: Folded, token: string): TokenMatch | null {
  if (token.length < 2) return null;
  const idx: number[] = [];
  let j = 0;
  for (let i = 0; i < f.text.length && j < token.length; i++) {
    if (f.text[i] === token[j]) {
      idx.push(i);
      j++;
    }
  }
  if (j < token.length) return null;
  const spread = idx[idx.length - 1]! - idx[0]! + 1;
  const starts = idx.filter((i) => isWordStart(f.text, i)).length;
  const score = 18 + starts * 4 - (spread - token.length) * 0.6;
  const ranges: [number, number][] = [];
  for (const i of idx) {
    const o = f.map[i];
    const last = ranges[ranges.length - 1];
    if (last && last[1] === o) last[1] = o + 1;
    else ranges.push([o!, o! + 1]);
  }
  return { score: Math.max(score, 4), ranges };
}

interface Prepared<T> {
  item: T;
  label: Folded;
  labelLoose: Folded;
  rest: string; // other fields, folded loose, joined
}

function prepare<T extends Searchable>(item: T): Prepared<T> {
  const extra = [item.description, item.group, item.value, ...(item.keywords ?? [])].filter(Boolean).join(" \u0000 ");
  return { item, label: fold(item.label, false), labelLoose: fold(item.label, true), rest: foldQuery(extra, true) };
}

function matchToken<T>(p: Prepared<T>, raw: string): TokenMatch | null {
  const t = foldQuery(raw, false);
  const tl = foldQuery(raw, true);
  if (!t && !tl) return { score: 0 };
  const hit = contiguous(p.label, t, 100) ?? (tl ? contiguous(p.labelLoose, tl, 80) : null);
  if (hit) return hit;
  if (tl && p.rest.includes(tl)) return { score: 45 };
  return subsequence(p.labelLoose, tl) ?? subsequence(p.label, t);
}

function run<T>(prepared: Prepared<T>[], query: string): SearchHit<T>[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const hits: SearchHit<T>[] = [];
  for (const p of prepared) {
    let score = 0;
    const ranges: [number, number][] = [];
    let ok = true;
    for (const tok of tokens) {
      const m = matchToken(p, tok);
      if (!m) {
        ok = false;
        break;
      }
      score += m.score;
      if (m.ranges) ranges.push(...m.ranges);
    }
    if (ok) hits.push({ item: p.item, score, ranges: mergeRanges(ranges) });
  }
  return hits;
}

function mergeRanges(r: [number, number][]) {
  const s = [...r].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]);
    else out.push([...x]);
  }
  return out;
}

/** A reusable searcher: prepare once per option list, then query as the user types. */
export function createSearcher<T extends Searchable>(items: readonly T[]) {
  const prepared = items.map(prepare);
  return (query: string): SearchResult<T> => {
    if (!query.trim()) return { hits: prepared.map((p) => ({ item: p.item, score: 0, ranges: [] })) };
    const order = new Map(items.map((it, i) => [it, i]));
    const sort = (h: SearchHit<T>[]) => h.sort((a, b) => b.score - a.score || order.get(a.item)! - order.get(b.item)!);
    const hits = sort(run(prepared, query));
    const swapped = swapLayout(query);
    if (swapped) {
      const alt = sort(run(prepared, swapped));
      // Use the other layout only when it clearly reads better than what was typed.
      const best = hits[0]?.score ?? 0;
      if (alt.length && (alt[0]!.score > best + 20 || hits.length === 0)) return { hits: alt, layoutQuery: swapped };
    }
    return { hits };
  };
}

/** Splits a label into plain / highlighted parts. */
export function highlightParts(label: string, ranges: [number, number][]) {
  const parts: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const [s, e] of ranges) {
    if (s > at) parts.push({ text: label.slice(at, s), hit: false });
    parts.push({ text: label.slice(s, e), hit: true });
    at = e;
  }
  if (at < label.length) parts.push({ text: label.slice(at), hit: false });
  return parts;
}
