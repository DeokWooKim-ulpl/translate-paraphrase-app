/* ===== 화면 공통: 도우미, Claude 호출, 탭 상태, 결과 그리기 ===== */

document.documentElement.lang = 'ko';
var $ = function (id) { return document.getElementById(id); };
function el(tag, attrs, text) {
  var e = document.createElement(tag);
  if (attrs) for (var k in attrs) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
  if (text != null) e.textContent = text;
  return e;
}
function chipEl(text, cls, title) {
  var c = el('span', { class: 'chip ' + (cls || 'mute') }, text);
  if (title) c.title = title;
  return c;
}
function btnEl(label, cls, fn, title) {
  var b = el('button', { type: 'button', class: 'act' + (cls ? ' ' + cls : '') }, label);
  if (title) b.title = title;
  if (fn) b.onclick = fn;
  return b;
}
/* localStorage: 막혀 있어도 페이지가 돌아가게 모두 try/catch. LS(k) 읽기, LS(k, v) 쓰기, LS(k, null) 지우기 */
function LS(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  } catch (e) { /* 저장소를 못 써도 무시 */ }
  return null;
}
function LSjson(k) { try { return JSON.parse(LS(k) || 'null'); } catch (e) { return null; } }
function say(t) { var r = $('sr'); r.textContent = ''; setTimeout(function () { r.textContent = t; }, 50); }
function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
function flash(ta) { ta.classList.add('flash'); setTimeout(function () { ta.classList.remove('flash'); }, 1200); }
function copyText(t, btn) {
  var old = btn.dataset.label || btn.textContent;
  btn.dataset.label = old;
  function done(ok) { btn.textContent = ok ? '복사됨' : '복사 실패'; say(ok ? '복사했습니다' : '복사하지 못했습니다'); setTimeout(function () { btn.textContent = old; }, 1200); }
  function fallback() {
    try { var ta = el('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); done(ok); }
    catch (e) { done(false); }
  }
  try { navigator.clipboard.writeText(t).then(function () { done(true); }, fallback); } catch (e) { fallback(); }
}
/* 입력 칸 내용을 바꾸되 브라우저의 실행 취소(Ctrl+Z) 기록을 살림 */
function setIn(ta, v) {
  var ok = false;
  try { ta.focus({ preventScroll: true }); ta.select(); ok = document.execCommand(v ? 'insertText' : 'delete', false, v); } catch (e) { ok = false; }
  if (!ok || ta.value !== v) ta.value = v;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}
/* 칩 묶음(nav.sub): 누른 칩에 aria-pressed */
function pick(nav, v) {
  nav.querySelectorAll('button[data-v]').forEach(function (x) { x.setAttribute('aria-pressed', x.dataset.v === v ? 'true' : 'false'); });
}
function sub(nav, cb) {
  nav.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]');
    if (!b || b.disabled || !nav.contains(b)) return;
    pick(nav, b.dataset.v);
    cb(b.dataset.v);
  });
}

/* ---------- 런타임(claude.ai 가 페이지에 주는 기능) ---------- */
function use(name) {
  try { return window.claude && window.claude.use ? window.claude.use(name) : Promise.resolve(null); }
  catch (e) { return Promise.resolve(null); }
}
var sampleP = use('sample'), dbP = use('db'), userP = use('user'), dlP = use('downloads');

/* 모델: 빠름 = Haiku 5.5 · 깊게 = Sonnet 5.5, 둘 다 effort medium (사용자 결정). 못 쓰는 계정이면 같은 등급 모델이 대신 답함 */
var MODELS = {
  quick: { model: 'claude-haiku-5-5', modelTier: 'quick', effort: 'medium', label: 'Haiku 5.5' },
  deep: { model: 'claude-sonnet-5-5', modelTier: 'default', effort: 'medium', label: 'Sonnet 5.5' }
};
var tier = $('tier');
function modelOpts() { return MODELS[tier.value] || MODELS.quick; }
function modelChip(r, mo) {
  if (r.modelApplied) return { t: mo.label, c: 'mute', tip: mo.label + ' · effort medium' };
  if (r.modelTierApplied === mo.modelTier) return { t: mo.label + ' 대신 같은 등급 모델', c: 'mute', tip: '이 계정에서는 ' + mo.label + ' 을(를) 직접 지정할 수 없어 같은 등급의 기본 모델이 답했습니다.' };
  return { t: '다른 등급 모델이 답함', c: 'mid', tip: '요청한 등급을 쓸 수 없어 다른 등급의 모델이 답했습니다.' };
}

/* 오류 문구: 런타임의 영어 개발자 메시지는 보여 주지 않음 */
var OFFMSG = '이 화면에서는 Claude 호출 기능을 쓸 수 없습니다.', BUGMSG = '요청 형식 오류입니다(페이지 버그). 알려 주세요.';
var ERR = {
  cancelled: '멈췄습니다.',
  not_granted: 'Claude 호출이 허용되지 않았습니다. 다시 쓰려면 페이지를 새로 여세요.',
  sampling_disabled: '이 계정(또는 조직)에서는 Claude 호출을 쓸 수 없습니다.',
  not_declared: OFFMSG, capability_disabled: OFFMSG, capability_removed: OFFMSG,
  rate_limited: '사용량 한도에 걸렸습니다. 잠시 뒤에 다시 눌러 주세요.',
  session_expired: '로그인이 만료되었습니다. claude.ai에 다시 로그인한 뒤 실행하세요.',
  prompt_too_large: '글이 너무 깁니다. 나눠서 넣어 주세요.',
  refused: 'Claude가 이 글은 처리하지 않았습니다. 내용을 바꿔서 다시 해 보세요.',
  empty_completion: '답이 비어 있었습니다. 글을 줄이거나 나눠서 다시 해 보세요.',
  upstream_error: '연결이 끊겼습니다. 다시 눌러 주세요.',
  invalid_request: BUGMSG, transform_error: BUGMSG, queue_overflow: BUGMSG
};
var PERM = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
var sampleOff = '', MAXB = 262144;
function killSample(m) {
  sampleOff = m;
  [P, T].forEach(function (tab) { setStatus(tab, m, 'err'); sync(tab); });
}

/* Claude 한 번 부르기. 돌려주는 값: {ok, text, truncated, model} 또는 {ok:false, code, msg, text(끊기기 전까지 온 글 | null)}
   o: {onText(지금까지 온 답 전체), gen(이 실행의 번호), mo(모델), fresh(같은 입력이어도 새 답을 받을지)} */
async function ask(tab, prompt, o) {
  o = o || {};
  var s = await sampleP;
  if (!s || sampleOff) return { ok: false, code: 'not_declared', msg: sampleOff || OFFMSG, text: null };
  if (tab.job.stopped) return { ok: false, code: 'cancelled', msg: ERR.cancelled, text: null };
  var nb = bytes(prompt);
  if (nb > MAXB) return { ok: false, code: 'prompt_too_large', text: null, msg: ERR.prompt_too_large + ' (' + Math.round(nb / 1024) + ' KB, 한도 ' + Math.round(MAXB / 1024) + ' KB)' };
  var ctl = new AbortController(), mo = o.mo || modelOpts();
  tab.job.ctl = ctl;
  var opts = {
    model: mo.model, modelTier: mo.modelTier, effort: mo.effort, signal: ctl.signal,
    onText: function (u) {
      if (o.gen !== undefined && o.gen !== tab.job.gen) return;       /* 이미 다른 내용으로 갈아끼운 뒤에 온 답은 버림 */
      if (o.onText) { try { o.onText(u.text); } catch (e) { console.warn('onText', e); } }
    }
  };
  if (o.fresh) opts.cache = false;
  try {
    var r = await s(prompt, opts);
    return { ok: true, text: r.text, truncated: !!r.truncated, model: modelChip(r, mo) };
  } catch (e) {
    var code = e && Object.prototype.hasOwnProperty.call(ERR, e.code) ? e.code : 'upstream_error';
    if (!e || code !== e.code) console.warn('sample', e);
    if (PERM.indexOf(code) >= 0) killSample(ERR[code]);
    return { ok: false, code: code, msg: ERR[code], text: code !== 'refused' && e && typeof e.text === 'string' && e.text.trim() ? e.text : null };
  } finally {
    if (tab.job.ctl === ctl) tab.job.ctl = null;
  }
}

/* ---------- 탭 상태 ----------
   res(결과) = {kind:'fix'|'para'|'tr', text(입력), lang(결과 언어), src, dst, style, level, note, key,
                versions:[{label, out(지금 글), notes}], cur, ops(교정의 수정 목록), part(미완성), histId, at, model, tier, round, edited} */
function Tab(k) {
  return { k: k, in: $(k + '-in'), out: $(k + '-out'), run: $(k + '-run'),
    job: { busy: false, gen: 0, ctl: null, kind: '', stopped: false },
    res: null, vFix: 'marks', vText: 'new', side: 'notes', sel: null, review: null, alt: null, back: null, undo: false, saveT: 0 };
}
var P = Tab('p'), T = Tab('t');
P.langSel = 'auto'; P.lang = 'en'; P.mode = 'fix'; P.style = 'standard'; P.level = 'standard'; P.triple = true; P.earlier = { key: '', list: [] };
T.style = 'standard'; T.keep = { key: '', outs: [], notes: [] };
var CHUNK = 5000;                         /* 번역·교정에서 한 번에 보낼 최대 글자 수 */
var LG = { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh-Hans' };

function curOut(tab) { return tab.res ? tab.res.versions[tab.res.cur].out : ''; }
function realChange(o) { return o.a !== undefined && !!(o.a.trim() || o.b.trim()); }
function isPlainView(tab) {
  var r = tab.res;
  if (!r) return false;
  if (r.part) return true;
  return r.kind === 'fix' ? (tab.vFix === 'clean' || !r.ops) : tab.vText === 'new';
}
function emptyText(tab) {
  if (tab.k === 't') return '번역한 글이 여기에 뜹니다.';
  return P.mode === 'fix' ? '교정한 글이 여기에 뜹니다. 바뀐 곳은 색으로 표시되고, 눌러서 하나씩 되돌릴 수 있습니다.' : '패러프레이즈한 글이 여기에 뜹니다.';
}

/* 한 탭에서는 한 번에 한 가지 호출만: 실행(run)이든 점검·다른 표현(side)이든 */
function begin(tab, kind) {
  if (tab.job.busy) return 0;
  tab.job.busy = true; tab.job.kind = kind; tab.job.stopped = false; tab.job.gen++;
  sync(tab);
  return tab.job.gen;
}
function end(tab) {
  tab.job.busy = false; tab.job.kind = ''; tab.job.ctl = null; tab.job.stopped = false;
  tab.out.classList.remove('busy', 'stale'); tab.out.removeAttribute('aria-busy');
  sync(tab);
}
function stopJob(tab) {
  if (!tab.job.busy) return;
  tab.job.stopped = true;
  if (tab.job.ctl) tab.job.ctl.abort();
}
/* 탭 내용을 다른 것으로 갈아끼울 때: 진행 중이던 호출을 버리고, 늦게 온 답이 화면을 덮지 못하게 함 */
function cancel(tab) {
  var was = tab.job.busy;
  tab.job.gen++;
  if (tab.job.ctl) tab.job.ctl.abort();
  if (was) end(tab);
  if (tab.review && tab.review.running) tab.review = null;
  if (tab.alt && tab.alt.running) tab.alt = null;
  if (tab.back && tab.back.running) tab.back = null;
}
function startBusy(tab) {
  var box = tab.out;
  box.classList.add('busy'); box.setAttribute('aria-busy', 'true');
  if (tab.res) box.classList.add('stale');
  else { box.classList.remove('empty'); box.textContent = '생각하는 중…'; }
  setStatus(tab, '', '');
}
function live(tab, text) {
  if (!text) return;
  tab.out.classList.remove('stale', 'empty');
  tab.out.textContent = text;
}

/* ---------- 상태 줄 + 칩 ---------- */
function setStatus(tab, text, cls, acts) {
  var k = tab.k, a = $(k + '-status-acts');
  $(k + '-status').textContent = text || '';
  a.textContent = '';
  (acts || []).forEach(function (x) { a.appendChild(btnEl(x.label, 'sm', x.fn)); });
  $(k + '-statusbar').className = 'status' + (cls ? ' ' + cls : '');
  syncStatusBar(tab);
}
function syncStatusBar(tab) {
  var k = tab.k;
  var empty = !$(k + '-status').textContent && !$(k + '-status-acts').childNodes.length && !$(k + '-chips').childNodes.length;
  $(k + '-statusbar').classList.toggle('none', empty);
}
function isStale(tab) {
  var r = tab.res;
  if (!r || r.part) return false;
  if (tab.in.value.trim() !== r.text) return true;
  if (tab.k === 'p') return r.kind !== P.mode || (r.kind === 'para' && r.style !== P.style) || (r.kind === 'fix' && r.level !== P.level);
  return r.dst !== $('t-dst').value || r.style !== T.style;
}
function chips(tab) {
  var k = tab.k, box = $(k + '-chips'), r = tab.res;
  box.textContent = '';
  if (r && !r.part) {
    var out = curOut(tab), ig = integrity(r.text, out);
    if (!ig.ok) {
      var c = chipEl('수치·수식·인용 확인', integBad(ig) ? 'no' : 'mid', '원문과 결과의 숫자·수식·인용 번호가 다릅니다. 「' + (k === 'p' ? '바뀐 곳' : '번역 메모') + '」 맨 위를 보세요.');
      c.style.cursor = 'pointer'; c.onclick = function () { setSide(tab, 'notes'); };
      box.appendChild(c);
    } else if (ig.total) box.appendChild(chipEl('수치·수식·인용 ' + ig.total + '개 그대로', 'ok', '원문의 숫자·수식·인용 번호가 결과에 모두 그대로 있습니다 (모델 없이 대조).'));
    var cap = wordCap(r.note);
    if (cap && r.kind !== 'fix') {
      var n = cap.unit === 'w' ? wc(out) : cc(out);
      box.appendChild(chipEl(fmt(n) + ' / ' + fmt(cap.n) + (cap.unit === 'w' ? ' 단어' : ' 자'), n <= cap.n ? 'ok' : 'no', '맥락·지시에 적은 길이 한도'));
    }
    if (r.model) box.appendChild(chipEl(r.model.t, r.model.c, r.model.tip));
    if (isStale(tab)) box.appendChild(chipEl('입력·설정이 바뀜', 'mid', '지금 결과는 바뀌기 전의 입력·설정으로 만든 것입니다.'));
  }
  syncStatusBar(tab);
}
function integBad(ig) {
  return !!(ig.missing.tex.length || ig.added.tex.length || ig.missing.cite.length || ig.added.cite.length ||
    ig.missing.num.concat(ig.added.num).some(function (x) { return x.indexOf('.') >= 0 || x.length >= 2; }));
}
function counts(tab) {
  var k = tab.k, r = tab.res, out = curOut(tab);
  $(k + '-ow').textContent = fmt(wc(out)); $(k + '-oc').textContent = fmt(cc(out));
  if (k !== 'p') return;
  var d = $('p-delta');
  if (!r || r.part || !out) { d.hidden = true; return; }
  var ko = r.lang === 'ko', a = ko ? cc(r.text) : wc(r.text), b = ko ? cc(out) : wc(out);
  var pc = a ? Math.round(100 * (b - a) / a) : 0;
  d.hidden = !a; d.textContent = (pc > 0 ? '+' : '') + pc + '%';
  d.title = '원문 ' + fmt(a) + (ko ? '자' : '단어') + ' → ' + fmt(b) + (ko ? '자' : '단어');
  d.className = 'chip ' + (Math.abs(pc) >= 15 ? 'mid' : 'mute');
}

/* ---------- 버튼 켜고 끄기 ---------- */
function sync(tab) {
  var k = tab.k, r = tab.res, busy = tab.job.busy, off = !!sampleOff, txt = !!tab.in.value.trim();
  var has = !!curOut(tab), whole = !!r && !r.part, running = busy && tab.job.kind === 'run';
  var run = tab.run;
  if (running) { run.textContent = '멈추기'; run.className = 'act stop'; run.disabled = false; run.title = 'Esc'; }
  else {
    run.textContent = k === 't' ? '번역하기' : (P.mode === 'fix' ? '교정하기' : '패러프레이즈하기');
    run.className = 'act main'; run.disabled = busy || off || !txt; run.title = 'Ctrl+Enter (Mac: ⌘+Enter)';
  }
  $(k + '-again').disabled = busy || off || !txt || !r;
  $(k + '-copy-out').disabled = !has;
  var st = $(k + '-sidetab');
  st.querySelector('[data-v="review"]').disabled = !whole || (off && !tab.review) || (busy && !tab.review);
  st.querySelector('[data-v="alt"]').disabled = !whole || off;
  if (k === 'p') {
    $('p-use').disabled = busy || !whole;
    $('p-send').disabled = busy || !whole;
  } else {
    var okp = whole && (r.dst === 'ko' || r.dst === 'en');
    $('t-fix').disabled = $('t-para').disabled = busy || !okp;
    $('t-fix').title = $('t-para').title = whole && !okp ? '교정·패러프레이즈는 영어·한국어만 됩니다' : '번역 결과를 교정·패러프레이즈 탭의 입력 칸으로 보냅니다';
    $('t-swap').disabled = busy;
    var bk = st.querySelector('[data-v="back"]');
    bk.hidden = !(whole && (r.dst === 'ja' || r.dst === 'zh'));
    bk.disabled = off && !tab.back;
  }
}

/* ---------- 결과 그리기 ---------- */
function paint(tab) {
  var box = tab.out, r = tab.res;
  box.classList.remove('busy', 'stale');
  if (!r) { box.classList.add('empty'); box.textContent = emptyText(tab); box.removeAttribute('lang'); return; }
  box.classList.remove('empty'); box.textContent = ''; box.lang = LG[r.lang] || 'en';
  var out = curOut(tab);
  if (r.part || isPlainView(tab)) { box.textContent = out; return; }
  if (r.kind === 'fix') { paintOps(box, r); return; }
  paintPair(box, r.text, out);
}
/* 교정: 수정마다 눌러서 되돌리거나 다시 적용할 수 있는 조각 */
function paintOps(box, r) {
  r.ops.forEach(function (o, i) {
    if (o.s !== undefined) { box.appendChild(document.createTextNode(o.s)); return; }
    if (!realChange(o)) { box.appendChild(document.createTextNode(o.rej ? o.a : o.b)); return; }      /* 공백만 바뀐 곳은 표시 없이 */
    var sp = el('span', { class: 'chg' + (o.rej ? ' rej' : ''), role: 'button', tabindex: '0', 'aria-pressed': o.rej ? 'true' : 'false', 'data-i': i,
      title: o.rej ? '되돌린 수정입니다. 누르면 다시 적용합니다.' : '누르면 이 수정을 되돌립니다.' });
    if (o.a) sp.appendChild(el('del', null, o.a));
    if (o.b) sp.appendChild(el('ins', null, o.b));
    box.appendChild(sp);
  });
}
/* 원문과 나란히: 문단 수가 같으면 문단끼리, 아니면 통째로 */
function paintPair(box, src, out) {
  var A = src.split(/\n{2,}/), B = out.split(/\n{2,}/);
  if (A.length !== B.length) { A = [src]; B = [out]; }
  A.forEach(function (a, i) {
    var d = el('div', { class: 'pair' });
    d.appendChild(el('div', { class: 'src' }, a));
    d.appendChild(el('div', { class: 'new' }, B[i]));
    box.appendChild(d);
  });
}
function toggleChange(tab, i) {
  var r = tab.res;
  if (!r || !r.ops || !r.ops[i] || tab.job.busy) return;
  r.ops[i].rej = !r.ops[i].rej;
  r.versions[r.cur].out = composeChanges(r.ops);
  r.edited = true;
  if (tab.review) tab.review.stale = true;
  tab.sel = null;
  paint(tab); counts(tab); chips(tab); renderSide(tab); sync(tab); queueSave(tab);
  var sp = tab.out.querySelector('.chg[data-i="' + i + '"]');
  if (sp) sp.focus({ preventScroll: true });
}
/* 결과 글을 바꿈 (점검 반영, 다른 표현). why: 'review' 면 점검 목록은 그대로 둠 */
function setOutText(tab, text, why) {
  var r = tab.res;
  if (!r) return;
  r.versions[r.cur].out = text;
  r.edited = true;
  if (r.kind === 'fix') r.ops = diffChanges(r.text, text);
  if (why !== 'review' && tab.review) tab.review.stale = true;
  tab.sel = null;
  refresh(tab);
  queueSave(tab);
}
function refresh(tab) {
  paint(tab); counts(tab); renderVers(tab); renderView(tab); renderSide(tab); chips(tab); sync(tab);
}

/* 설명 칸에서 구절에 마우스를 올리면 결과에서 그 자리를 표시 */
function markPhrase(tab, phrase) {
  var r = tab.res;
  if (!phrase || tab.job.busy || !r) return null;
  var out = curOut(tab), box = tab.out, i = out.indexOf(phrase);
  if (i < 0) return null;
  if (isPlainView(tab)) {
    box.textContent = '';
    box.appendChild(document.createTextNode(out.slice(0, i)));
    var m = el('mark', null, phrase);
    box.appendChild(m);
    box.appendChild(document.createTextNode(out.slice(i + phrase.length)));
    return m;
  }
  if (r.kind === 'fix' && r.ops) {
    var pos = 0, hit = null;
    r.ops.forEach(function (o, n) {
      var t = o.s !== undefined ? o.s : (o.rej ? o.a : o.b);
      if (!hit && realChange(o) && pos < i + phrase.length && pos + t.length > i) hit = box.querySelector('.chg[data-i="' + n + '"]');
      pos += t.length;
    });
    if (hit) hit.classList.add('hit');
    return hit;
  }
  return null;
}
function unmark(tab) {
  if (tab.job.busy || !tab.res) return;
  if (tab.out.querySelector('mark')) paint(tab);
  tab.out.querySelectorAll('.chg.hit').forEach(function (s) { s.classList.remove('hit'); });
}

/* 결과 머리줄: 안 고르기(패러프레이즈), 보기 바꾸기 */
function renderVers(tab) {
  if (tab.k !== 'p') return;
  var nav = $('p-vers'), r = tab.res;
  nav.textContent = '';
  if (!r || r.part || r.kind !== 'para' || r.versions.length < 2) { nav.hidden = true; return; }
  nav.hidden = false;
  r.versions.forEach(function (v, i) {
    nav.appendChild(el('button', { type: 'button', 'data-v': String(i), 'aria-pressed': i === r.cur ? 'true' : 'false' }, v.label));
  });
}
function renderView(tab) {
  var nav = $(tab.k + '-view'), r = tab.res;
  nav.textContent = '';
  if (!r || r.part || (r.kind === 'fix' && !r.ops)) { nav.hidden = true; return; }
  nav.hidden = false;
  var opts = r.kind === 'fix' ? [['marks', '변경 표시'], ['clean', '깨끗한 글']] : [['new', r.kind === 'tr' ? '번역문' : '새 글'], ['pair', '원문과 나란히']];
  var cur = r.kind === 'fix' ? tab.vFix : tab.vText;
  opts.forEach(function (o) {
    nav.appendChild(el('button', { type: 'button', 'data-v': o[0], 'aria-pressed': o[0] === cur ? 'true' : 'false' }, o[1]));
  });
}
