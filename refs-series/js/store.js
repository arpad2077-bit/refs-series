/* Загрузка данных, нормализация, мелкие утилиты. */
(function () {
  'use strict';

  var LS = {
    volume: 'refs.volume',
    notesOn: 'refs.notesOn',
    autonext: 'refs.autonext',
    pos: 'refs.pos.'
  };

  function uid(prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-4);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* 83.5 → "1:23"; 3723 → "1:02:03" */
  function fmtTime(sec) {
    sec = Number(sec);
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }

  /* "1:23", "83", "0:01:23.5", "1:02:03" → секунды */
  function parseTime(str) {
    if (typeof str === 'number') return isFinite(str) ? Math.max(0, str) : 0;
    if (!str) return 0;
    var s = String(str).trim().replace(',', '.');
    if (!s) return 0;
    var parts = s.split(':');
    var total = 0;
    for (var i = 0; i < parts.length; i++) {
      var n = parseFloat(parts[i]);
      if (!isFinite(n)) return 0;
      total = total * 60 + n;
    }
    return Math.max(0, Math.round(total * 1000) / 1000);
  }

  function lsGet(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* приватный режим */ }
  }

  function isHttpUrl(u) {
    return /^https?:\/\/\S+$/i.test(String(u || '').trim());
  }

  function normalizeLink(l) {
    l = l || {};
    var kind = (l.kind === 'read' || l.kind === 'listen') ? l.kind : 'watch';
    return { kind: kind, label: String(l.label || '').trim(), url: String(l.url || '').trim() };
  }

  function normalizeNote(n) {
    n = n || {};
    var links = Array.isArray(n.links) ? n.links.map(normalizeLink).filter(function (l) { return l.url; }) : [];
    return {
      id: n.id || uid('note'),
      t: parseTime(n.t),
      dur: Math.min(600, Math.max(1, Number(n.dur) || 6)),
      title: String(n.title || '').trim(),
      text: String(n.text || ''),
      spoiler: !!n.spoiler,
      links: links
    };
  }

  function normalizeVideo(v) {
    v = v || {};
    var kind = (v.kind === 'file' || v.kind === 'embed') ? v.kind : 'youtube';
    var clipStart = Number(v.clipStart);
    var clipEnd = Number(v.clipEnd);
    var out = { kind: kind, ref: String(v.ref || '').trim() };
    // Отрезок внутри файла: сайт проигрывает только его, а таймкоды отсылок
    // считаются от начала отрезка.
    if (kind === 'file') {
      if (isFinite(clipStart) && clipStart > 0) out.clipStart = Math.round(clipStart * 100) / 100;
      if (isFinite(clipEnd) && clipEnd > 0) out.clipEnd = Math.round(clipEnd * 100) / 100;
      if (out.clipStart != null && out.clipEnd != null && out.clipEnd <= out.clipStart) {
        delete out.clipEnd;
      }
    }
    return out;
  }

  function normalizeEpisode(e, index) {
    e = e || {};
    return {
      id: e.id || uid('ep'),
      number: Number(e.number) || (index + 1),
      title: String(e.title || ''),
      description: String(e.description || ''),
      video: normalizeVideo(e.video),
      notes: Array.isArray(e.notes) ? e.notes.map(normalizeNote) : [],
      nextOverride: e.nextOverride || null
    };
  }

  function normalizeSeries(s, index) {
    s = s || {};
    var eps = Array.isArray(s.episodes) ? s.episodes.map(normalizeEpisode) : [];
    eps.sort(function (a, b) { return a.number - b.number; });
    return {
      id: s.id || uid('series'),
      title: String(s.title || 'Без названия'),
      poster: String(s.poster || ''),
      description: String(s.description || ''),
      episodes: eps
    };
  }

  function normalize(raw) {
    raw = raw || {};
    var series = Array.isArray(raw.series) ? raw.series.map(normalizeSeries) : [];
    return {
      site: {
        title: String((raw.site && raw.site.title) || 'Отсылки'),
        subtitle: String((raw.site && raw.site.subtitle) || '')
      },
      series: series
    };
  }

  var Store = {
    data: null,
    source: 'seed',
    error: null,

    load: function () {
      var self = this;
      return fetch('data/data.json?v=' + Date.now(), { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('data.json: HTTP ' + res.status);
          return res.json();
        })
        .then(function (json) {
          self.data = normalize(json);
          self.source = 'remote';
          return self;
        })
        .catch(function (err) {
          // file:// или файл ещё не опубликован — показываем демо-контент.
          self.data = normalize(window.SEED_DATA);
          self.source = 'seed';
          self.error = err;
          return self;
        });
    },

    series: function (id) {
      return (this.data.series || []).filter(function (s) { return s.id === id; })[0] || null;
    },

    episode: function (seriesId, episodeId) {
      var s = this.series(seriesId);
      if (!s) return null;
      return s.episodes.filter(function (e) { return e.id === episodeId; })[0] || null;
    },

    nextEpisode: function (series, ep) {
      if (!series || !ep) return null;
      if (ep.nextOverride) {
        var chosen = series.episodes.filter(function (e) { return e.id === ep.nextOverride; })[0];
        if (chosen) return chosen;
      }
      var i = series.episodes.indexOf(ep);
      return (i >= 0 && i + 1 < series.episodes.length) ? series.episodes[i + 1] : null;
    },

    prevEpisode: function (series, ep) {
      if (!series || !ep) return null;
      var i = series.episodes.indexOf(ep);
      return i > 0 ? series.episodes[i - 1] : null;
    },

    /* Поиск серии по видео без таймкода — для ручного перехода. */
    position: function (seriesId, episodeId) {
      var v = lsGet(LS.pos + seriesId + '/' + episodeId, '0');
      return Number(v) || 0;
    },
    savePosition: function (seriesId, episodeId, sec) {
      if (isFinite(sec) && sec > 3) lsSet(LS.pos + seriesId + '/' + episodeId, String(Math.floor(sec)));
    }
  };

  window.Refs = window.Refs || {};
  window.Refs.Store = Store;
  window.Refs.util = {
    uid: uid,
    fmtTime: fmtTime,
    parseTime: parseTime,
    isHttpUrl: isHttpUrl,
    normalize: normalize,
    normalizeNote: normalizeNote,
    normalizeEpisode: normalizeEpisode,
    normalizeSeries: normalizeSeries,
    lsGet: lsGet,
    lsSet: lsSet,
    LS: LS
  };
})();
