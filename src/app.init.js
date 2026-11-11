/* ===== 시작: 큰 탭, 버튼 연결, 설정·초안 기억, 단축키 ===== */

/* ---------- 큰 탭 ---------- */
var TABS = ['polish', 'translate', 'terms', 'history'];
function showTab(t, keep) {
  if (TABS.indexOf(t) < 0) t = 'polish';
  document.querySelectorAll('nav.top button').forEach(function (b) {
    var on = b.dataset.tab === t;
    b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
  });
  TABS.forEach(function (x) { $('tab-' + x).hidden = x !== t; });
  if (keep) LS('tp.tab', t);
  if (location.hash !== '#' + t) { try { history.replaceState(null, '', '#' + t); } catch (e) { /* 주소를 못 바꿔도 무시 */ } }
}
function currentTab() {
  var b = document.querySelector('nav.top button[aria-selected="true"]');
  return b ? b.dataset.tab : 'polish';
}
var topNav = document.querySelector('nav.top');
topNav.addEventListener('click', function (e) { var b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab, true); });
topNav.addEventListener('keydown', function (e) {
  var b = e.target.closest('button[data-tab]');
  if (!b) return;
  var i = TABS.indexOf(b.dataset.tab), L = TABS.length;
  var n = e.key === 'ArrowRight' ? (i + 1) % L : e.key === 'ArrowLeft' ? (i + L - 1) % L : e.key === 'Home' ? 0 : e.key === 'End' ? L - 1 : -1;
  if (n < 0) return;
  e.preventDefault();
  showTab(TABS[n], true);
  $('tabbtn-' + TABS[n]).focus();
});
window.addEventListener('hashchange', function () { showTab(location.hash.slice(1)); });

/* ---------- 설정·초안 기억 (이 브라우저) ---------- */
function settings() {
  return { v: 2, tier: tier.value, pLangSel: P.langSel, pMode: P.mode, pStyle: P.style, pLevel: P.level, pTriple: P.triple, pvFix: P.vFix, pvText: P.vText,
    tSrc: $('t-src').value, tDst: $('t-dst').value, tStyle: T.style, tvText: T.vText };
}
function applySettings(d) {
  if (!d || typeof d !== 'object') return;
  function has(nav, v) { return !!v && !!$(nav).querySelector('button[data-v="' + v + '"]'); }
  function opt(sel, v) { return !!v && !!$(sel).querySelector('option[value="' + v + '"]'); }
  if (opt('tier', d.tier)) tier.value = d.tier;
  if (has('p-lang', d.pLangSel)) { P.langSel = d.pLangSel; pick($('p-lang'), P.langSel); }
  if (d.pMode === 'fix' || d.pMode === 'para') { P.mode = d.pMode; pick($('p-mode'), P.mode); }
  if (has('p-style', d.pStyle)) { P.style = d.pStyle; pick($('p-style'), P.style); }
  if (has('p-level', d.pLevel)) { P.level = d.pLevel; pick($('p-level'), P.level); }
  if (typeof d.pTriple === 'boolean') { P.triple = d.pTriple; $('p-triple').setAttribute('aria-pressed', P.triple ? 'true' : 'false'); }
  if (d.pvFix === 'clean' || d.pvFix === 'marks') P.vFix = d.pvFix;
  if (d.pvText === 'pair' || d.pvText === 'new') P.vText = d.pvText;
  if (d.tvText === 'pair' || d.tvText === 'new') T.vText = d.tvText;
  if (opt('t-src', d.tSrc)) $('t-src').value = d.tSrc;
  if (opt('t-dst', d.tDst)) $('t-dst').value = d.tDst;
  if (has('t-style', d.tStyle)) { T.style = d.tStyle; pick($('t-style'), T.style); }
}
function saveSettings() { LS('tp.set', JSON.stringify(settings())); }
function saveDrafts() {
  [['tp.p', P.in.value], ['tp.t', T.in.value], ['tp.around', $('p-around').value], ['tp.pnote', $('p-note').value], ['tp.tnote', $('t-note').value]].forEach(function (x) {
    if (x[1].length <= 200000) LS(x[0], x[1] || null);
  });
}
var saveDraftsLater = debounce(saveDrafts, 400);
function loadDrafts() {
  /* 플랫폼이 이미 되살린 값이 있으면 그것을 씀 */
  [['tp.p', P.in], ['tp.t', T.in], ['tp.around', $('p-around')], ['tp.pnote', $('p-note')], ['tp.tnote', $('t-note')]].forEach(function (x) {
    var v = LS(x[0]);
    if (v && !x[1].value) x[1].value = v;
  });
}

/* ---------- 교정·패러프레이즈 탭 ---------- */
sub($('p-lang'), function (v) { P.langSel = v; if (P.undo) { P.undo = false; setStatus(P, '', ''); } pCount(); saveSettings(); });
sub($('p-mode'), function (v) { P.mode = v; pUI(); saveSettings(); });
sub($('p-level'), function (v) { P.level = v; pUI(); saveSettings(); });
sub($('p-style'), function (v) { P.style = v; pUI(); saveSettings(); });
$('p-triple').onclick = function () { P.triple = !P.triple; this.setAttribute('aria-pressed', P.triple ? 'true' : 'false'); saveSettings(); };
P.in.addEventListener('input', function () { pCount(true); saveDraftsLater(); });
$('p-around').addEventListener('input', function () { pCount(); saveDraftsLater(); });
$('p-note').addEventListener('input', function () { chips(P); saveDraftsLater(); });
P.run.onclick = function () { if (P.job.busy) stopJob(P); else runPolish(false); };
$('p-again').onclick = function () { runPolish(true); };
$('p-copy-in').onclick = function () { copyText(P.in.value, this); };
$('p-copy-out').onclick = function () { copyText(curOut(P), this); };
$('p-clear').onclick = function () { clearInput(P); };
$('p-use').onclick = useAsInput;
$('p-send').onclick = toTranslate;
$('p-unwrap').onclick = function () { setIn(P.in, unwrap(P.in.value)); setStatus(P, 'PDF에서 붙여 넣은 줄바꿈을 문단으로 이었습니다. 하이픈으로 끊긴 낱말을 확인하세요.', ''); P.undo = true; };
sub($('p-vers'), function (v) {
  var r = P.res;
  if (!r || P.job.busy) { renderVers(P); return; }
  r.cur = +v; P.review = null; P.alt = null; P.sel = null;
  refresh(P); queueSave(P);
});
sub($('p-view'), function (v) {
  if (!P.res) return;
  if (P.res.kind === 'fix') P.vFix = v; else P.vText = v;
  paint(P); renderSide(P); saveSettings();
});
sub($('p-sidetab'), function (v) { setSide(P, v); if (v === 'review' && !P.review) runReview(P); });
P.out.addEventListener('click', function (e) { var sp = e.target.closest('.chg'); if (sp) toggleChange(P, +sp.dataset.i); });
P.out.addEventListener('keydown', function (e) {
  var sp = e.target.closest('.chg');
  if (sp && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleChange(P, +sp.dataset.i); }
});

/* ---------- 번역 탭 ---------- */
sub($('t-style'), function (v) { T.style = v; tUI(); saveSettings(); });
$('t-src').addEventListener('change', function () { tUI(); saveSettings(); });
$('t-dst').addEventListener('change', function () { tUI(); saveSettings(); });
T.in.addEventListener('input', function () { tCount(true); saveDraftsLater(); });
$('t-note').addEventListener('input', function () { chips(T); saveDraftsLater(); });
T.run.onclick = function () { if (T.job.busy) stopJob(T); else runTr(false); };
$('t-again').onclick = function () { runTr(true); };
$('t-copy-in').onclick = function () { copyText(T.in.value, this); };
$('t-copy-out').onclick = function () { copyText(curOut(T), this); };
$('t-clear').onclick = function () { clearInput(T); };
$('t-swap').onclick = swapLangs;
$('t-unwrap').onclick = function () { setIn(T.in, unwrap(T.in.value)); setStatus(T, 'PDF에서 붙여 넣은 줄바꿈을 문단으로 이었습니다. 하이픈으로 끊긴 낱말을 확인하세요.', ''); T.undo = true; };
$('t-fix').onclick = function () { var r = T.res; if (r && !r.part) toPolish(curOut(T), 'fix', r.dst, ''); };
$('t-para').onclick = function () { var r = T.res; if (r && !r.part) toPolish(curOut(T), 'para', r.dst, r.style); };
sub($('t-view'), function (v) { if (!T.res) return; T.vText = v; paint(T); renderSide(T); saveSettings(); });
sub($('t-sidetab'), function (v) {
  setSide(T, v);
  if (v === 'review' && !T.review) runReview(T);
  if (v === 'back' && !T.back) runBack();
});

/* 맥락·지시: 자주 쓰는 지시 고르면 입력 칸에 덧붙임 */
['p', 't'].forEach(function (k) {
  var sel = $(k + '-preset'), inp = $(k + '-note');
  PRESETS.forEach(function (p, i) { sel.appendChild(el('option', { value: String(i) }, p[0])); });
  sel.addEventListener('change', function () {
    if (sel.value === '') return;
    var t = PRESETS[+sel.value][1], cur = inp.value.trim();
    inp.value = (cur ? cur + ' · ' : '') + t;
    if (inp.value.length > 400) inp.value = inp.value.slice(0, 400);
    sel.value = '';
    chips(k === 'p' ? P : T); saveDraftsLater();
    inp.focus();
  });
  $(k + '-terms-chip').onclick = function () { showTab('terms', true); window.scrollTo(0, 0); $('pf-terms').focus(); };
});
document.addEventListener('selectionchange', captureSelection);

/* ---------- 용어·지침 탭 ---------- */
$('pf-terms').addEventListener('input', prefsEdited);
$('pf-rules').addEventListener('input', prefsEdited);
$('pf-terms').addEventListener('blur', prefsSave);
$('pf-rules').addEventListener('blur', prefsSave);
$('pf-terms-sample').onclick = function () {
  var ta = $('pf-terms');
  if (ta.value.indexOf('공진기 = cavity') >= 0) { $('pf-stat').textContent = '예시가 이미 들어 있습니다.'; return; }
  ta.value = (ta.value.replace(/\s+$/, '') + '\n' + GLOSS_SAMPLE).replace(/^\n/, '');
  prefsEdited(); ta.focus();
};
$('pf-rules-sample').onclick = function () {
  var ta = $('pf-rules');
  if (ta.value.indexOf('Use American spelling') >= 0) { $('pf-stat').textContent = '예시가 이미 들어 있습니다.'; return; }
  ta.value = (ta.value.replace(/\s+$/, '') + '\n' + RULES_SAMPLE).replace(/^\n/, '');
  prefsEdited(); ta.focus();
};

/* ---------- 기록 탭 ---------- */
sub($('h-filter'), function (v) { hFilter = v; histShown = 50; renderHist(); });
$('h-q').addEventListener('input', function () { histShown = 50; renderHist(); });
$('h-more').onclick = function () { histShown += 50; renderHist(); };
$('h-clear').onclick = function () { clearHist(this); };
$('h-md').onclick = function () { copyText(histMarkdown(), this); };
dlP.then(function (dl) {
  if (!dl || !dl.save) return;
  var b = $('h-file');
  b.hidden = false;
  b.onclick = async function () {
    if (!shownHist().length) { histNote('내보낼 기록이 없습니다.'); return; }
    try { await dl.save({ filename: 'writing-history-' + new Date().toISOString().slice(0, 10) + '.md', data: histMarkdown() }); histNote(''); }
    catch (e) {
      var c = e && e.code;
      if (c === 'declined') return;
      if (c === 'rate_limited') { histNote('저장 창이 이미 열려 있습니다.'); return; }
      b.hidden = true; histNote('이 화면에서는 파일로 저장할 수 없습니다. 「Markdown 복사」를 쓰세요.');
    }
  };
});

/* ---------- 단축키: Ctrl/⌘+Enter 실행, Esc 멈춤 ---------- */
function keyRun(node, tab) {
  node.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.repeat && !e.isComposing && (e.key === 'Enter' || e.code === 'NumpadEnter')) {
      e.preventDefault();
      if (!tab.job.busy && !tab.run.disabled) tab.run.click();
    }
  });
}
keyRun(P.in, P); keyRun($('p-note'), P); keyRun($('p-around'), P); keyRun(T.in, T); keyRun($('t-note'), T);
P.run.setAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter'); T.run.setAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  var t = currentTab(), tab = t === 'polish' ? P : t === 'translate' ? T : null;
  if (tab && tab.job.busy) { e.preventDefault(); stopJob(tab); }
});
tier.addEventListener('change', saveSettings);
window.addEventListener('pagehide', function () { saveDrafts(); saveSettings(); flushSave(P); flushSave(T); prefsSave(); });

/* ---------- 새 판이 게시될 때 화면 상태 넘겨주기 (뷰어가 지원할 때만) ---------- */
function hotState() {
  return { v: 2, set: settings(), tab: currentTab(), pIn: P.in.value, tIn: T.in.value, around: $('p-around').value, pnote: $('p-note').value, tnote: $('t-note').value,
    pRes: P.res, tRes: T.res, earlier: P.earlier };
}
function hotRestore(d) {
  if (!d || d.v !== 2) return;
  applySettings(d.set);
  [[P.in, d.pIn], [T.in, d.tIn], [$('p-around'), d.around], [$('p-note'), d.pnote], [$('t-note'), d.tnote]].forEach(function (x) { if (typeof x[1] === 'string' && x[1]) x[0].value = x[1]; });
  function okRes(r) { return r && Array.isArray(r.versions) && r.versions.length && r.versions[r.cur] && typeof r.versions[r.cur].out === 'string'; }
  if (okRes(d.pRes)) { P.res = d.pRes; if (d.earlier && Array.isArray(d.earlier.list)) P.earlier = d.earlier; }
  if (okRes(d.tRes)) T.res = d.tRes;
  pCount(); tCount(); refresh(P); refresh(T);
  if (d.tab) showTab(d.tab);
}

/* ---------- 처음 그리기 ---------- */
var oldTier = LS('tier');
if (oldTier === 'quick' || oldTier === 'deep') tier.value = oldTier;       /* 1.x 판의 설정 */
applySettings(LSjson('tp.set'));
loadDrafts();
var savedPrefs = LSjson('tp.prefs');
if (savedPrefs) prefs = { terms: typeof savedPrefs.terms === 'string' ? savedPrefs.terms : '', rules: typeof savedPrefs.rules === 'string' ? savedPrefs.rules : '' };
prefsShow();
localLoad(); renderHist();
refresh(P); refresh(T); setSide(P, 'notes'); setSide(T, 'notes');
pCount(); tCount();
showTab(location.hash.slice(1) || LS('tp.tab') || LS('tab') || 'polish');
openStore();
sampleP.then(function (s) {
  if (!s) { killSample('이 화면에서는 Claude를 부를 수 없습니다 (claude.ai에서 여세요).'); return; }
  if (s.limits) s.limits().then(function (l) { if (l && l.maxPromptBytes > 0) MAXB = l.maxPromptBytes; }, function () { /* 기본 한도를 씀 */ });
});
/* 플랫폼이 입력 칸 값을 나중에 되살리는 경우에 대비해 한 번 더 셈 */
['pageshow', 'focus'].forEach(function (ev) { window.addEventListener(ev, function () { if (!P.job.busy) pCount(); if (!T.job.busy) tCount(); }); });
try {
  var hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') hot.snapshot(hotState);
  if (hot && typeof hot.ready === 'function') hot.ready(hotRestore);
  else if (hot && hot.data) hotRestore(hot.data);
} catch (e) { console.warn('hot', e); }
