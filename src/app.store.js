/* ===== 저장: 기록(계정별 비공개 + 이 브라우저 대체), 용어·지침, 내보내기 ===== */

var store = { db: null, uid: null, hpath: '', ppath: '', live: false };
var hist = [], localOnly = [], clearing = false, histShown = 50, hFilter = '', openIds = {}, writeQ = {};
var prefs = { terms: '', rules: '' }, glossItems = [], prefsDirty = false;
var dbstat = $('dbstat');
function dbChip(text, cls, title) { dbstat.textContent = text; dbstat.className = 'chip ' + cls; dbstat.title = title || ''; }
function histNote(t) { var n = $('h-note'); n.textContent = t || ''; n.hidden = !t; }
function dbErr(e) {
  var c = e && e.code;
  if (c === 'quota_exceeded') return '저장소가 가득 찼습니다. 기록 탭에서 오래된 기록을 지워 주세요.';
  if (c === 'invalid_argument' || c === 'transform_error') return '이 계정으로는 저장소에 쓸 수 없습니다.';
  if (c === 'resource_exhausted') return '저장 요청이 너무 잦습니다. 잠시 뒤 다시 해 주세요.';
  return '저장소에 닿지 못했습니다.';
}
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function localLoad() {
  localOnly = LSjson('hist');
  if (!Array.isArray(localOnly)) localOnly = [];
  localOnly = localOnly.filter(function (h) { return h && h.id; });
  localOnly.forEach(function (h) { h.local = 1; });
}
function localSave() { LS('hist', JSON.stringify(localOnly.slice(0, 200))); }
function localUpsert(rec) {
  rec.local = 1;
  localOnly = localOnly.filter(function (h) { return h.id !== rec.id; });
  localOnly.unshift(rec);
  localSave(); renderHist();
}

/* 예전 판 기록(tool·mode 로 적던 것)도 읽을 수 있게 맞춤 */
function normRec(h) {
  var o = Object.assign({}, h);
  if (!o.kind) {
    var tool = o.tool || '';
    if (/^(번역|옮기기)/.test(tool)) {
      var lp = (o.lang || '').split('→');
      o.kind = 'tr'; o.src = o.src || lp[0] || 'auto'; o.dst = o.dst || lp[1] || 'en'; o.style = o.style || o.mode || 'standard'; o.lang = o.dst;
    } else if (o.mode === 'fix' || /^교정/.test(tool) || !o.mode) { o.kind = 'fix'; o.level = 'standard'; o.lang = o.lang === 'ko' ? 'ko' : 'en'; }
    else { o.kind = 'para'; o.style = o.mode; o.lang = o.lang === 'ko' ? 'ko' : 'en'; }
  }
  if (!REG[o.style]) o.style = 'standard';
  return o;
}
function recLabel(h) {
  var name = h.kind === 'tr' ? '번역' : h.kind === 'fix' ? '교정' : '패러프레이즈';
  var detail = h.kind === 'tr' ? (LANGKO[h.src] || h.src) + ' → ' + (LANGKO[h.dst] || h.dst) + ' · ' + (STYLEKO[h.style] || h.style)
    : (LANGKO[h.lang] || h.lang) + ' · ' + (h.kind === 'fix' ? (LEVELKO[h.level] || '표준') : (STYLEKO[h.style] || h.style));
  return { name: name, detail: detail };
}
function whenShort(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return '';
  var now = new Date(), full = when(iso);
  return d.toDateString() === now.toDateString() ? '오늘 ' + full.slice(11) : full;
}

/* 결과 한 건을 기록으로: 처음 저장하면 id 가 생기고, 그 뒤 고친 것(수정 되돌리기, 점검 반영 …)은 같은 기록에 덮어씀 */
function resToRec(tab) {
  var r = tab.res, v = r.versions[r.cur];
  var rec = { id: r.histId, at: r.at, kind: r.kind, lang: r.lang, style: r.style || '', level: r.level || '', note: r.note || '',
    input: r.text, output: v.out, notes: v.notes || '', tier: r.tier || '', sel: r.cur };
  if (r.kind === 'tr') { rec.src = r.src; rec.dst = r.dst; }
  if (r.kind === 'para') rec.versions = r.versions.map(function (x) { return { label: x.label, text: x.out, why: x.notes || '' }; });
  if (r.edited) rec.edited = true;
  return rec;
}
function saveRes(tab) {
  var r = tab.res;
  clearTimeout(tab.saveT); tab.saveT = 0;
  if (!r || r.part) return;
  if (!r.histId) r.histId = newId();
  saveRec(clipRecord(resToRec(tab)));
}
function queueSave(tab) {
  clearTimeout(tab.saveT);
  tab.saveT = setTimeout(function () { tab.saveT = 0; saveRes(tab); }, 1200);
}
function flushSave(tab) { if (tab.saveT) saveRes(tab); }
function saveRec(rec) {
  if (!store.db) { localUpsert(rec); return; }
  var ref = store.db.doc(store.hpath + '/' + rec.id);
  /* 한 문서에는 한 번에 한 쓰기만: 같은 기록의 쓰기는 줄을 세움 */
  writeQ[rec.id] = (writeQ[rec.id] || Promise.resolve()).then(function () { return ref.set(rec); }).catch(async function (e) {
    if (e && e.code === 'unavailable') {
      try { await new Promise(function (r) { setTimeout(r, 400 + Math.random() * 800); }); await ref.set(rec); return; } catch (e2) { e = e2; }
    }
    console.warn('db', e);
    histNote(dbErr(e) + ' 방금 결과는 이 브라우저에만 보관했습니다.');
    dbChip('기록: 저장 실패 · 이 브라우저에 보관', 'mid', dbErr(e));
    if (e && ['revoked', 'not_granted', 'capability_disabled', 'capability_removed'].indexOf(e.code) >= 0) store.db = null;
    localUpsert(rec);
  });
}
async function delRec(h) {
  if (h.local || !store.db) { localOnly = localOnly.filter(function (x) { return x.id !== h.id; }); localSave(); renderHist(); return; }
  try { await store.db.doc(store.hpath + '/' + h.id).delete(); histNote(''); }
  catch (e) { console.warn('db', e); histNote('삭제하지 못했습니다. ' + dbErr(e)); }
}

/* ---------- 기록 목록 ---------- */
function allHist() {
  return localOnly.concat(hist).map(normRec).sort(function (a, b) { return (a.at || '') < (b.at || '') ? 1 : -1; });
}
function shownHist() {
  var q = ($('h-q').value || '').toLowerCase();
  return allHist().filter(function (h) {
    if (hFilter && h.kind !== hFilter) return false;
    return !q || ((h.input || '') + ' ' + (h.output || '') + ' ' + (h.notes || '') + ' ' + (h.note || '')).toLowerCase().indexOf(q) >= 0;
  });
}
function renderHist() {
  if (clearing) return;
  var box = $('h-list'), all = allHist(), list = shownHist();
  $('histn').textContent = hist.length >= 300 ? (localOnly.length + 300) + '+' : all.length;
  box.textContent = '';
  $('h-more').hidden = list.length <= histShown;
  $('h-md').disabled = !list.length; $('h-file').disabled = !list.length; $('h-clear').disabled = !all.length;
  if (!list.length) {
    box.appendChild(el('div', { class: 'msg' }, all.length ? '맞는 기록이 없습니다.' : '아직 기록이 없습니다. 교정·패러프레이즈·번역을 실행하면 여기에 쌓입니다.'));
    return;
  }
  list.slice(0, histShown).forEach(function (h) {
    var d = el('div', { class: 'hist' + (openIds[h.id] ? ' open' : '') }), hd = el('div', { class: 'h' }), lb = recLabel(h);
    hd.appendChild(chipEl(lb.name, 'ac')); hd.appendChild(chipEl(lb.detail, 'mute'));
    if (h.local) hd.appendChild(chipEl('이 브라우저에만', 'mid'));
    if (h.clipped) hd.appendChild(chipEl('일부만 저장', 'mid', '글이 길어 앞부분만 기록에 남았습니다.'));
    if (h.edited) hd.appendChild(chipEl('손봄', 'mute', '실행한 뒤에 수정을 되돌리거나 점검·다른 표현으로 고친 결과입니다.'));
    hd.appendChild(el('span', { class: 'meta' }, whenShort(h.at)));
    hd.appendChild(el('span', { class: 'sp' }));
    var b2 = btnEl('복사', 'sm', function () { copyText(h.output || '', b2); }, '결과를 복사합니다');
    var b3 = btnEl('다시 열기', 'sm', function () { reopen(h); }, '이 입력·결과·설정을 그 탭에 다시 펼칩니다');
    var b4 = btnEl('삭제', 'sm', function () {
      if (b4.dataset.c) { delRec(h); $('h-q').focus(); return; }
      b4.dataset.c = '1'; b4.textContent = '정말 삭제?'; say('한 번 더 누르면 삭제합니다');
      setTimeout(function () { b4.dataset.c = ''; b4.textContent = '삭제'; }, 6000);
    });
    [b2, b3, b4].forEach(function (b) { hd.appendChild(b); });
    d.appendChild(hd);
    var body = el('div', { class: 'body', role: 'button', tabindex: '0', 'aria-expanded': openIds[h.id] ? 'true' : 'false', title: '눌러서 펼치기·접기' });
    body.appendChild(el('div', { class: 'q' }, openIds[h.id] ? (h.input || '') : (h.input || '').slice(0, 300)));
    body.appendChild(el('div', { class: 'a' }, openIds[h.id] ? (h.output || '') : (h.output || '').slice(0, 600)));
    if (h.notes) body.appendChild(el('div', { class: 'n' }, h.notes));
    function toggle() { if (openIds[h.id]) delete openIds[h.id]; else openIds[h.id] = 1; renderHist(); }
    body.addEventListener('click', function () { if (!String(window.getSelection ? window.getSelection() : '')) toggle(); });
    body.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    d.appendChild(body);
    box.appendChild(d);
  });
}
/* 기록을 그 탭에 다시 펼침 */
function reopen(h) {
  h = normRec(h);
  var tab = h.kind === 'tr' ? T : P;
  clearTab(tab);
  var vers = h.kind === 'para' && Array.isArray(h.versions) && h.versions.length
    ? h.versions.map(function (v) { return { label: v.label || '기본', out: v.text || '', notes: v.why || '' }; })
    : [{ label: h.kind === 'tr' ? '번역' : h.kind === 'fix' ? '교정' : '기본', out: h.output || '', notes: h.notes || '' }];
  var cur = Math.min(Math.max(0, h.sel || 0), vers.length - 1);
  var res = { kind: h.kind, text: h.input || '', lang: h.lang, style: h.kind === 'fix' ? '' : h.style, level: h.kind === 'fix' ? (LEVEL[h.level] ? h.level : 'standard') : '', note: h.note || '',
    versions: vers, cur: cur, ops: null, part: false, histId: h.id, at: h.at, tier: h.tier || '', edited: !!h.edited, round: 1 };
  if (h.kind === 'tr') {
    res.src = h.src; res.dst = h.dst;
    $('t-src').value = $('t-src').querySelector('option[value="' + h.src + '"]') ? h.src : 'auto';
    if ($('t-dst').querySelector('option[value="' + h.dst + '"]')) $('t-dst').value = h.dst;
    T.style = $('t-style').querySelector('button[data-v="' + h.style + '"]') ? h.style : 'standard';
    res.style = T.style; pick($('t-style'), T.style);
    $('t-note').value = h.note || '';
    T.in.value = res.text;
  } else {
    P.mode = h.kind; pick($('p-mode'), h.kind);
    if (P.langSel !== 'auto' && P.langSel !== h.lang) { P.langSel = 'auto'; pick($('p-lang'), 'auto'); }
    if (h.kind === 'para') {
      if ($('p-style').querySelector('button[data-v="' + h.style + '"]')) { P.style = h.style; pick($('p-style'), h.style); }
      res.key = pKey(h.lang, P.style, res.note, $('p-around').value.trim().slice(0, 4000), res.text);
      P.earlier = { key: res.key, list: vers.map(function (v) { return v.out; }) };
    } else {
      P.level = res.level; pick($('p-level'), P.level);
      res.ops = diffChanges(res.text, vers[0].out);
    }
    $('p-note').value = h.note || '';
    P.in.value = res.text;
  }
  tab.res = res;
  if (tab.k === 'p') pCount(); else tCount();
  refresh(tab); setSide(tab, 'notes');
  setStatus(tab, '기록에서 다시 열었습니다.' + (h.clipped ? ' 기록에는 앞부분만 저장되어 있습니다.' : ''), '');
  showTab(h.kind === 'tr' ? 'translate' : 'polish', true);
  window.scrollTo(0, 0);
  try { tab.run.focus({ preventScroll: true }); } catch (e) { tab.run.focus(); }
  saveSettings();
}
async function clearHist(b) {
  if (!b.dataset.c) {
    b.dataset.c = '1'; b.textContent = '정말 ' + allHist().length + '건 모두 삭제?'; say('한 번 더 누르면 모두 삭제합니다');
    setTimeout(function () { if (b.dataset.c) { b.dataset.c = ''; b.textContent = '전체 삭제'; } }, 6000);
    return;
  }
  b.dataset.c = ''; b.textContent = '전체 삭제';
  localOnly = []; localSave(); histNote('');
  if (store.db) {
    b.disabled = true; clearing = true;
    var n = 0, err = null;
    try {
      for (var round = 0; round < 150; round++) {
        var snap = await store.db.collection(store.hpath).limit(200).get();
        if (snap.empty) break;
        for (var i = 0; i < snap.docs.length; i++) {
          await store.db.doc(store.hpath + '/' + snap.docs[i].id).delete();
          n++;
          if (n % 10 === 0) b.textContent = n + '개 삭제 중…';
        }
      }
    } catch (e) { err = e; console.warn('db', e); }
    clearing = false; b.disabled = false; b.textContent = '전체 삭제';
    if (err) histNote(n + '개를 지운 뒤 멈췄습니다. ' + dbErr(err) + ' 잠시 뒤 다시 눌러 주세요.');
  }
  renderHist();
}
/* 지금 보이는(거른) 기록을 Markdown 으로 — Obsidian 에 그대로 붙일 수 있는 모양 */
function histMarkdown() {
  var list = shownHist();
  var s = '---\ntitle: 번역·패러프레이즈 기록\nexported: ' + new Date().toISOString() + '\ncount: ' + list.length + '\n---\n';
  list.forEach(function (h) {
    var lb = recLabel(h);
    s += '\n## ' + when(h.at) + ' · ' + lb.name + ' · ' + lb.detail + '\n\n';
    if (h.note) s += '맥락·지시: ' + h.note + '\n\n';
    s += (h.input || '').split('\n').map(function (l) { return '> ' + l; }).join('\n') + '\n\n' + (h.output || '') + '\n';
    if (h.notes) s += '\n### ' + (h.kind === 'tr' ? '번역 메모' : '바뀐 곳') + '\n\n' + h.notes + '\n';
  });
  return s;
}

/* ---------- 용어·지침 ---------- */
var GLOSS_SAMPLE = '# 예시입니다. 내 분야에 맞게 고치세요.\n공진기 = cavity\n선폭 = linewidth\n이득 매질 = gain medium\n모드 잠금 = mode locking\n펄스 폭 = pulse duration\n반복률 = repetition rate\n' +
  '중심 파장 = center wavelength\n군속도 분산 = group-velocity dispersion\n자체 위상 변조 = self-phase modulation\n2차 조화파 발생 = second-harmonic generation\n포화 흡수체 = saturable absorber\n' +
  '출력 결합기 = output coupler\n처프 펄스 증폭 = chirped-pulse amplification\n주파수 빗 = frequency comb\npulse width > pulse duration\n!very\nTi:sapphire';
var RULES_SAMPLE = "# 쓰려는 줄의 맨 앞 '#' 을 지우세요.\n# en: Use American spelling throughout (fiber, polarization, center, modeling, analyze).\n" +
  "# en: Use active voice with 'we' for the authors' own actions; use the passive only when the agent is irrelevant.\n" +
  '# en: Never add evaluative or promotional words (novel, remarkable, unprecedented, clearly) that are not in the original.\n' +
  '# en: Past tense for what was done and measured; present tense for established facts and for what figures and equations show.\n' +
  '# Put a space between number and unit (10 nm), write μm not um, use an en dash for ranges (10–20 nm).\n' +
  "# ko: 본문은 '-다' 체로 통일.";
function prefsParsed() {
  var g = parseGloss(prefs.terms), nRules = countRules(prefs.rules);
  glossItems = g.items;
  var by = { pair: 0, prefer: 0, avoid: 0, keep: 0 };
  g.items.forEach(function (i) { by[i.k]++; });
  $('pf-terms-n').textContent = g.items.length || g.bad
    ? '번역쌍 ' + by.pair + ' · 대신 쓰기 ' + by.prefer + ' · 쓰지 않기 ' + by.avoid + ' · 그대로 두기 ' + by.keep + (g.bad ? ' · 읽지 못한 줄 ' + g.bad : '')
    : '아직 용어가 없습니다.';
  $('pf-terms-n').className = 'msg' + (g.bad ? ' err' : '');
  $('pf-rules-n').textContent = nRules ? '지침 ' + nRules + '줄' + (nRules > 12 ? ' · 너무 많아 한 번에 앞의 12줄까지만 보냅니다' : '') : '아직 지침이 없습니다.';
  $('pf-rules-n').className = 'msg' + (nRules > 12 ? ' err' : '');
  var label = '용어 ' + g.items.length + ' · 지침 ' + nRules;
  $('p-terms-chip').textContent = label; $('t-terms-chip').textContent = label;
  var tn = $('termsn');
  tn.hidden = !(g.items.length + nRules); tn.textContent = g.items.length + nRules;
}
function prefsShow() { $('pf-terms').value = prefs.terms; $('pf-rules').value = prefs.rules; prefsParsed(); }
var prefsSaveLater = debounce(prefsSave, 800);
function prefsEdited() {
  prefs.terms = $('pf-terms').value; prefs.rules = $('pf-rules').value;
  prefsDirty = true;
  prefsParsed();
  $('pf-stat').textContent = '저장 중…';
  prefsSaveLater();
  [P, T].forEach(function (tab) { if (tab.res) renderNotes(tab); });
}
function prefsSave() {
  if (!prefsDirty) return;
  prefsDirty = false;
  var doc = { terms: prefs.terms.slice(0, 30000), rules: prefs.rules.slice(0, 30000), at: new Date().toISOString() };
  LS('tp.prefs', JSON.stringify(doc));
  if (!store.db) { $('pf-stat').textContent = '이 브라우저에 저장했습니다.'; return; }
  writeQ.prefs = (writeQ.prefs || Promise.resolve()).then(function () { return store.db.doc(store.ppath).set(doc); })
    .then(function () { $('pf-stat').textContent = '계정에 저장했습니다.'; })
    .catch(function (e) { console.warn('db', e); $('pf-stat').textContent = dbErr(e) + ' 이 브라우저에만 저장했습니다.'; });
}
function glossHas(a, b) {
  return glossItems.some(function (g) { return g.k === 'pair' && (gnorm(g.a, true) === gnorm(a, true) || gnorm(g.b, true) === gnorm(b, true) || gnorm(g.a, true) === gnorm(b, true) || gnorm(g.b, true) === gnorm(a, true)); });
}
function addGlossPair(a, b) {
  if (glossHas(a, b)) return;
  var ko = /[가-힣]/.test(a) ? a : b, other = ko === a ? b : a;
  prefs.terms = (prefs.terms.replace(/\s+$/, '') + '\n' + ko + ' = ' + other).replace(/^\n/, '');
  prefsDirty = true;
  prefsShow(); prefsSave();
  say('용어집에 넣었습니다');
}

/* ---------- 저장소 열기: 기록과 용어·지침은 보는 사람 계정의 비공개 자리(data/users/<id>/…)에 둠 ---------- */
function dropSynced() {
  var ids = {};
  hist.forEach(function (h) { ids[h.id] = 1; });
  var n = localOnly.length;
  localOnly = localOnly.filter(function (h) { return !ids[h.id]; });
  if (localOnly.length !== n) localSave();
}
function openStore() {
  Promise.all([dbP, userP]).then(async function (a) {
    var d = a[0], u = a[1], uid = null;
    try { uid = u && u.id ? await u.id() : null; } catch (e) { uid = null; }
    if (!d || !uid) { dbChip('기록: 이 브라우저만', 'mute', '다른 기기에서는 보이지 않습니다'); $('h-desc').textContent = '교정·패러프레이즈·번역 결과가 쌓입니다. 지금은 이 브라우저에만 저장됩니다 (최근 200개).'; return; }
    store.db = d; store.uid = uid;
    store.hpath = 'data/users/' + uid + '/app/history'; store.ppath = 'data/users/' + uid + '/prefs';
    dbChip('기록 여는 중', 'mute');
    var t1 = setTimeout(function () { if (!store.live) dbChip('기록: 응답 없음', 'mid', hist.length ? '보이는 것은 예전 내용일 수 있습니다' : ''); }, 10000);
    d.collection(store.hpath).orderBy('at', 'desc').limit(300).onSnapshot(function (snap) {
      hist = snap.docs.map(function (x) { var o = Object.assign({}, x.data()); o.id = x.id; return o; });
      dropSynced(); renderHist();
      if (!snap.metadata || !snap.metadata.fromCache) { store.live = true; clearTimeout(t1); dbChip('기록: 계정에 저장', 'ok', '다른 기기에서도 보이고, 다른 사람에게는 보이지 않습니다'); }
    }, function (e) {
      clearTimeout(t1); store.db = null; console.warn('db', e);
      dbChip('기록: 저장 오류', 'no', '이 브라우저에만 저장합니다');
    });
    d.doc(store.ppath).onSnapshot(function (snap) {
      if (!snap.exists) { if (prefs.terms || prefs.rules) { prefsDirty = true; prefsSave(); } return; }     /* 이 브라우저에만 있던 것을 계정으로 올림 */
      if (snap.metadata && snap.metadata.hasPendingWrites) return;
      if (prefsDirty || document.activeElement === $('pf-terms') || document.activeElement === $('pf-rules')) return;
      var x = snap.data() || {};
      prefs = { terms: typeof x.terms === 'string' ? x.terms : '', rules: typeof x.rules === 'string' ? x.rules : '' };
      LS('tp.prefs', JSON.stringify(prefs));
      prefsShow();
      [P, T].forEach(function (tab) { if (tab.res) renderNotes(tab); });
    }, function (e) { console.warn('db prefs', e); });
  });
}
