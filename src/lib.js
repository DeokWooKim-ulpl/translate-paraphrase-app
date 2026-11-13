/* ===== 순수 함수 모음 (DOM·런타임 없이 동작) — index.html 의 <script> 안에 그대로 들어감 ===== */

/* 글자 수(코드 포인트), 낱말 수, UTF-8 바이트 수 */
function cc(s) { return Array.from(s || '').length; }
function wc(s) { s = (s || '').trim(); return s ? s.split(/\s+/).length : 0; }
function bytes(s) { return new TextEncoder().encode(s || '').length; }
function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }

/* 기록 시각: 저장은 ISO(UTC), 표시는 보는 사람 시계 기준 */
function when(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return '';
  function z(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
}

/* 글의 언어 추정: 'ko' | 'en' | 'ja' | 'zh'. 한글이 글자의 10% 이상이거나 낱말 넷 중 하나에 한글이 있으면 한국어(영어 용어가 많은 물리 글 대비) */
function guessLang(text) {
  var t = (text || '').replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g, ' ').replace(/\\[A-Za-z]+/g, ' ');
  var hangul = (t.match(/[가-힣]/g) || []).length;
  var kana = (t.match(/[぀-ヿ]/g) || []).length;
  var han = (t.match(/[一-鿿]/g) || []).length;
  var latin = (t.match(/[A-Za-z]/g) || []).length;
  var letters = hangul + kana + han + latin;
  if (!letters) return 'en';
  if (kana > 0 && kana + han > hangul) return 'ja';
  if (hangul >= letters * 0.1) return 'ko';
  var words = t.trim().split(/\s+/), withHangul = words.filter(function (w) { return /[\uAC00-\uD7A3]/.test(w); }).length;
  if (hangul >= 3 && withHangul >= words.length * 0.25) return 'ko';   /* 영어 용어가 대부분이어도 조사·어미가 한글이면 한국어 */
  if (han > 0 && han >= latin * 0.3) return 'zh';
  return 'en';
}

/* ---------- 구획 파서 ----------
   모델 답 형식: <result>…</result><notes>…</notes> 처럼 태그로 구획을 나눔.
   스트리밍 중간(닫는 태그 없음, 태그가 반쯤 온 상태)에도 안전하게 읽음.
   돌려주는 값: {태그이름: 내용, …, _any: 태그를 하나라도 찾았는지, _open: 아직 닫히지 않은 태그} */
function parseTagged(text, tags) {
  var t = text || '', out = { _any: false, _open: '' }, i;
  var tail = /<\/?[A-Za-z0-9_]*$/.exec(t);
  if (tail) {
    var frag = tail[0].replace(/^<\/?/, '').toLowerCase();
    for (i = 0; i < tags.length; i++) {
      if (tags[i].indexOf(frag) === 0) { t = t.slice(0, tail.index); break; }
    }
  }
  var lower = t.toLowerCase(), pos = 0;
  function nextOpen(from) {
    var best = null;
    for (var j = 0; j < tags.length; j++) {
      var k = lower.indexOf('<' + tags[j] + '>', from);
      if (k >= 0 && (!best || k < best.at)) best = { tag: tags[j], at: k, start: k + tags[j].length + 2 };
    }
    return best;
  }
  for (;;) {
    var m = nextOpen(pos);
    if (!m) break;
    var close = '</' + m.tag + '>', end = lower.indexOf(close, m.start), stop;
    if (end >= 0) { stop = end; pos = end + close.length; out._open = ''; }
    else {
      var nx = nextOpen(m.start);
      if (nx) { stop = nx.at; pos = nx.at; out._open = ''; } else { stop = t.length; pos = t.length; out._open = m.tag; }
    }
    var body = t.slice(m.start, stop), again = body.toLowerCase().lastIndexOf('\n<' + m.tag + '>\n');
    if (again >= 0) body = body.slice(again + m.tag.length + 3);         /* 머리말에서 태그 이름을 되뇐 답 */
    out[m.tag] = body.replace(/^\s*\n/, '').replace(/\s+$/, '');
    out._any = true;
  }
  if (!out._any) out._plain = t.trim();
  return out;
}

/* ---------- 단어 단위 차이(diff) ----------
   diffRaw: [{t:'eq'|'del'|'ins', s}] 또는 null(너무 길어 계산 생략). 공통 앞·뒤를 먼저 떼고 가운데만 LCS 로 비교함.
   diffChanges: 화면·되돌리기용 목록 [{s:'같은 글'} | {a:'지운 글', b:'넣은 글'}].
     - 모든 조각의 (s 또는 b)를 이으면 새 글, (s 또는 a)를 이으면 원문이 정확히 나옴. */
function diffTokens(s) { return (s || '').match(/\s+|[^\s]+/g) || []; }
function diffRaw(a, b, capCells) { return diffSeq(diffTokens(a), diffTokens(b), capCells); }
function diffSeq(A, B, capCells) {
  var cap = capCells || 1.6e7;
  var ops = [];
  function push(t, s) {
    if (!s) return;
    var last = ops[ops.length - 1];
    if (last && last.t === t) last.s += s; else ops.push({ t: t, s: s });
  }
  var pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  var suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  var n = A.length - pre - suf, m = B.length - pre - suf;
  if ((n + 1) * (m + 1) > cap) return null;
  var i, j, W = m + 1;
  var L = (Math.min(n, m) < 65535) ? new Uint16Array((n + 1) * W) : new Int32Array((n + 1) * W);
  for (i = n - 1; i >= 0; i--) {
    for (j = m - 1; j >= 0; j--) {
      L[i * W + j] = A[pre + i] === B[pre + j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
    }
  }
  for (i = 0; i < pre; i++) push('eq', A[i]);
  i = 0; j = 0;
  while (i < n && j < m) {
    if (A[pre + i] === B[pre + j]) { push('eq', A[pre + i]); i++; j++; }
    else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) push('del', A[pre + i++]);
    else push('ins', B[pre + j++]);
  }
  while (i < n) push('del', A[pre + i++]);
  while (j < m) push('ins', B[pre + j++]);
  for (i = A.length - suf; i < A.length; i++) push('eq', A[i]);
  return ops;
}
/* 긴 글: 통째로는 한도를 넘어도 문단 수가 같으면 문단별로 비교함 */
function diffRawLong(a, b, capCells) {
  var whole = diffRaw(a, b, capCells);
  if (whole) return whole;
  var pa = (a || '').split(/(\n{2,})/), pb = (b || '').split(/(\n{2,})/);
  if (pa.length !== pb.length) return diffBySentence(a, b, capCells);
  var out = [];
  for (var i = 0; i < pa.length; i++) {
    var part = diffRaw(pa[i], pb[i], capCells);
    if (!part) return diffBySentence(a, b, capCells);
    out = out.concat(part);
  }
  return out;
}
/* 문단으로도 못 나누는 긴 글: 문장끼리 먼저 맞추고, 달라진 문장 묶음 안에서만 단어를 비교 */
function sentTokens(s) { return ((s || '').match(/[\s\S]*?(?:[.!?。！？]+["')\]]*\s+|\n+|$)/g) || []).filter(Boolean); }
function diffBySentence(a, b, capCells) {
  var coarse = diffSeq(sentTokens(a), sentTokens(b), capCells);
  if (!coarse) return null;
  var out = [], i = 0;
  function push(t, s) { if (!s) return; var last = out[out.length - 1]; if (last && last.t === t) last.s += s; else out.push({ t: t, s: s }); }
  while (i < coarse.length) {
    if (coarse[i].t === 'eq') { push('eq', coarse[i].s); i++; continue; }
    var d = '', n = '';
    while (i < coarse.length && coarse[i].t !== 'eq') { if (coarse[i].t === 'del') d += coarse[i].s; else n += coarse[i].s; i++; }
    var fine = diffRaw(d, n, capCells);
    if (!fine) {                                   /* 달라진 묶음도 너무 길면: 문장 수가 같을 때 문장끼리 짝지음 */
      var D = sentTokens(d), N = sentTokens(n);
      if (D.length !== N.length) return null;
      fine = [];
      for (var k = 0; k < D.length; k++) { var f = diffRaw(D[k], N[k], capCells); if (!f) return null; fine = fine.concat(f); }
    }
    fine.forEach(function (o) { push(o.t, o.s); });
  }
  return out;
}
function diffChanges(a, b, capCells) {
  var raw = diffRawLong(a, b, capCells);
  if (!raw) return null;
  var list = [], i = 0;
  while (i < raw.length) {
    if (raw[i].t === 'eq') {
      var last = list[list.length - 1];
      if (last && last.s !== undefined) last.s += raw[i].s; else list.push({ s: raw[i].s });
      i++; continue;
    }
    var c = { a: '', b: '' };
    while (i < raw.length && raw[i].t !== 'eq') { if (raw[i].t === 'del') c.a += raw[i].s; else c.b += raw[i].s; i++; }
    list.push(c);
  }
  /* '수정 · 공백 한 칸 · 수정' 은 한 덩어리로 묶음 (예: [-reduce the-] → [+reduces+]) */
  var out = [];
  list.forEach(function (o) {
    var p = out[out.length - 1], q = out[out.length - 2];
    var real = function (x) { return x && x.a !== undefined && (x.a.trim() || x.b.trim()); };
    if (real(o) && p && p.s !== undefined && !p.s.trim() && !/\n/.test(p.s) && real(q)) {
      q.a += p.s + o.a; q.b += p.s + o.b; out.pop();
    } else out.push(o);
  });
  return out;
}
/* 수정 목록에서 현재 글을 만듦: 되돌린(rej) 수정은 원문 쪽을 씀 */
function composeChanges(list) {
  return list.map(function (o) { return o.s !== undefined ? o.s : (o.rej ? o.a : o.b); }).join('');
}

/* ---------- 긴 글 나누기 (번역용) ----------
   돌려주는 값: [{text, sep}] — sep 은 그 조각 뒤에 원문에서 있던 구분(빈 줄·줄바꿈·공백·없음).
   문단 경계 > 줄바꿈 > 문장 끝(한중일 마침표 포함) > 공백 > 글자 순으로 자름. */
var ABBR_END = /(?:\b(?:Figs?|Eqs?|Refs?|Secs?|Tabs?|Nos?|Vol|pp?|al|i\.e|e\.g|cf|vs|approx|ca|Dr|Prof|Mr|Ms|Mrs|St|resp|viz)|\b[A-Z])\.$/;
function splitLong(p, max) {
  var out = [], rest = p;
  while (cc(rest) > max) {
    var head = Array.from(rest).slice(0, max).join('');
    var floor = head.length * 0.3, cut = -1, k, m, soft = -1;
    /* 1) 문장이 끝난 자리(줄 끝이면 더 좋음). 'Fig.' 'et al.' 같은 약어의 마침표는 문장 끝이 아님 */
    var re = /[。！？]+|．+(?![0-9０-９])|[.!?]+["')\]]*(?=\s)/g;
    while ((m = re.exec(head))) {
      var e = m.index + m[0].length;
      if (e <= floor) continue;
      if (m[0].charAt(0) === '.' && ABBR_END.test(head.slice(Math.max(0, m.index - 8), m.index + 1))) continue;
      cut = e;
    }
    /* 2) 문장 끝이 없으면 줄바꿈(목록·표·수식 줄), 3) 공백, 4) 글자 */
    if (cut < 0) { k = head.lastIndexOf('\n'); if (k > floor) cut = k + 1; }
    if (cut < 0) { k = head.search(/\s\S*$/); if (k > floor) cut = k + 1; }
    if (cut < 0) cut = head.length;
    var piece = rest.slice(0, cut);
    rest = rest.slice(cut);
    var ws = /^\s*/.exec(rest)[0];
    rest = rest.slice(ws.length);
    var trail = /\s*$/.exec(piece)[0];
    piece = piece.slice(0, piece.length - trail.length);
    out.push({ text: piece, sep: trail + ws });
  }
  if (rest) out.push({ text: rest, sep: '' });
  return out;
}

function chunkText(text, max) {
  var parts = (text || '').split(/(\n{2,})/), units = [], i;
  for (i = 0; i < parts.length; i += 2) {
    var p = parts[i], sep = parts[i + 1] || '';
    if (!p) continue;
    if (cc(p) <= max) units.push({ text: p, sep: sep });
    else {
      var ps = splitLong(p, max);
      ps[ps.length - 1].sep = sep;
      for (var q = 0; q < ps.length; q++) units.push(ps[q]);
    }
  }
  var out = [], cur = null;
  for (i = 0; i < units.length; i++) {
    var u = units[i];
    if (cur && cc(cur.text) + cc(cur.sep) + cc(u.text) <= max) { cur.text += cur.sep + u.text; cur.sep = u.sep; }
    else { if (cur) out.push(cur); cur = { text: u.text, sep: u.sep }; }
  }
  if (cur) out.push(cur);
  return out;
}
/* 번역된 조각을 이을 때 넣을 구분: 원문 구분을 따르되, 문단 안에서 잘린 곳은 대상 언어에 맞춤 */
function joinSep(sep, dst) {
  if (/\n\s*\n/.test(sep)) return '\n\n';
  if (/\n/.test(sep)) return '\n';
  return (dst === 'ja' || dst === 'zh') ? '' : ' ';
}

/* ---------- 수치·수식·인용 보존 검사 (모델 호출 없음) ----------
   원문에 있던 숫자, LaTeX 수식, [n] 인용 번호가 결과에도 같은 개수로 있는지 봄. */
var BIGNUM = { '천': 1e3, '만': 1e4, '억': 1e8, '조': 1e12, thousand: 1e3, million: 1e6, billion: 1e9 };
function extractFacts(text) {
  var t = text || '', facts = { num: [], tex: [], cite: [] }, m;
  var texRe = /\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g;
  while ((m = texRe.exec(t))) facts.tex.push(m[0].replace(/\s+/g, ''));
  var plain = t.replace(texRe, ' ');
  /* 인용: [3], [4] 와 [3, 4], [5–7] 과 [5, 6, 7] 은 같은 것으로 봄 → 번호 하나씩 */
  var citeRe = /\[\s*\d+(?:\s*[-–,]\s*\d+)*\s*\]/g;
  while ((m = citeRe.exec(plain))) {
    m[0].replace(/[\[\]\s]/g, '').split(',').forEach(function (part) {
      var r = part.split(/[-–]/), a = +r[0], b = r.length > 1 ? +r[1] : a;
      if (b >= a && b - a <= 50) { for (var n = a; n <= b; n++) facts.cite.push('[' + n + ']'); } else facts.cite.push('[' + part.replace(/–/g, '-') + ']');
    });
  }
  plain = plain.replace(citeRe, ' ');
  /* 숫자: 앞의 음수 부호(범위 10–20, 3-dB 의 줄표는 부호가 아님)와 뒤의 만·억·million 을 함께 읽음 */
  var numRe = /(^|[\s(\[{=<>≈~×*\/^:,;])?([-−–])?(\d+(?:[.,]\d+)*(?:[eE][-+−]?\d+)?)(?:\s*(천|만(?!큼)|억|조(?![가-힣]))|\s+(thousand|million|billion)\b)?/g;
  while ((m = numRe.exec(plain))) {
    var neg = m[2] && m[1] !== undefined && (m[2] !== '–' || !/\s/.test(m[1])) ? '-' : '';   /* 띄어 쓴 – 는 범위 표시로 봄 */
    var s = m[3], mult = BIGNUM[m[4] || (m[5] || '').toLowerCase()];
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    if (mult && /^\d+(\.\d+)?$/.test(s)) { facts.num.push(neg + String(Math.round(parseFloat(s) * mult))); continue; }
    s.split(',').forEach(function (x, i) { if (x) facts.num.push((i ? '' : neg) + x); });
  }
  return facts;
}

function bagDiff(a, b) {           /* a 에는 있고 b 에는 없는 것(개수까지 따짐) */
  var count = {}, out = [];
  b.forEach(function (x) { count[x] = (count[x] || 0) + 1; });
  a.forEach(function (x) { if (count[x]) count[x]--; else out.push(x); });
  return out;
}
function integrity(src, out) {
  var A = extractFacts(src), B = extractFacts(out);
  var r = {
    counts: { num: A.num.length, tex: A.tex.length, cite: A.cite.length },
    missing: { num: bagDiff(A.num, B.num), tex: bagDiff(A.tex, B.tex), cite: bagDiff(A.cite, B.cite) },
    added: { num: bagDiff(B.num, A.num), tex: bagDiff(B.tex, A.tex), cite: bagDiff(B.cite, A.cite) }
  };
  r.ok = !r.missing.num.length && !r.missing.tex.length && !r.missing.cite.length &&
    !r.added.num.length && !r.added.tex.length && !r.added.cite.length;
  r.total = r.counts.num + r.counts.tex + r.counts.cite;
  return r;
}

/* ---------- 원문 표현 재사용률 (낮을수록 많이 바뀜) ----------
   영어: 기능어(the, of …)를 빼고 낱말 비교. 한국어: 조사·어미 영향을 줄이려고 한글 두 글자 묶음으로 비교. */
var STOPWORDS = new Set(('a an the of in on at to for and or but nor with by from as is are was were be been being this that these those ' +
  'it its which who whom whose we our us they their them he she his her you your i my me not no so if then than also can could may might ' +
  'will would shall should do does did has have had into onto over under between through during about above below up down out off such').split(' '));
function overlapUnits(text, lang) {
  var t = (text || '').toLowerCase(), out = [];
  if (lang === 'ko') {
    (t.match(/[가-힣]+|[a-z0-9]+/g) || []).forEach(function (run) {
      if (/[a-z0-9]/.test(run)) { if (run.length >= 2) out.push(run); return; }
      if (run.length === 1) return;
      for (var i = 0; i + 2 <= run.length; i++) out.push(run.slice(i, i + 2));
    });
    return out;
  }
  (t.match(/[\p{L}\p{N}]+/gu) || []).forEach(function (w) { if (w.length >= 2 && !STOPWORDS.has(w)) out.push(w); });
  return out;
}
function overlapPct(a, b, lang) {
  var A = new Set(overlapUnits(a, lang)), B = overlapUnits(b, lang);
  if (!B.length) return 0;
  var n = 0;
  B.forEach(function (x) { if (A.has(x)) n++; });
  return Math.round(100 * n / B.length);
}

/* 원문 구절 재사용률: 결과의 세 단어 묶음 가운데 원문에도 그대로 있는 비율.
   용어·숫자는 그대로여도 문장을 다시 지었으면 낮아지므로 '얼마나 다시 썼나'를 낱말 비교보다 잘 보여 줌 */
function phrasePct(a, b, lang) {
  function grams(t) {
    var w = (t || '').toLowerCase().match(lang === 'ko' ? /[\uAC00-\uD7A3]+|[a-z0-9]+/g : /[\p{L}\p{N}]+/gu) || [], g = [];
    for (var i = 0; i + 3 <= w.length; i++) g.push(w.slice(i, i + 3).join(' '));
    return g;
  }
  var A = new Set(grams(a)), B = grams(b), n = 0;
  if (!B.length) return 0;
  B.forEach(function (x) { if (A.has(x)) n++; });
  return Math.round(100 * n / B.length);
}

/* 기록 한 건이 저장 한도(256 KiB)를 넘지 않게 긴 글을 줄임. 줄였으면 clipped:true */
function clipRecord(rec, maxBytes) {
  var cap = maxBytes || 200000;
  if (bytes(JSON.stringify(rec)) <= cap) return rec;
  var r = Object.assign({}, rec), guard = 0;
  /* 패러프레이즈 안이 여럿이면 고르지 않은 오래된 안부터 덜어 냄 */
  if (Array.isArray(r.versions) && r.versions.length > 1) {
    var vs = r.versions.slice(), sel = Math.min(Math.max(0, r.sel || 0), vs.length - 1);
    while (vs.length > 1 && bytes(JSON.stringify(Object.assign({}, r, { versions: vs }))) > cap) {
      var drop = sel === 0 ? 1 : 0;
      vs.splice(drop, 1);
      if (drop < sel) sel--;
    }
    r.versions = vs; r.sel = sel;
  }
  while (bytes(JSON.stringify(r)) > cap && guard++ < 40) {
    ['input', 'output', 'notes'].forEach(function (k) {
      if (typeof r[k] === 'string' && r[k].length > 2000) r[k] = r[k].slice(0, Math.floor(r[k].length * 0.8));
    });
  }
  r.clipped = true;
  return r;
}

if (typeof module !== 'undefined') {
  module.exports = { cc: cc, wc: wc, bytes: bytes, fmt: fmt, when: when, guessLang: guessLang, parseTagged: parseTagged, diffRaw: diffRaw, diffChanges: diffChanges, composeChanges: composeChanges,
    splitLong: splitLong, chunkText: chunkText, joinSep: joinSep, extractFacts: extractFacts, integrity: integrity, overlapPct: overlapPct, phrasePct: phrasePct, clipRecord: clipRecord };
}
