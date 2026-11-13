/* ===== 교정·패러프레이즈 실행, 번역 실행, 탭 사이 보내기 ===== */

var PRESETS = [
  ['초록', '초록 형식: 한 문단, 원문에 있는 내용만으로 문제 → 한 일 → 핵심 수치 결과 → 의의 순서(원문에 없는 부분은 지어내지 말고 건너뜀), 인용·그림 언급·정의 안 된 약어 없이, 150단어 이내'],
  ['그림 캡션', '그림 캡션 형식: 명사구 제목으로 시작, 패널은 (a), (b)로, 그림에 나온 기호와 약어를 모두 정의, 현재 시제'],
  ['심사 답변', '심사위원 답변 어조: 정중하고 직접적으로, 지적을 한 구절로 인정한 뒤 무엇을 어디서 고쳤는지(또는 동의하지 않는 기술적 이유를) 밝힘, 방어적이지 않게'],
  ['이메일', '업무 이메일: 첫 문장에 용건, 간결하고 정중하게, 요청 사항과 날짜를 분명히'],
  ['커버레터', '편집자에게 보내는 커버레터: 투고 사실, 핵심 결과와 독자층에 맞는 이유, 과장 없이'],
  ['방법·결과', '방법·결과 절: 한 일과 측정은 과거 시제, 그림이 보여 주는 것은 현재 시제, 평가하는 형용사 없이'],
  ['첫 문장은 그대로', '첫 문장은 그대로'],
  ['문장 수 유지', '문장 수 유지']
];

function noteVal(k) { return $(k + '-note').value.trim().slice(0, 400); }
function failText(res) {
  if (!res.ok) return res.msg || ERR.upstream_error;
  if (res.truncated) return '답이 길이 제한에서 잘렸습니다. 글을 나눠서 다시 해 보세요.';
  return '답 형식이 어긋났습니다. 다시 눌러 주세요.';
}
/* 실행이 끝까지 못 갔을 때: 앞 조각까지 된 글이나 반쯤 온 글이 있으면 '미완성'으로 보여 주고(기록에 넣지 않음),
   아무것도 없으면 이전 결과를 그대로 둠 */
function failRun(tab, prev, res, partialText, base, tail) {
  var msg = failText(res), stopped = !res.ok && res.code === 'cancelled';
  tab.noCache = !!res.ok;                     /* 받은 답이 잘렸거나 형식이 어긋남: 같은 답이 5분간 캐시에서 다시 나오므로 다음 실행은 새로 받음 */
  if (partialText && (!prev || base.keepPartial)) {
    tab.res = Object.assign({}, base, { versions: [{ label: '미완성', out: partialText, notes: '' }], cur: 0, ops: null, part: true, histId: null });
    delete tab.res.keepPartial;
    tab.review = null; tab.alt = null; tab.back = null; tab.sel = null;
    refresh(tab); setSide(tab, 'notes');
    setStatus(tab, msg + (tail || '') + ' 여기까지 받은 부분만 보여 줍니다 (기록에 넣지 않음).', stopped ? '' : 'err');
    return;
  }
  tab.res = prev;
  refresh(tab);
  setStatus(tab, msg + (prev ? ' 이전 결과를 그대로 둡니다.' : ''), stopped ? '' : 'err');
}
function doneRun(tab, msg) {
  tab.review = null; tab.alt = null; tab.back = null; tab.sel = null; tab.undo = false;
  refresh(tab); setSide(tab, 'notes');
  setStatus(tab, msg, '');
  if (window.matchMedia && window.matchMedia('(max-width:760px)').matches && tab.out.scrollIntoView) tab.out.parentElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* ---------- 교정·패러프레이즈 ---------- */
function pGuess() {
  var t = P.in.value.trim();
  return t.length >= 8 ? guessLang(t) : '';
}
function pEffLang() {
  if (P.langSel !== 'auto') return P.langSel;
  var g = pGuess();
  return g === 'ko' || g === 'en' ? g : (g ? '' : P.lang);
}
function pUI() {
  var fix = P.mode === 'fix', g = pGuess(), eff = pEffLang() || 'en', ko = eff === 'ko';
  P.lang = eff;
  $('p-level').hidden = !fix; $('p-style').hidden = fix; $('p-triple').hidden = fix;
  $('p-style').querySelectorAll('button[data-ko]').forEach(function (b) { b.hidden = !ko; });
  if (!ko && ['cover', 'report', 'article'].indexOf(P.style) >= 0) { P.style = 'standard'; pick($('p-style'), 'standard'); }
  $('p-lang').querySelector('[data-v="auto"]').textContent = P.langSel === 'auto' && (g === 'ko' || g === 'en') ? '자동 · ' + LANGKO[g] : '자동';
  P.in.placeholder = (fix ? '교정할' : '패러프레이즈할') + ' 영어·한국어 글을 붙여 넣으세요 — ' +
    (fix ? '문법·철자·어색한 표현을 고칩니다' : '뜻은 그대로 두고 표현을 바꿉니다') + ' · Ctrl+Enter 로 실행';
  P.in.lang = ko ? 'ko' : 'en';
  $('p-again').textContent = fix ? '다시 교정' : '다른 안 더';
  $('p-again').title = fix ? '같은 글을 새로 교정합니다' : '같은 글로 앞선 안들과 다른 안을 더 받습니다';
  if (!P.res && !P.job.busy) paint(P);
  chips(P); sync(P);
}
function pCount(typed) {
  var t = P.in.value;
  $('p-w').textContent = fmt(wc(t)); $('p-c').textContent = fmt(cc(t));
  $('p-unwrap').hidden = !looksWrapped(t);
  $('p-around-sum').textContent = $('p-around').value.trim() ? '앞뒤 문맥 있음 (참고만 하고 바꾸지 않음)' : '앞뒤 문맥 넣기 (참고만 하고 바꾸지 않음)';
  if (typed && P.undo) { P.undo = false; setStatus(P, '', ''); }
  pUI();
  var g = pGuess();
  if (P.langSel !== 'auto' && (g === 'ko' || g === 'en') && g !== P.langSel && !P.job.busy && !$('p-status').textContent) {
    setStatus(P, LANGKO[g] + ' 글로 보입니다. 지금은 ' + LANGKO[P.langSel] + '로 고정되어 있습니다.', '', [{ label: '자동으로 바꾸기', fn: function () { P.langSel = 'auto'; pick($('p-lang'), 'auto'); setStatus(P, '', ''); pUI(); saveSettings(); } }]);
    P.undo = true;
  }
}
function pKey(lang, style, note, around, text) { return [lang, style, note, around, text].join('\u0001'); }

async function runPolish(fresh) {
  var text = P.in.value.trim();
  if (!text || P.job.busy) return;
  var g = guessLang(text), lang = P.langSel === 'auto' ? g : P.langSel;
  if (lang !== 'ko' && lang !== 'en') { setStatus(P, '교정·패러프레이즈는 영어와 한국어만 됩니다 (' + (LANGKO[g] || g) + ' 글로 보입니다). 번역 탭을 쓰세요.', 'err'); return; }
  var mode = P.mode, isFix = mode === 'fix', style = P.style, level = P.level;
  var note = noteVal('p'), around = $('p-around').value.trim().slice(0, 4000);
  if (!isFix && cc(text) > 8000) { setStatus(P, '패러프레이즈는 한 번에 8,000자까지 됩니다. 문단 단위로 나눠 넣으세요.', 'err'); return; }
  var my = begin(P, 'run');
  if (!my) return;
  var noCache = fresh ? true : (P.noCache ? 'refresh' : false); P.noCache = false;
  flushSave(P);
  var mo = modelOpts(), tierKey = tier.value, prev = P.res;
  startBusy(P);
  var base = { kind: mode, text: text, lang: lang, style: isFix ? '' : style, level: isFix ? level : '', note: note, tier: tierKey, at: new Date().toISOString() };
  var x = { note: note, around: around, gloss: glossFor(glossItems, text + '\n' + around), prefs: rulesFor(prefs.rules, lang) };

  if (isFix) {
    var ex = extras('fix', x), rules = withExtras(fixRules(lang, level), ex);
    var parts = cc(text) > CHUNK * 1.2 ? chunkText(text, CHUNK) : [{ text: text, sep: '' }], N = parts.length;
    var out = '', notes = [], model = null, ops = [];
    for (var i = 0; i < N; i++) {
      if (N > 1) setStatus(P, (i + 1) + ' / ' + N + ' 조각 교정 중', '');
      var done = i ? out + parts[i - 1].sep : '';
      var res = await ask(P, build(rules, ex.blocks.concat([block('text', parts[i].text)]), FORMAT_RN),
        { gen: my, mo: mo, fresh: noCache, onText: (function (d) { return function (raw) { live(P, d + liveText(raw)); }; })(done) });
      if (my !== P.job.gen) return;
      var a = res.text ? readAnswer(res.text) : null;
      if (!(res.ok && !res.truncated && a && a.text && (a.complete || !a.tagged))) {
        end(P);
        base.keepPartial = i > 0;
        failRun(P, prev, res, (done + (a ? a.text : '')).trim(), base, N > 1 ? ' ' + N + ' 조각 중 ' + (i + 1) + '번째에서 멈췄습니다.' : '');
        return;
      }
      out = done + a.text; if (a.notes) notes.push(a.notes); model = res.model;
      var part = ops && diffChanges(parts[i].text, a.text);          /* 조각마다 비교: 글이 길어도 바뀐 곳 표시를 잃지 않음 */
      ops = part ? ops.concat(i ? [{ s: parts[i - 1].sep }] : [], part) : null;
    }
    end(P);
    P.res = Object.assign(base, { versions: [{ label: '교정', out: out, notes: mergeNotes(notes) }], cur: 0, ops: ops, part: false, histId: null, model: model });
    var nchg = P.res.ops ? P.res.ops.filter(realChange).length : -1;
    doneRun(P, (out === text ? '고칠 곳을 찾지 못했습니다' : '교정 완료' + (nchg >= 0 ? ' · 수정 ' + nchg + '곳' : '')) + (N > 1 ? ' · ' + N + ' 조각' : '') +
      (P.res.ops ? '' : ' · 글이 길어 바뀐 곳 색 표시는 생략했습니다'));
    saveRes(P);
    return;
  }

  /* 패러프레이즈: 1,500자 이하이고 '세 가지 안'이 켜져 있으면 정도가 다른 세 안을 한 번에 */
  var n = P.triple && cc(text) <= 1500 ? 3 : 1;
  var key = pKey(lang, style, note, around, text);
  if (P.earlier.key !== key) P.earlier = { key: key, list: [] };
  var same = !!prev && prev.kind === 'para' && prev.key === key && !prev.part;
  var earlier = [], room = 12000;
  (same ? prev.versions : []).slice().reverse().forEach(function (v) { if (room >= cc(v.out)) { room -= cc(v.out); earlier.unshift(v.out); } else room = -1; });
  var exP = extras('para', x);
  var blocks = exP.blocks.concat([
    earlier.length ? block('earlier_versions', earlier.map(function (v) { return '<earlier>\n' + v + '\n</earlier>'; }).join('\n')) : '',
    block('text', text)]);
  var resP = await ask(P, build(withExtras(paraRules(lang, style, n, earlier.length > 0), exP), blocks, formatV(n)), {
    gen: my, mo: mo, fresh: true,
    onText: function (raw) {
      var vs = readVersions(raw);
      if (!vs.length) { live(P, (raw || '').length < 300 ? '' : raw); return; }
      live(P, vs[0].text);
      if (n > 1) setStatus(P, VERLABEL[vs.length - 1] + ' 안 쓰는 중 (' + vs.length + ' / ' + n + ')', '');
    }
  });
  if (my !== P.job.gen) return;
  end(P);
  var raw = resP.text || '', vs = readVersions(raw).filter(function (v) { return v.complete && v.text.trim(); });
  if (!vs.length && resP.ok && !resP.truncated && raw.trim() && !/<v[1-3]>/i.test(raw) && !/더 없습니다/.test(raw)) vs = [{ n: 1, text: readAnswer(raw).text, why: '' }];
  if (!vs.length) {
    if (resP.ok && /더 없습니다/.test(raw)) { P.res = prev; refresh(P); setStatus(P, '자연스러운 다른 표현이 더 없다는 답이 왔습니다. 문체를 바꾸거나 글을 조금 고쳐 다시 해 보세요.', ''); return; }
    var half = readVersions(raw)[0];
    base.key = key;
    failRun(P, prev, resP, half ? half.text.trim() : '', base, '');
    return;
  }
  var round = same ? prev.versions.reduce(function (m, v) { return Math.max(m, +(/ (\d+)$/.exec(v.label) || [0, 1])[1]); }, prev.round || 1) + 1 : 1;
  var newVs = vs.map(function (v) { return { label: VERLABEL[v.n - 1] + (round > 1 ? ' ' + round : ''), out: v.text.trim(), notes: v.why }; });
  if (same) {
    P.res = prev;
    prev.versions = prev.versions.concat(newVs).slice(-9);
    prev.cur = prev.versions.length - newVs.length; prev.round = round; prev.model = resP.model; prev.tier = tierKey;
  } else {
    P.res = Object.assign(base, { key: key, versions: newVs, cur: 0, ops: null, part: false, histId: null, model: resP.model, round: 1 });
  }
  P.earlier.list = P.earlier.list.concat(newVs.map(function (v) { return v.out; }));
  var short = vs.length < n;
  doneRun(P, (!resP.ok ? failText(resP) + ' ' : '') + '패러프레이즈 완료 · 안 ' + newVs.length + '개' + (same ? ' 추가' : '') +
    (short ? ' (' + n + '가지 중 끝까지 온 것만)' : '') + (P.triple && n === 1 ? ' · 1,500자가 넘어 한 가지 안만 만들었습니다' : ''));
  saveRes(P);
}

/* ---------- 번역 ---------- */
function tUI() {
  var t = T.in.value, src = $('t-src').value, det = $('t-det');
  if (src === 'auto' && t.trim().length >= 8) { var g = guessLang(t), dt = '감지: ' + LANGKO[g]; if (det.textContent !== dt) det.textContent = dt; det.dataset.l = g; }
  else { if (det.textContent) det.textContent = ''; det.dataset.l = ''; }
  T.in.lang = LG[src === 'auto' ? (det.dataset.l || 'en') : src] || 'en';
  chips(T); sync(T);
}
function tCount(typed) {
  var t = T.in.value;
  $('t-w').textContent = fmt(wc(t)); $('t-c').textContent = fmt(cc(t));
  $('t-unwrap').hidden = !looksWrapped(t);
  if (typed && T.undo) { T.undo = false; setStatus(T, '', ''); }
  tUI();
}
function joinOuts(outs, parts, dst) {
  var s = '';
  outs.forEach(function (o, i) { s += (i ? joinSep(parts[i - 1].sep, dst) : '') + o; });
  return s;
}
async function runTr(fresh) {
  var text = T.in.value.trim();
  if (!text || T.job.busy) return;
  var srcSel = $('t-src').value, dst = $('t-dst').value, style = T.style, pre = '';
  var src = srcSel === 'auto' ? guessLang(text) : srcSel;
  if (src === dst) {
    if (srcSel !== 'auto') { setStatus(T, '원문 언어와 번역 언어가 같습니다. 번역 언어를 바꿔 주세요.', 'err'); return; }
    dst = src === 'ko' ? 'en' : 'ko'; $('t-dst').value = dst;
    pre = '원문이 ' + LANGKO[src] + '라서 ' + LANGKO[dst] + '로 옮깁니다. ';
    saveSettings();
  }
  var note = noteVal('t');
  var my = begin(T, 'run');
  if (!my) return;
  var noCache = fresh ? true : (T.noCache ? 'refresh' : false); T.noCache = false;
  flushSave(T);
  var mo = modelOpts(), tierKey = tier.value, prev = T.res;
  var parts = cc(text) > CHUNK * 1.2 ? chunkText(text, CHUNK) : [{ text: text, sep: '' }], N = parts.length;
  var gl = glossFor(glossItems, text), pf = rulesFor(prefs.rules, dst);
  var key = [src, dst, style, tierKey, note, text, JSON.stringify(gl), pf.join('\n')].join('\u0001');
  if (fresh || T.keep.key !== key || T.keep.outs.length >= N) T.keep = { key: key, outs: [], notes: [] };   /* 멈춘 조각부터 이어서 할 수 있게 끝난 조각을 기억 */
  startBusy(T);
  var base = { kind: 'tr', text: text, lang: dst, src: src, dst: dst, style: style, level: '', note: note, tier: tierKey, at: new Date().toISOString() };
  var ex = extras('tr', { note: note, gloss: glossFor(glossItems, text), prefs: rulesFor(prefs.rules, dst) });
  var out = joinOuts(T.keep.outs, parts, dst), model = null, resumed = T.keep.outs.length;
  if (out) live(T, out);
  for (var i = T.keep.outs.length; i < N; i++) {
    if (N > 1) setStatus(T, pre + (i + 1) + ' / ' + N + ' 조각 옮기는 중', '');
    var done = i ? out + joinSep(parts[i - 1].sep, dst) : '';
    var prevBlock = i ? block('previous', 'Source just before this passage:\n' + parts[i - 1].text.slice(-400) + '\n\nIts translation, already delivered:\n' + T.keep.outs[i - 1].slice(-600)) : '';
    var res = await ask(T, build(withExtras(trRules(src, dst, style, i > 0), ex), ex.blocks.concat([prevBlock, block('text', parts[i].text)]), FORMAT_RN),
      { gen: my, mo: mo, fresh: noCache, onText: (function (d) { return function (raw) { live(T, d + liveText(raw)); }; })(done) });
    if (my !== T.job.gen) return;
    var a = res.text ? readAnswer(res.text) : null;
    if (!(res.ok && !res.truncated && a && a.text && (a.complete || !a.tagged))) {
      end(T);
      var k = T.keep.outs.length;
      base.keepPartial = k > 0;
      failRun(T, prev, res, (done + (a ? a.text : '')).trim(), base,
        N > 1 ? ' ' + N + ' 조각 중 ' + (i + 1) + '번째에서 멈췄습니다.' + (k ? ' 「번역하기」를 다시 누르면 ' + (k + 1) + '번째 조각부터 이어서 합니다.' : '') : '');
      return;
    }
    T.keep.outs.push(a.text); T.keep.notes.push(a.notes || '');
    out = done + a.text; model = res.model;
  }
  end(T);
  T.res = Object.assign(base, { versions: [{ label: '번역', out: out, notes: mergeNotes(T.keep.notes) }], cur: 0, ops: null, part: false, histId: null, model: model });
  T.keep = { key: '', outs: [], notes: [] };
  doneRun(T, pre + '번역 완료' + (N > 1 ? ' · ' + N + ' 조각' + (resumed ? ' (' + (resumed + 1) + '번째부터 이어서)' : '') : ''));
  saveRes(T);
}

/* ---------- 탭 사이로 글 보내기 ---------- */
function clearTab(tab) {
  cancel(tab); flushSave(tab);
  tab.res = null; tab.review = null; tab.alt = null; tab.back = null; tab.sel = null; tab.undo = false;
  if (tab.k === 't') T.keep = { key: '', outs: [], notes: [] };
}
function arrive(tab, name, msg, old) {
  refresh(tab); setSide(tab, 'notes');
  var lost = old && old.trim() && old !== tab.in.value;
  setStatus(tab, msg, '', lost ? [{ label: '되돌리기', fn: function () { setIn(tab.in, old); setStatus(tab, '', ''); } }] : []);
  tab.undo = !!lost;
  showTab(name, true);
  window.scrollTo(0, 0);
  try { tab.in.focus({ preventScroll: true }); } catch (e) { tab.in.focus(); }
  flash(tab.in);
}
function toPolish(text, mode, lang, style) {
  var old = P.in.value;
  clearTab(P);
  showTab('polish', true);                   /* 칸이 보여야 execCommand 가 먹어 Ctrl+Z 로도 되돌릴 수 있음 */
  if (P.langSel !== 'auto' && P.langSel !== lang) { P.langSel = 'auto'; pick($('p-lang'), 'auto'); }
  P.mode = mode; pick($('p-mode'), mode);
  if (mode === 'para' && style && $('p-style').querySelector('button[data-v="' + style + '"]:not([data-ko])')) { P.style = style; pick($('p-style'), style); }
  setIn(P.in, text);
  arrive(P, 'polish', '번역 결과를 가져왔습니다. 「' + (mode === 'fix' ? '교정하기' : '패러프레이즈하기') + '」를 누르세요.', old);
  saveSettings();
}
function toTranslate() {
  var r = P.res;
  if (!r || r.part || P.job.busy) return;
  var out = curOut(P), l = r.lang, old = T.in.value;
  clearTab(T);
  showTab('translate', true);
  $('t-src').value = l;
  if ($('t-dst').value === l) $('t-dst').value = l === 'en' ? 'ko' : 'en';
  setIn(T.in, out);
  arrive(T, 'translate', '교정·패러프레이즈 결과를 가져왔습니다. 「번역하기」를 누르세요.', old);
  saveSettings();
}
/* 결과를 입력 칸으로 (이어서 다듬기). 되돌리기 가능 */
function useAsInput() {
  var r = P.res;
  if (!r || r.part || P.job.busy) return;
  flushSave(P);
  var snap = { v: P.in.value, res: P.res, review: P.review, alt: P.alt, side: P.side, earlier: P.earlier };
  var out = curOut(P);
  P.res = null; P.review = null; P.alt = null; P.sel = null;
  setIn(P.in, out);
  refresh(P); setSide(P, 'notes');
  setStatus(P, '결과를 입력 칸에 넣었습니다. 이어서 교정하거나 패러프레이즈할 수 있습니다.', 'good', [{ label: '되돌리기', fn: function () {
    setIn(P.in, snap.v);
    P.res = snap.res; P.review = snap.review; P.alt = snap.alt; P.earlier = snap.earlier;
    refresh(P); setSide(P, snap.side); setStatus(P, '되돌렸습니다.', '');
  } }]);
  P.undo = true;
  flash(P.in);
}
function clearInput(tab) {
  var old = tab.in.value;
  if (!old) return;
  setIn(tab.in, '');
  setStatus(tab, '입력을 지웠습니다.', '', [{ label: '되돌리기', fn: function () { setIn(tab.in, old); setStatus(tab, '', ''); } }]);
  tab.undo = true;
  tab.in.focus();
}
function swapLangs() {
  if (T.job.busy) return;
  var sl = $('t-src'), d = $('t-dst'), cur = T.in.value.trim(), r = T.res;
  var same = !!r && !r.part && cur === r.text;
  var sv = sl.value !== 'auto' ? sl.value : (same ? r.src : guessLang(cur));
  var dv = same ? r.dst : d.value;
  if (!LG[sv]) sv = guessLang(cur);
  if (sv === dv) sv = dv === 'ko' ? 'en' : 'ko';
  var moved = same ? curOut(T) : null;
  clearTab(T);
  sl.value = dv; d.value = sv;
  if (moved != null) setIn(T.in, moved);
  refresh(T); setSide(T, 'notes'); tCount();
  setStatus(T, moved != null ? '번역 결과를 입력 칸으로 옮기고 방향을 바꿨습니다.' : '번역 방향을 바꿨습니다.', '');
  saveSettings();
}
