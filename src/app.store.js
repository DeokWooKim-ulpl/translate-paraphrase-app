/* ===== 저장: 기록(계정별 비공개 + 이 브라우저 대체), 용어·지침, 내보내기 ===== */

var store = { db: null, uid: null, hpath: '', ppath: '', live: false };
var hist = [], older = [], olderDone = false, olderBusy = false, localOnly = [], clearing = false, histShown = 50, hFilter = '', openIds = {}, writeQ = {}, saveFailed = false;
var prefs = { terms: '', rules: '' }, glossItems = [], prefsDirty = false, prefsAt = '', prefsUnsynced = false;
var dbstat = $('dbstat');
function dbChip(text, cls, title) { if (dbstat.textContent !== text) dbstat.textContent = text; dbstat.className = 'chip ' + cls; dbstat.title = title || ''; }
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
/* 이 브라우저 보관: 공간이 모자라면 오래된 것부터 덜어 내고, 덜어 냈으면 알림 */
function localSave() {
  var want = localOnly.slice(0, 200), keep = want, ok = false;
  while (!ok) {
    try { localStorage.setItem('hist', JSON.stringify(keep)); ok = true; }
    catch (e) { if (!keep.length) break; keep = keep.slice(0, Math.max(0, keep.length - 10)); }
  }
  if (keep.length < want.length) histNote('이 브라우저 저장 공간이 가득 차 오래된 기록 ' + (want.length - keep.length) + '건은 보관하지 못했습니다. 「파일로 내보내기」나 「Markdown 복사」로 받아 두고 기록을 정리해 주세요.');
}
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
      o.kind = 'tr'; o.src = o.src || lp[0] || 'auto'; o.dst = o.dst || lp[1] || 'en'; o.style = o.style || o.mode || 'standard';
      if (!LG[o.dst]) o.dst = 'en';
      if (!LG[o.src]) { o.src = guessLang(o.input || ''); if (o.src === o.dst) o.src = o.dst === 'ko' ? 'en' : 'ko'; }      /* 1.x 는 '언어 감지'를 auto 로 적었음 */
      o.lang = o.dst;
    } else if (o.mode === 'fix' || /^교정/.test(tool) || !o.mode) { o.kind = 'fix'; o.level = 'standard'; o.lang = o.lang === 'ko' ? 'ko' : 'en'; }
    else { o.kind = 'para'; o.style = o.mode; o.lang = o.lang === 'ko' ? 'ko' : 'en'; }
  }
  if (/\+점검$/.test(o.tool || '')) o.edited = true;
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
    input: r.text, output: v.out, notes: v.notes || '', tier: r.tier || '', sel: r.cur, mod: Date.now() };
  if (r.kind === 'tr') { rec.src = r.src; rec.dst = r.dst; }
  if (r.kind === 'para') rec.versions = r.versions.map(function (x) { return { label: x.label, text: x.out, why: x.notes || '' }; });
  if (r.edited) rec.edited = true;
  if (r.clipped) rec.clipped = true;
  return rec;
}
function saveRes(tab) {
  var r = tab.res;
  clearTimeout(tab.saveT); tab.saveT = 0;
  if (!r || r.part || r.noSave) return;
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
  writeQ[rec.id] = (writeQ[rec.id] || Promise.resolve()).then(function () { return setRetry(ref, rec); }).then(function () {
    var n = localOnly.length;                         /* 계정에 올라갔으니 같거나 더 옛 이 브라우저 사본은 버림 */
    localOnly = localOnly.filter(function (x) { return x.id !== rec.id || (x.mod || 0) > (rec.mod || 0); });
    if (localOnly.length !== n) { localSave(); renderHist(); }
    if (saveFailed) { saveFailed = false; histNote(''); }
  }).catch(function (e) {
    console.warn('db', e);
    saveFailed = true;
    histNote(dbErr(e) + ' 방금 결과는 이 브라우저에만 보관했습니다. 다음에 저장소가 열리면 계정으로 올립니다.');
    dbChip('기록: 저장 실패 · 이 브라우저에 보관', 'mid', dbErr(e));
    if (e && ['revoked', 'not_granted', 'capability_disabled', 'capability_removed'].indexOf(e.code) >= 0) store.db = null;
    localUpsert(rec);
  });
}
/* 지운 기록이 화면에 열려 있으면, 그 결과를 더 손봐도 기록이 되살아나지 않게 함 */
function forgetOpen(id) {
  [P, T].forEach(function (tab) {
    if (tab.res && (id === null || tab.res.histId === id)) { clearTimeout(tab.saveT); tab.saveT = 0; tab.res.histId = null; tab.res.noSave = true; }
  });
}
async function delRec(h) {
  forgetOpen(h.id);
  var n = localOnly.length;
  localOnly = localOnly.filter(function (x) { return x.id !== h.id; });
  if (localOnly.length !== n) localSave();
  if (!store.db || !hist.concat(older).some(function (x) { return x.id === h.id; })) { renderHist(); return; }
  try {
    await (writeQ[h.id] || Promise.resolve()); await store.db.doc(store.hpath + '/' + h.id).delete(); histNote('');
    if (older.some(function (x) { return x.id === h.id; })) { older = older.filter(function (x) { return x.id !== h.id; }); renderHist(); }
  }
  catch (e) { console.warn('db', e); histNote('삭제하지 못했습니다. ' + dbErr(e)); }
}

/* ---------- 기록 목록 ---------- */
function allHist() {
  var seen = {};                                      /* 같은 기록이 두 곳에 있으면 앞의 것(이 브라우저의 더 새 사본)만 */
  return localOnly.concat(hist, older).filter(function (h) { if (seen[h.id]) return false; seen[h.id] = 1; return true; })
    .map(normRec).sort(function (a, b) { return (a.at || '') < (b.at || '') ? 1 : (a.at || '') > (b.at || '') ? -1 : 0; });
}
/* 최근 300건 밖의 기록: 「더 보기」로 한 쪽(300건)씩 읽어 옴 */
function moreOlder() { return !!store.db && hist.length >= 300 && !olderDone; }
async function loadOlder() {
  if (olderBusy || !moreOlder()) return;
  var pool = hist.concat(older), last = pool.reduce(function (m, h) { return h.at && (!m || h.at < m) ? h.at : m; }, '');
  if (!last) { olderDone = true; renderHist(); return; }
  olderBusy = true; $('h-more').disabled = true;
  try {
    var snap = await store.db.collection(store.hpath).where('at', '<', last).orderBy('at', 'desc').limit(300).get();
    older = older.concat(snap.docs.map(function (x) { var o = Object.assign({}, x.data()); o.id = x.id; return o; }));
    if (snap.docs.length < 300) olderDone = true;
    histNote('');
  } catch (e) { console.warn('db', e); histNote('이전 기록을 불러오지 못했습니다. ' + dbErr(e)); }
  olderBusy = false; $('h-more').disabled = false;
  renderHist();
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
  $('histn').textContent = moreOlder() ? all.length + '+' : all.length;
  box.textContent = '';
  $('h-more').hidden = list.length <= histShown && !moreOlder();
  $('h-more').textContent = list.length > histShown ? '더 보기' : '이전 기록 불러오기';
  $('h-md').disabled = !list.length; $('h-file').disabled = !list.length; $('h-clear').disabled = !all.length;
  if (!list.length) {
    box.appendChild(el('div', { class: 'msg' }, all.length ? '맞는 기록이 없습니다.' + (moreOlder() ? ' 최근 ' + all.length + '건 안에서 찾았습니다 — 아래 「이전 기록 불러오기」를 누르면 더 옛 기록도 찾습니다.' : '') : '아직 기록이 없습니다. 교정·패러프레이즈·번역을 실행하면 여기에 쌓입니다.'));
    return;
  }
  list.slice(0, histShown).forEach(function (h) {
    var d = el('div', { class: 'hist' + (openIds[h.id] ? ' open' : ''), 'data-id': h.id }), hd = el('div', { class: 'h' }), lb = recLabel(h);
    hd.appendChild(chipEl(lb.name, 'ac')); hd.appendChild(chipEl(lb.detail, 'mute'));
    if (h.local) hd.appendChild(chipEl('이 브라우저에만', 'mid'));
    if (h.clipped) hd.appendChild(chipEl('일부만 저장', 'mid', '글이 길어 앞부분만 기록에 남았습니다.'));
    if (h.edited) hd.appendChild(chipEl('손봄', 'mute', '실행한 뒤에 수정을 되돌리거나 점검·다른 표현으로 고친 결과입니다.'));
    if (h.tier && MODELS[h.tier]) hd.appendChild(chipEl(MODELS[h.tier].label, 'mute', '이 결과를 만들 때 고른 모델'));
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
    function toggle() {
      if (openIds[h.id]) delete openIds[h.id]; else openIds[h.id] = 1;
      renderHist();
      var again = Array.prototype.filter.call(box.querySelectorAll('.hist'), function (n) { return n.dataset.id === h.id; })[0];
      if (again) again.querySelector('.body').focus({ preventScroll: true });
    }
    body.addEventListener('click', function () { if (!String(window.getSelection ? window.getSelection() : '')) toggle(); });
    body.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    d.appendChild(body);
    box.appendChild(d);
  });
}
/* 기록을 그 탭에 다시 펼침 */
function reopen(h) {
  h = normRec(h);
  var tab = h.kind === 'tr' ? T : P, noteBox = $(tab.k + '-note');
  var old = { v: tab.in.value, note: noteBox.value };
  clearTab(tab);
  var vers = h.kind === 'para' && Array.isArray(h.versions) && h.versions.length
    ? h.versions.map(function (v) { return { label: v.label || '기본', out: v.text || '', notes: v.why || '' }; })
    : [{ label: h.kind === 'tr' ? '번역' : h.kind === 'fix' ? '교정' : '기본', out: h.output || '', notes: h.notes || '' }];
  var cur = Math.min(Math.max(0, h.sel || 0), vers.length - 1);
  var res = { kind: h.kind, text: h.input || '', lang: h.lang, style: h.kind === 'fix' ? '' : h.style, level: h.kind === 'fix' ? (LEVEL[h.level] ? h.level : 'standard') : '', note: h.note || '',
    versions: vers, cur: cur, ops: null, part: false, histId: h.id, at: h.at, tier: h.tier || '', model: h.tier && MODELS[h.tier] ? { t: MODELS[h.tier].label, c: 'mute', tip: '기록에 남은 모델 선택입니다 (실제로 답한 모델은 저장되지 않음).' } : null, edited: !!h.edited, clipped: !!h.clipped, round: 1 };
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
  var lost = !!old.v.trim() && old.v.trim() !== res.text.trim();
  setStatus(tab, '기록에서 다시 열었습니다.' + (h.clipped ? ' 기록에는 앞부분만 저장되어 있습니다.' : ''), '', lost ? [{ label: '쓰던 글 되돌리기', fn: function () {
    clearTab(tab); tab.in.value = old.v; noteBox.value = old.note;
    if (tab.k === 'p') pCount(); else tCount();
    refresh(tab); setSide(tab, 'notes'); setStatus(tab, '쓰던 글을 되돌렸습니다.', ''); saveDrafts();
  } }] : []);
  tab.undo = lost;
  showTab(h.kind === 'tr' ? 'translate' : 'polish', true);
  window.scrollTo(0, 0);
  try { tab.run.focus({ preventScroll: true }); } catch (e) { tab.run.focus(); }
  saveSettings(); saveDrafts();
}
async function clearHist(b) {
  if (!b.dataset.c) {
    b.dataset.c = '1'; b.textContent = '정말 ' + (moreOlder() ? '옛 기록까지 전부' : allHist().length + '건 모두') + ' 삭제?'; say('한 번 더 누르면 모두 삭제합니다');
    setTimeout(function () { if (b.dataset.c) { b.dataset.c = ''; b.textContent = '전체 삭제'; } }, 6000);
    return;
  }
  b.dataset.c = ''; b.textContent = '전체 삭제';
  forgetOpen(null);
  localOnly = []; localSave(); histNote(''); older = []; olderDone = false;
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
          if (n % 10 === 0) b.textContent = n + '건 삭제 중…';
        }
      }
    } catch (e) { err = e; console.warn('db', e); }
    clearing = false; b.disabled = false; b.textContent = '전체 삭제';
    if (err) histNote(n + '건을 지운 뒤 멈췄습니다. ' + dbErr(err) + ' 잠시 뒤 다시 눌러 주세요.');
  }
  renderHist();
}
/* 지금 보이는(거른) 기록을 Markdown 으로 — Obsidian 에 그대로 붙일 수 있는 모양 */
function mdSafe(t) {            /* 글 안의 '---', '===', '# …' 줄이 제목·구분선으로 읽히지 않게 */
  return (t || '').split('\n').map(function (l) {
    return /^\s{0,3}(-{3,}|={3,}|\*{3,}|_{3,}|#{1,6}(\s.*)?)\s*$/.test(l) ? '\\' + l.replace(/^\s+/, '') : l;
  }).join('\n');
}
function histMarkdown() {
  var list = shownHist();
  var s = '---\ntitle: 번역·패러프레이즈 기록\nexported: ' + new Date().toISOString() + '\ncount: ' + list.length + '\n---\n';
  list.forEach(function (h) {
    var lb = recLabel(h);
    s += '\n## ' + when(h.at) + ' · ' + lb.name + ' · ' + lb.detail + '\n\n';
    if (h.note) s += '맥락·지시: ' + h.note + '\n\n';
    s += mdSafe(h.input).split('\n').map(function (l) { return '> ' + l; }).join('\n') + '\n\n' + mdSafe(h.output) + '\n';
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
  if ($('pf-stat').textContent !== '저장 중…') $('pf-stat').textContent = '저장 중…';
  prefsSaveLater();
  [P, T].forEach(function (tab) { if (tab.res) renderNotes(tab); });
}
/* 이 브라우저 사본: unsynced 가 켜져 있으면 계정에 아직 못 올린 내용 */
function prefsLocal(doc, unsynced) {
  prefsAt = typeof doc.at === 'string' ? doc.at : ''; prefsUnsynced = !!unsynced;
  LS('tp.prefs', JSON.stringify({ terms: doc.terms, rules: doc.rules, at: prefsAt, unsynced: unsynced ? 1 : 0 }));
}
function setRetry(ref, doc) {                       /* unavailable 은 잠깐 뒤 한 번만 다시 */
  return ref.set(doc).catch(function (e) {
    if (!e || e.code !== 'unavailable') throw e;
    return new Promise(function (r) { setTimeout(r, 400 + Math.random() * 800); }).then(function () { return ref.set(doc); });
  });
}
function prefsSave() {
  if (!prefsDirty) return;
  prefsDirty = false;
  var doc = { terms: prefs.terms.slice(0, 30000), rules: prefs.rules.slice(0, 30000), at: new Date().toISOString() };
  prefsLocal(doc, true);
  if (!store.db) { $('pf-stat').textContent = '이 브라우저에 저장했습니다.'; return; }
  writeQ.prefs = (writeQ.prefs || Promise.resolve()).then(function () { return setRetry(store.db.doc(store.ppath), doc); })
    .then(function () { if (prefsAt === doc.at) prefsLocal(doc, false); $('pf-stat').textContent = '계정에 저장했습니다.'; })
    .catch(function (e) { console.warn('db', e); $('pf-stat').textContent = dbErr(e) + ' 이 브라우저에만 저장했습니다. 다음에 열 때 계정으로 올립니다.'; });
}
/* 계정에서 온 내용을 화면에 반영 (입력 중인 칸이면 커서 자리를 지킴) */
function prefsApply(x) {
  var t = typeof x.terms === 'string' ? x.terms : '', r = typeof x.rules === 'string' ? x.rules : '';
  var same = t === prefs.terms && r === prefs.rules;
  prefs = { terms: t, rules: r };
  prefsLocal({ terms: t, rules: r, at: x.at }, false);
  if (same) return;
  [['pf-terms', t], ['pf-rules', r]].forEach(function (p) {
    var ta = $(p[0]);
    if (ta.value === p[1]) return;
    var at = Math.min(ta.selectionStart || 0, p[1].length), focused = document.activeElement === ta;
    ta.value = p[1];
    if (focused) ta.setSelectionRange(at, at);
  });
  prefsParsed();
  [P, T].forEach(function (tab) { if (tab.res) renderNotes(tab); });
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
  var by = {};
  hist.forEach(function (h) { by[h.id] = h; });
  var n = localOnly.length;                           /* 계정 것이 같거나 더 새로울 때만 이 브라우저 사본을 버림 */
  localOnly = localOnly.filter(function (h) { return !by[h.id] || (h.mod || 0) > (by[h.id].mod || 0); });
  if (localOnly.length !== n) localSave();
}
/* 이 브라우저에만 남은 기록(저장 실패, 저장소가 열리기 전에 끝난 실행)을 계정으로 올림: 저장소가 열렸을 때 한 번 */
async function uploadLocal() {
  var list = localOnly.slice().reverse();
  for (var i = 0; i < list.length && store.db; i++) {
    var rec = Object.assign({}, list[i]), ref = store.db.doc(store.hpath + '/' + rec.id);
    delete rec.local;
    try {
      var cur = await ref.get();
      if (!cur.exists || ((cur.data() || {}).mod || 0) < (rec.mod || 0)) await (writeQ[rec.id] = (writeQ[rec.id] || Promise.resolve()).then(function () { return setRetry(ref, clipRecord(rec)); }));
    } catch (e) { console.warn('db', e); break; }
    localOnly = localOnly.filter(function (x) { return x !== list[i]; });
    localSave();
  }
  renderHist();
}
function openStore() {
  Promise.all([dbP, userP]).then(async function (a) {
    var d = a[0], u = a[1], uid = null;
    try { uid = u && u.id ? await u.id() : null; } catch (e) { uid = null; }
    if (!d || !uid) { dbChip('기록: 이 브라우저만', 'mute', '다른 기기에서는 보이지 않습니다'); $('h-desc').textContent = '교정·패러프레이즈·번역 결과가 쌓입니다. 지금은 이 브라우저에만 저장됩니다 (최근 200건).'; return; }
    store.db = d; store.uid = uid;
    store.hpath = 'data/users/' + uid + '/app/history'; store.ppath = 'data/users/' + uid + '/prefs';
    dbChip('기록 여는 중', 'mute');
    var t1 = setTimeout(function () { if (!store.live) dbChip('기록: 응답 없음', 'mid', hist.length ? '보이는 것은 예전 내용일 수 있습니다' : ''); }, 10000);
    d.collection(store.hpath).orderBy('at', 'desc').limit(300).onSnapshot(function (snap) {
      var prev = hist, first = !store.live;
      hist = snap.docs.map(function (x) { var o = Object.assign({}, x.data()); o.id = x.id; return o; });
      if (older.length && hist.length >= 300) {             /* 새 기록에 밀려 300건 창 밖으로 나간 것은 '이전 기록' 쪽에 남김 */
        var ids = {}, lastAt = hist[hist.length - 1].at || '';
        hist.forEach(function (h) { ids[h.id] = 1; });
        prev.forEach(function (h) { if (!ids[h.id] && (h.at || '') <= lastAt) older.unshift(h); });
      }
      dropSynced(); renderHist();
      if (!snap.metadata || !snap.metadata.fromCache) {
        store.live = true; clearTimeout(t1); dbChip('기록: 계정에 저장', 'ok', '다른 기기에서도 보이고, 다른 사람에게는 보이지 않습니다');
        if (first && localOnly.length) setTimeout(uploadLocal, 0);
      }
    }, function (e) {
      clearTimeout(t1); store.db = null; console.warn('db', e);
      dbChip('기록: 저장 오류', 'no', '이 브라우저에만 저장합니다');
    });
    d.doc(store.ppath).onSnapshot(function (snap) {
      var m = snap.metadata || {};
      if (m.hasPendingWrites || prefsDirty) return;                 /* 내가 방금 고친 것이 곧 올라감 */
      if (!snap.exists) {                                           /* 이 브라우저에만 있던 것을 계정으로 올림 (확인된 답일 때만) */
        if (!m.fromCache && (prefs.terms || prefs.rules)) { prefsDirty = true; prefsSave(); }
        return;
      }
      var x = snap.data() || {};
      if (prefsUnsynced && prefsAt > (typeof x.at === 'string' ? x.at : '')) {     /* 못 올린 더 새 내용이 이 브라우저에 있음 */
        if (!m.fromCache) { prefsDirty = true; prefsSave(); }
        return;
      }
      prefsApply(x);
    }, function (e) { console.warn('db prefs', e); });
  });
}
