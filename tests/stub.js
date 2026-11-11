/* 테스트용 가짜 런타임: claude.ai 가 페이지에 주는 sample · db · user · downloads 를 흉내 냄.
   페이지가 뜨기 전에 실행됨 (Playwright addInitScript). window.__cfg 로 동작을 바꿈. */
function stubRuntime() {
  window.__calls = [];
  window.__cfg = Object.assign({ delay: 0, steps: 2 }, window.__cfg || {});
  function textOf(input, tag) {
    var open = '<' + tag + '>\n', i = input.lastIndexOf(open), j = input.lastIndexOf('\n</' + tag + '>');
    return i >= 0 && j > i ? input.slice(i + open.length, j) : '';
  }
  window.__textOf = textOf;
  /* 기본 답: 지시문 종류를 보고 형식에 맞는 답을 만듦 */
  window.__respond = window.__respond || function (input, n) {
    var text = textOf(input, 'text');
    if (/^You are a copy editor/.test(input)) {
      var fixed = text.replace(/was lock\b/g, 'was locked').replace(/which reduce\b/g, 'which reduces').replace(/잠궜다/g, '잠갔다');
      return '<result>\n' + fixed + '\n</result>\n<notes>\n' + (fixed === text ? '- 고칠 곳이 없습니다.' : '- [문법] "was lock" → "was locked": 수동태 과거분사\n- [문법] "which reduce" → "which reduces": 수 일치') + '\n</notes>';
    }
    if (/Paraphrase the text inside <text>/.test(input)) {
      var three = /Write three versions/.test(input), tag = 'R' + n;
      var s = '<v1>\n' + tag + ' balanced: Locked to the cavity with the PDH method, the laser showed 1.2 kHz noise [3].\n</v1>\n<why1>\n- [구조] "was locked" → "Locked to the cavity": 분사구문으로 시작\n</why1>';
      if (three) s += '\n<v2>\n' + tag + ' closer: The laser was stabilized to the cavity by the PDH method and showed 1.2 kHz noise [3].\n</v2>\n<why2>\n- [어휘] "locked" → "stabilized": 어휘 교체\n</why2>' +
        '\n<v3>\n' + tag + ' freer: Using the PDH method, we stabilized the laser to the cavity; its noise was 1.2 kHz [3].\n</v3>\n<why3>\n- [구조] "The laser was" → "we stabilized": 능동\n</why3>';
      return s;
    }
    if (/^You are a professional scientific translator/.test(input)) {
      return '<result>\nTR' + n + '[' + text.slice(0, 24) + ']\n</result>\n<notes>\n- [용어] "공진기" → "cavity" (대안: resonator): 분야 관용\n- [해석] "잠갔다": 주어를 we 로 읽음\n</notes>';
    }
    if (/^You are reviewing a/.test(input)) {
      var res = textOf(input, 'result'), q = res.split(/\s+/).slice(0, 3).join(' ');
      return '<issue>\n<kind>어색</kind>\n<severity>medium</severity>\n<quote>' + q + '</quote>\n<fix>FIXED ' + q + '</fix>\n<why>더 자연스러운 어순</why>\n</issue>\n' +
        '<issue>\n<kind>수치</kind>\n<severity>high</severity>\n<quote>no such phrase here</quote>\n<fix>x</fix>\n<why>원문은 다름</why>\n</issue>\n<summary>전반적으로 자연스럽습니다.</summary>';
    }
    if (/other ways to write the part between/.test(input)) {
      return '<a1>\nALT-ONE\n</a1>\n<w1>수동</w1>\n<a2>\nALT-TWO\n</a2>\n<w2>능동</w2>\n<a3>\nALT-THREE\n</a3>\n<w3>명사구</w3>';
    }
    if (/as literally as accuracy allows/.test(input)) return '<result>\n역번역 결과\n</result>';
    return 'UNKNOWN PROMPT';
  };
  var sample = function (input, o) {
    o = o || {};
    var n = window.__calls.length + 1, rec = { input: input, opts: { model: o.model, modelTier: o.modelTier, effort: o.effort, cache: o.cache }, state: 'running' };
    window.__calls.push(rec);
    return new Promise(function (res, rej) {
      var cfg = window.__cfg, full = window.__respond(input, n), steps = cfg.steps || 1, delay = cfg.delay || 0, i = 0, sofar = '', done = false;
      function fail(code) {
        if (done) return; done = true; rec.state = code;
        var e = { code: code, message: 'The call was ' + code + ' (developer message, must not be shown)' };
        if (sofar) e.text = sofar;
        rej(e);
      }
      if (o.signal) {
        if (o.signal.aborted) { setTimeout(function () { fail('cancelled'); }, 0); return; }
        o.signal.addEventListener('abort', function () { fail('cancelled'); });
      }
      var failBefore = cfg.failBefore; if (cfg.failOnce) { cfg.failBefore = ''; }
      if (failBefore) { setTimeout(function () { fail(failBefore); }, delay); return; }
      function tick() {
        if (done) return;
        i++; sofar = full.slice(0, Math.ceil(full.length * i / steps));
        try { if (o.onText) o.onText({ text: sofar }); } catch (e) { /* 페이지 쪽 오류는 무시 */ }
        if (cfg.failAfter && i >= (cfg.failAt || 1)) { var c = cfg.failAfter; if (cfg.failOnce) cfg.failAfter = ''; fail(c); return; }
        if (i >= steps) { done = true; rec.state = 'done'; res({ text: full, truncated: !!cfg.truncated, modelApplied: cfg.noModel ? undefined : o.model, modelTierApplied: o.modelTier }); }
        else setTimeout(tick, delay);
      }
      setTimeout(tick, delay);
    });
  };
  sample.limits = async function () { return { maxPromptBytes: 262144 }; };

  /* db: 경로 → 문서. 컬렉션 구독·한 번 읽기·문서 구독 지원 */
  var docs = new Map(), colSubs = [], docSubs = [];
  window.__docs = docs;
  window.__dbcfg = { failSet: '', failDelete: '', sets: 0 };
  function snapOf(path) {
    var d = docs.get(path);
    return { id: path.split('/').pop(), exists: !!d, data: function () { return d ? JSON.parse(JSON.stringify(d)) : undefined; }, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function colDocs(col, q) {
    var depth = col.split('/').length + 1, arr = [];
    docs.forEach(function (v, p) { if (p.indexOf(col + '/') === 0 && p.split('/').length === depth) arr.push(p); });
    if (q.order) arr.sort(function (a, b) { var x = docs.get(a)[q.order], y = docs.get(b)[q.order]; return (x < y ? -1 : x > y ? 1 : 0) * (q.dir === 'desc' ? -1 : 1); });
    else arr.sort();
    return arr.slice(0, q.n || 1000).map(snapOf);
  }
  function emit(path) {
    setTimeout(function () {
      colSubs.forEach(function (s) { if (path.indexOf(s.col + '/') === 0) { var ds = colDocs(s.col, s.q); s.next({ docs: ds, size: ds.length, empty: !ds.length, metadata: { fromCache: false, hasPendingWrites: false }, docChanges: function () { return []; } }); } });
      docSubs.forEach(function (s) { if (s.path === path) s.next(snapOf(path)); });
    }, 0);
  }
  function docRef(path) {
    return {
      id: path.split('/').pop(), path: path,
      get: async function () { return snapOf(path); },
      set: async function (d) { window.__dbcfg.sets++; if (window.__dbcfg.failSet) throw { code: window.__dbcfg.failSet, message: 'x' }; docs.set(path, JSON.parse(JSON.stringify(d))); emit(path); },
      update: async function (d) { docs.set(path, Object.assign({}, docs.get(path) || {}, JSON.parse(JSON.stringify(d)))); emit(path); },
      delete: async function () { if (window.__dbcfg.failDelete) throw { code: window.__dbcfg.failDelete, message: 'x' }; docs.delete(path); emit(path); },
      onSnapshot: function (next) { var s = { path: path, next: next }; docSubs.push(s); setTimeout(function () { next(snapOf(path)); }, 0); return function () { docSubs.splice(docSubs.indexOf(s), 1); }; }
    };
  }
  function query(col, q) {
    return {
      path: col,
      where: function () { return query(col, q); },
      orderBy: function (f, dir) { return query(col, Object.assign({}, q, { order: f, dir: dir || 'asc' })); },
      limit: function (n) { return query(col, Object.assign({}, q, { n: n })); },
      get: async function () { var ds = colDocs(col, q); return { docs: ds, size: ds.length, empty: !ds.length, metadata: { fromCache: false, hasPendingWrites: false } }; },
      onSnapshot: function (next) { var s = { col: col, q: q, next: next }; colSubs.push(s); setTimeout(function () { var ds = colDocs(col, q); next({ docs: ds, size: ds.length, empty: !ds.length, metadata: { fromCache: false, hasPendingWrites: false }, docChanges: function () { return []; } }); }, 0); return function () { colSubs.splice(colSubs.indexOf(s), 1); }; },
      doc: function (id) { return docRef(col + '/' + (id || 'auto' + Math.random().toString(36).slice(2))); }
    };
  }
  var db = { doc: docRef, collection: function (p) { return query(p, {}); } };
  var user = { id: async function () { return window.__cfg.noUser ? null : 'u_testuser0123456789abcd'; } };
  window.__saved = [];
  var downloads = { save: async function (r) { window.__saved.push(r); return { status: 'saved' }; } };
  var map = { sample: sample, db: db, user: user, downloads: downloads };
  window.claude = { use: async function (n) { if ((window.__cfg.off || []).indexOf(n) >= 0) return null; return map[n] || null; } };
}
if (typeof module !== 'undefined') module.exports = { stubRuntime: stubRuntime };
