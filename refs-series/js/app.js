/* Публичная часть: каталог, серия, просмотр. */
(function () {
  'use strict';

  var Store = window.Refs.Store;
  var util = window.Refs.util;
  var P = window.Refs.player;

  var view = document.getElementById('view');
  var crumbs = document.getElementById('crumbs');
  var toggleBtn = document.getElementById('btn-notes');

  /* ---------------- иконки ---------------- */

  function svg(path, extra) {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + path + '</svg>';
  }
  var Icons = {
    play: svg('<path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/>'),
    pause: svg('<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>'),
    vol: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
    mute: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M16 9l5 6M21 9l-5 6"/>'),
    next: svg('<path d="M5 4l10 8-10 8z" fill="currentColor" stroke="none"/><path d="M19 4v16"/>'),
    fs: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    exitfs: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
    watch: svg('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>'),
    read: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5"/>'),
    listen: svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13" width="4" height="7" rx="1.5"/><rect x="17.5" y="13" width="4" height="7" rx="1.5"/>')
  };
  var KindLabel = { watch: 'Смотреть', read: 'Читать', listen: 'Слушать' };

  /* ---------------- роутинг ---------------- */

  function parseHash() {
    var h = (location.hash || '#/').replace(/^#/, '');
    var m1 = /^\/s\/([^/]+)\/e\/([^/]+)$/.exec(h);
    if (m1) return { page: 'watch', seriesId: decodeURIComponent(m1[1]), episodeId: decodeURIComponent(m1[2]) };
    var m2 = /^\/s\/([^/]+)$/.exec(h);
    if (m2) return { page: 'series', seriesId: decodeURIComponent(m2[1]) };
    return { page: 'catalog' };
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  /* ---------------- общие куски ---------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function setCrumbs(items) {
    crumbs.textContent = '';
    items.forEach(function (item, i) {
      if (i) crumbs.appendChild(el('span', 'sep', '/'));
      if (item.href) {
        var a = el('a', null, item.label);
        a.href = item.href;
        crumbs.appendChild(a);
      } else {
        crumbs.appendChild(el('span', 'current', item.label));
      }
    });
  }

  function safePoster(url) {
    return url && /^(https?:\/\/|\.{0,2}\/)/i.test(url) ? url : '';
  }

  function makeArt(poster, title) {
    var art = el('div', 'card-art');
    var img = safePoster(poster);
    if (img) {
      var im = el('img');
      im.src = img;
      im.alt = '';
      im.loading = 'lazy';
      im.onerror = function () { im.remove(); art.appendChild(el('div', 'placeholder', initials(title))); };
      art.appendChild(im);
    } else {
      art.appendChild(el('div', 'placeholder', initials(title)));
    }
    return art;
  }

  function initials(title) {
    var t = String(title || '?').trim();
    var parts = t.split(/\s+/).slice(0, 2);
    return parts.map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
  }

  /* ---------------- каталог ---------------- */

  function renderCatalog() {
    document.title = Store.data.site.title;
    setCrumbs([]);
    view.className = 'view';
    view.textContent = '';

    var h1 = el('h1', 'page-title', Store.data.site.title);
    var sub = el('p', 'page-sub', Store.data.site.subtitle || 'Сериалы с пояснениями отсылок');
    view.appendChild(h1);
    view.appendChild(sub);

    var series = Store.data.series || [];
    if (!series.length) {
      var empty = el('div', 'empty-state', 'Пока нет ни одного сериала. Добавьте его в админке и опубликуйте.');
      view.appendChild(empty);
      return;
    }

    var grid = el('div', 'catalog-grid');
    series.forEach(function (s) {
      var a = el('a', 'card');
      a.href = '#/s/' + encodeURIComponent(s.id);
      a.appendChild(makeArt(s.poster, s.title));
      var body = el('div', 'card-body');
      body.appendChild(el('div', 'card-title', s.title));
      var notes = s.episodes.reduce(function (n, e) { return n + e.notes.length; }, 0);
      body.appendChild(el('div', 'card-meta',
        s.episodes.length + ' ' + plural(s.episodes.length, 'серия', 'серии', 'серий') + ' · ' +
        notes + ' ' + plural(notes, 'отсылка', 'отсылки', 'отсылок')));
      if (s.description) body.appendChild(el('div', 'card-desc', s.description));
      a.appendChild(body);
      grid.appendChild(a);
    });
    view.appendChild(grid);
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  /* ---------------- страница сериала ---------------- */

  function renderSeries(seriesId) {
    var s = Store.series(seriesId);
    if (!s) return renderNotFound();

    document.title = s.title + ' — ' + Store.data.site.title;
    setCrumbs([{ label: Store.data.site.title, href: '#/' }, { label: s.title }]);
    view.className = 'view';
    view.textContent = '';

    var head = el('div', 'series-head');
    if (s.poster) {
      var poster = el('div', 'series-poster');
      var im = el('img');
      im.src = s.poster;
      im.alt = '';
      poster.appendChild(im);
      head.appendChild(poster);
    }
    var info = el('div', 'series-info');
    info.appendChild(el('h1', 'page-title', s.title));
    if (s.description) info.appendChild(el('p', 'page-sub', s.description));
    head.appendChild(info);
    view.appendChild(head);

    view.appendChild(el('h2', 'section-title', 'Серии'));
    var list = el('ul', 'episode-list');
    s.episodes.forEach(function (e) {
      var li = el('li');
      var a = el('a', 'episode-row');
      a.href = '#/s/' + encodeURIComponent(s.id) + '/e/' + encodeURIComponent(e.id);
      a.appendChild(el('span', 'episode-num', String(e.number)));
      var main = el('div', 'episode-main');
      main.appendChild(el('div', 'episode-title', e.title || ('Серия ' + e.number)));
      if (e.description) main.appendChild(el('div', 'episode-sub', e.description));
      a.appendChild(main);

      var badge = el('span', 'episode-badge', e.notes.length + ' ' + plural(e.notes.length, 'отсылка', 'отсылки', 'отсылок'));
      a.appendChild(badge);
      if (e.video.kind === 'embed') {
        var w = el('span', 'episode-badge warn', 'без синхронных пояснений');
        a.appendChild(w);
      }
      li.appendChild(a);
      list.appendChild(li);
    });
    view.appendChild(list);
  }

  /* ---------------- просмотр ---------------- */

  var live = null; // текущий экземпляр плеера — чтобы корректно снимать обработчики

  function renderWatch(seriesId, episodeId) {
    var s = Store.series(seriesId);
    var ep = Store.episode(seriesId, episodeId);
    if (!s || !ep) return renderNotFound();

    var next = Store.nextEpisode(s, ep);
    var prev = Store.prevEpisode(s, ep);

    /* раскрытые спойлеры для этого показа страницы (сбрасываются при навигации) */
    var revealed = {};

    document.title = (ep.title || 'Серия ' + ep.number) + ' — ' + s.title;
    setCrumbs([
      { label: Store.data.site.title, href: '#/' },
      { label: s.title, href: '#/s/' + encodeURIComponent(s.id) },
      { label: ep.title || 'Серия ' + ep.number }
    ]);

    view.className = 'view';
    view.textContent = '';

    var layout = el('div', 'watch-layout');

    var head = el('div', 'ep-head');
    var headMain = el('div');
    headMain.appendChild(el('h1', null, ep.title || ('Серия ' + ep.number)));
    var meta = 'Серия ' + ep.number + ' · ' + s.title;
    if (ep.description) meta += ' · ' + ep.description;
    headMain.appendChild(el('div', 'meta', meta));
    head.appendChild(headMain);

    var epNav = el('div', 'admin-actions');
    if (prev) {
      var pb = el('a', 'btn', '← Предыдущая');
      pb.href = '#/s/' + encodeURIComponent(s.id) + '/e/' + encodeURIComponent(prev.id);
      epNav.appendChild(pb);
    }
    if (next) {
      var nb = el('a', 'btn primary', 'Следующая →');
      nb.href = '#/s/' + encodeURIComponent(s.id) + '/e/' + encodeURIComponent(next.id);
      epNav.appendChild(nb);
    }
    head.appendChild(epNav);
    layout.appendChild(head);

    /* --- плеер --- */

    var shell = el('div', 'player-shell');
    var frame = el('div', 'player-frame');
    var stage = el('div', 'player-stage');
    stage.style.cssText = 'position:absolute;inset:0;z-index:1';
    var hit = el('div', 'player-hit');
    hit.title = 'Плей / пауза';

    var overlay = el('div', 'note-overlay');
    var bubble = el('div', 'note-bubble');
    overlay.appendChild(bubble);

    frame.appendChild(stage);
    frame.appendChild(hit);
    frame.appendChild(overlay);
    shell.appendChild(frame);

    var controls = el('div', 'player-controls');
    shell.appendChild(controls);
    layout.appendChild(shell);

    /* --- контролы --- */

    var btnPlay = el('button', 'pc-btn play');
    btnPlay.type = 'button';
    btnPlay.innerHTML = Icons.play;
    btnPlay.setAttribute('aria-label', 'Плей');
    controls.appendChild(btnPlay);

    var scrub = el('input');
    scrub.type = 'range';
    scrub.min = '0';
    scrub.max = '1000';
    scrub.value = '0';
    scrub.step = '1';
    scrub.setAttribute('aria-label', 'Позиция в видео');
    var scrubWrap = el('div', 'pc-scrub');
    scrubWrap.appendChild(scrub);
    controls.appendChild(scrubWrap);

    var time = el('div', 'pc-time', '0:00 / 0:00');
    controls.appendChild(time);

    var btnMute = el('button', 'pc-btn');
    btnMute.type = 'button';
    btnMute.innerHTML = Icons.vol;
    btnMute.setAttribute('aria-label', 'Звук');
    controls.appendChild(btnMute);

    var volWrap = el('div', 'pc-volume');
    var vol = el('input');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '100';
    vol.step = '1';
    vol.setAttribute('aria-label', 'Громкость');
    volWrap.appendChild(vol);
    var volNum = el('span', 'pc-vol-num', '100');
    volWrap.appendChild(volNum);
    controls.appendChild(volWrap);

    var btnNext = el('button', 'pc-btn pc-next');
    btnNext.type = 'button';
    btnNext.innerHTML = Icons.next + '<span>Следующая</span>';
    btnNext.setAttribute('aria-label', 'Следующая серия');
    if (!next) { btnNext.disabled = true; btnNext.title = 'Это последняя серия'; }
    controls.appendChild(btnNext);

    var btnFs = el('button', 'pc-btn');
    btnFs.type = 'button';
    btnFs.innerHTML = Icons.fs;
    btnFs.setAttribute('aria-label', 'На весь экран');
    controls.appendChild(btnFs);

    /* --- статус / подсказки --- */

    var statusLine = el('div', 'notice', '');
    statusLine.hidden = true;
    layout.appendChild(statusLine);

    if (ep.video.kind === 'embed') {
      var warn = el('div', 'notice warn',
        'Это встроенный плеер без документированного API: сайт не знает текущий таймкод, поэтому всплывающие пояснения и громкость недоступны. Список отсылок ниже работает — таймкоды открывают ссылку с нужным временем, если хостинг это поддерживает.');
      layout.appendChild(warn);
    }

    /* --- список отсылок --- */

    var panel = el('div', 'notes-panel');
    var pHead = el('div', 'notes-head');
    pHead.appendChild(el('h2', null, 'Отсылки (' + ep.notes.length + ')'));
    var hintText = ep.video.kind === 'embed'
      ? 'Нажмите таймкод, чтобы перейти'
      : 'Нажмите таймкод, чтобы перемотать · [ и ] — прошлая/следующая';
    pHead.appendChild(el('span', 'hint', hintText));
    panel.appendChild(pHead);

    var noteList = el('ul', 'notes-list');
    var noteEls = {};
    if (!ep.notes.length) {
      panel.appendChild(el('div', 'empty-state', 'Пояснений пока нет.'));
    } else {
      ep.notes.slice().sort(function (a, b) { return a.t - b.t; }).forEach(function (n) {
        var li = el('li', 'note-item');
        li.id = 'note-' + n.id;

        var tc = el('button', 'note-tc', util.fmtTime(n.t));
        tc.type = 'button';
        tc.title = 'Перейти к ' + util.fmtTime(n.t);
        if (ep.video.kind === 'embed') tc.disabled = false;
        tc.addEventListener('click', function () { jumpTo(n); });
        li.appendChild(tc);

        var body = el('div', 'note-body');
        if (n.title) body.appendChild(el('div', 'note-title', n.title));

        var textBox = el('div', 'note-text', n.text || '');
        if (n.spoiler) {
          var wrap = el('div', 'spoiler-box');
          wrap.appendChild(textBox);
          var veil = el('div', 'spoiler-veil', 'Спойлер — нажмите, чтобы показать');
          veil.addEventListener('click', function () {
            wrap.classList.add('revealed');
            revealed[n.id] = true;
          });
          wrap.appendChild(veil);
          if (revealed[n.id]) wrap.classList.add('revealed');
          body.appendChild(wrap);
        } else {
          body.appendChild(textBox);
        }

        if (n.links.length) {
          var links = el('div', 'note-links');
          n.links.forEach(function (l) {
            if (!util.isHttpUrl(l.url)) return;
            var a = el('a', 'link-chip');
            a.href = l.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer nofollow';
            var kind = el('span', 'kind');
            kind.innerHTML = Icons[l.kind] || Icons.watch;
            a.appendChild(kind);
            a.appendChild(document.createTextNode(l.label || KindLabel[l.kind] || 'Ссылка'));
            a.title = KindLabel[l.kind] + ': ' + l.url;
            links.appendChild(a);
          });
          if (links.children.length) body.appendChild(links);
        }

        li.appendChild(body);
        noteList.appendChild(li);
        noteEls[n.id] = li;
      });
      panel.appendChild(noteList);
    }
    layout.appendChild(panel);

    /* --- ссылка назад --- */
    var back = el('div', 'notice');
    var backA = el('a', null, '← Все серии «' + s.title + '»');
    backA.href = '#/s/' + encodeURIComponent(s.id);
    back.appendChild(backA);
    layout.appendChild(back);

    view.appendChild(layout);

    /* --- запуск плеера --- */

    var state = {
      notesOn: util.lsGet(util.LS.notesOn, '1') === '1',
      autoNext: util.lsGet(util.LS.autonext, '1') === '1',
      volume: clamp(parseFloat(util.lsGet(util.LS.volume, '1')), 0, 1),
      duration: 0,
      current: 0,
      shownId: null,
      scrubbing: false,
      resume: Store.position(s.id, ep.id)
    };
    if (!isFinite(state.volume)) state.volume = 1;

    toggleBtn.textContent = 'Пояснения: ' + (state.notesOn ? 'вкл' : 'выкл');
    toggleBtn.setAttribute('aria-pressed', state.notesOn ? 'true' : 'false');

    var adapter = P.create(stage, ep.video, {
      volume: state.volume,
      resume: state.resume > 15 ? state.resume : 0,
      poster: ''
    });

    shell.classList.toggle('no-hit', !adapter.supportsControl);
    if (!adapter.supportsControl) {
      controls.hidden = true;
      // отсылки всё ещё работают — только без перемотки внутри плеера
    }

    /* если это embed, таймкод — не перемотка, а ссылка с временем */
    function jumpTo(n) {
      if (ep.video.kind === 'embed') {
        var url = P.embedUrlAtTime(ep.video.ref, n.t);
        window.open(url, '_blank', 'noopener');
        return;
      }
      if (!adapter.supportsControl) return;
      adapter.seek(n.t);
      adapter.play();
      showNote(n, true);
      markActive(n.id);
    }

    var revealed = {};

    function showNote(n, force) {
      if (!n) { hideBubble(); return; }
      if (!state.notesOn && !force) { hideBubble(); return; }
      state.shownId = n.id;
      bubble.textContent = '';
      var kicker = el('div', 'nb-kicker');
      kicker.appendChild(document.createTextNode('Отсылка'));
      kicker.appendChild(el('span', 'tc', util.fmtTime(n.t)));
      bubble.appendChild(kicker);
      if (n.title) bubble.appendChild(el('div', 'nb-title', n.title));
      var textEl = el('div', 'nb-text', n.text || '');
      if (n.spoiler && !revealed[n.id]) {
        textEl.textContent = '';
        textEl.appendChild(el('span', 'nb-more', 'Спойлер — нажмите, чтобы показать'));
        bubble.appendChild(textEl);
        bubble.style.cursor = 'pointer';
        bubble.onclick = function (ev) {
          if (ev.target.closest('a')) return;
          revealed[n.id] = true;
          var li = noteEls[n.id];
          if (li) li.classList.add('active');
          showNote(n, true);
        };
      } else {
        bubble.style.cursor = '';
        bubble.onclick = null;
        bubble.appendChild(textEl);
        if (n.links.length) {
          var row = el('div', 'nb-links');
          n.links.forEach(function (l) {
            if (!util.isHttpUrl(l.url)) return;
            var a = el('a');
            a.href = l.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer nofollow';
            a.innerHTML = Icons[l.kind] || Icons.watch;
            a.appendChild(document.createTextNode(l.label || KindLabel[l.kind]));
            row.appendChild(a);
          });
          if (row.children.length) bubble.appendChild(row);
        }
      }
      bubble.classList.add('show');
      var li2 = noteEls[n.id];
      if (li2 && !state.scrubbing) li2.classList.add('active');
    }

    function hideBubble() {
      bubble.classList.remove('show');
      state.shownId = null;
      Object.keys(noteEls).forEach(function (k) { noteEls[k].classList.remove('active'); });
    }

    function markActive(id) {
      Object.keys(noteEls).forEach(function (k) {
        noteEls[k].classList.toggle('active', k === id);
      });
      var li = noteEls[id];
      if (li && typeof li.scrollIntoView === 'function') {
        li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }

    /* --- обновление интерфейса от плеера --- */

    function updatePlayIcon(playing) {
      btnPlay.innerHTML = playing ? Icons.pause : Icons.play;
      btnPlay.setAttribute('aria-label', playing ? 'Пауза' : 'Плей');
    }

    adapter.on('ready', function () {
      statusLine.classList.remove('warn');
      statusLine.hidden = true;
      updatePlayIcon(!adapter.isPaused());
      var d = adapter.getDuration();
      if (d) { state.duration = d; }
      applyVolume(state.volume, false);
      if (state.resume > 15 && state.duration && state.resume < state.duration - 20) {
        showResume(state.resume);
      }
    });

    adapter.on('duration', function (d) {
      if (d && isFinite(d)) {
        state.duration = d;
        paintTime(state.current, d);
      }
    });

    adapter.on('state', function (s) {
      updatePlayIcon(!!s.playing);
      if (s.playing) statusLine.hidden = true;
    });

    adapter.on('time', function (p) {
      state.current = p.t || 0;
      if (p.duration && isFinite(p.duration)) state.duration = p.duration;
      paintTime(state.current, state.duration);
      if (!state.scrubbing) syncActive();
      maybeSavePosition();
    });

    adapter.on('ended', function () {
      updatePlayIcon(false);
      Store.savePosition(s.id, ep.id, 0);
      if (state.autoNext && next) {
        location.hash = '#/s/' + encodeURIComponent(s.id) + '/e/' + encodeURIComponent(next.id);
      } else {
        statusLine.hidden = false;
        statusLine.textContent = next ? 'Серия закончилась. Нажмите «Следующая», чтобы продолжить.' : 'Это была последняя серия.';
      }
    });

    adapter.on('error', function (err) {
      statusLine.hidden = false;
      statusLine.className = 'notice warn';
      statusLine.textContent = (err && err.message) || 'Ошибка видео.';
    });

    function paintTime(cur, dur) {
      time.textContent = util.fmtTime(cur) + ' / ' + util.fmtTime(dur || 0);
      if (!state.scrubbing) {
        var max = dur || 0;
        scrub.disabled = !max;
        scrub.value = max ? String(Math.round((cur / max) * 1000)) : '0';
      }
    }

    function syncActive() {
      if (!state.notesOn) { hideBubble(); return; }
      var t = state.current;
      var active = null;
      var sorted = ep.notes;
      for (var i = 0; i < sorted.length; i++) {
        var n = sorted[i];
        if (t >= n.t - 0.15 && t < n.t + n.dur) active = n;
      }
      if (active) {
        if (state.shownId !== active.id) showNote(active);
      } else if (state.shownId) {
        hideBubble();
      }
    }

    var saveTick = 0;
    function maybeSavePosition() {
      var now = Date.now();
      if (now - saveTick < 5000) return;
      saveTick = now;
      Store.savePosition(s.id, ep.id, state.current);
    }

    function showResume(sec) {
      if (statusLine.dataset.resume) return;
      statusLine.dataset.resume = '1';
      statusLine.hidden = false;
      statusLine.classList.remove('warn');
      statusLine.textContent = 'Продолжаем с ' + util.fmtTime(sec) + '. ';
      var b = el('button', 'ghost', 'Смотреть сначала');
      b.type = 'button';
      b.style.marginLeft = '8px';
      b.addEventListener('click', function () {
        adapter.seek(0);
        statusLine.hidden = true;
      });
      statusLine.appendChild(b);
    }

    /* --- контролы: обработчики --- */

    function togglePlay() {
      if (!adapter.supportsControl) return;
      if (adapter.isPaused()) adapter.play(); else adapter.pause();
    }

    btnPlay.addEventListener('click', togglePlay);
    hit.addEventListener('click', togglePlay);
    frame.addEventListener('click', function (ev) {
      if (ev.target === frame) togglePlay();
    });

    scrub.addEventListener('input', function () {
      state.scrubbing = true;
      var d = state.duration || 0;
      var sec = d ? (Number(scrub.value) / 1000) * d : 0;
      time.textContent = util.fmtTime(sec) + ' / ' + util.fmtTime(d);
    });
    scrub.addEventListener('change', function () {
      var d = state.duration || 0;
      var sec = d ? (Number(scrub.value) / 1000) * d : 0;
      adapter.seek(sec);
      state.scrubbing = false;
      state.current = sec;
    });

    vol.addEventListener('input', function () {
      var v = Number(vol.value) / 100;
      applyVolume(v);
    });

    btnMute.addEventListener('click', function () {
      var v = Number(vol.value) > 0 ? 0 : (Number(util.lsGet(util.LS.volume, '1')) || 0.8);
      if (v === 0) v = 0.8;
      vol.value = String(Math.round(v * 100));
      applyVolume(v);
    });

    function applyVolume(v, silent) {
      state.volume = clamp(v, 0, 1);
      if (!silent) {
        adapter.setVolume(state.volume);
        adapter.mute(state.volume === 0);
      }
      vol.value = String(Math.round(state.volume * 100));
      volNum.textContent = String(Math.round(state.volume * 100));
      btnMute.innerHTML = state.volume === 0 ? Icons.mute : Icons.vol;
      util.lsSet(util.LS.volume, String(state.volume));
    }

    btnNext.addEventListener('click', function () {
      if (!next) return;
      location.hash = '#/s/' + encodeURIComponent(s.id) + '/e/' + encodeURIComponent(next.id);
    });

    btnFs.addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (shell.requestFullscreen) shell.requestFullscreen();
    });
    document.addEventListener('fullscreenchange', onFsChange);
    function onFsChange() {
      btnFs.innerHTML = document.fullscreenElement ? Icons.exitfs : Icons.fs;
      btnFs.setAttribute('aria-label', document.fullscreenElement ? 'Выйти из полноэкранного режима' : 'На весь экран');
    }

    function onKey(ev) {
      var tag = (ev.target && ev.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

      if (ev.code === 'Space' || ev.key === ' ') {
        ev.preventDefault();
        togglePlay();
      } else if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        adapter.seek(adapter.getTime() + 5);
      } else if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        adapter.seek(Math.max(0, adapter.getTime() - 5));
      } else if (ev.key === 'f' || ev.key === 'F' || ev.key === 'а' || ev.key === 'А') {
        btnFs.click();
      } else if (ev.key === 'm' || ev.key === 'M' || ev.key === 'ь' || ev.key === 'Ь') {
        btnMute.click();
      } else if (ev.key === ']' || ev.key === '[') {
        stepNote(ev.key === ']' ? 1 : -1);
      }
    }

    function stepNote(dir) {
      var sorted = ep.notes.slice().sort(function (a, b) { return a.t - b.t; });
      if (!sorted.length) return;
      var t = state.current;
      var target = null;
      if (dir > 0) {
        target = sorted.filter(function (n) { return n.t > t + 0.5; })[0] || sorted[0];
      } else {
        var before = sorted.filter(function (n) { return n.t < t - 1; });
        target = before[before.length - 1] || sorted[sorted.length - 1];
      }
      if (target) jumpTo(target);
    }

    document.addEventListener('keydown', onKey);

    toggleBtn.onclick = function () {
      state.notesOn = !state.notesOn;
      util.lsSet(util.LS.notesOn, state.notesOn ? '1' : '0');
      toggleBtn.textContent = 'Пояснения: ' + (state.notesOn ? 'вкл' : 'выкл');
      toggleBtn.setAttribute('aria-pressed', state.notesOn ? 'true' : 'false');
      if (!state.notesOn) hideBubble();
      else syncActive();
    };

    /* --- уборка при смене страницы --- */

    live = {
      destroy: function () {
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('fullscreenchange', onFsChange);
        Store.savePosition(s.id, ep.id, state.current);
        adapter.destroy();
        toggleBtn.onclick = null;
      }
    };

    applyVolume(state.volume, true);
    paintTime(0, 0);
  }

  function clamp(v, lo, hi) {
    if (!isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, v));
  }

  function renderNotFound() {
    document.title = 'Не найдено';
    setCrumbs([{ label: Store.data.site.title, href: '#/' }, { label: 'Не найдено' }]);
    view.className = 'view';
    view.textContent = '';
    view.appendChild(el('h1', 'page-title', 'Страница не найдена'));
    view.appendChild(el('p', 'page-sub', 'Такого сериала или серии нет. Возможно, ссылка устарела.'));
    var a = el('a', 'btn primary', 'На главную');
    a.href = '#/';
    view.appendChild(a);
  }

  /* ---------------- рендер ---------------- */

  function render() {
    if (live) { try { live.destroy(); } catch (e) {} live = null; }
    var r = parseHash();
    if (r.page === 'watch') renderWatch(r.seriesId, r.episodeId);
    else if (r.page === 'series') renderSeries(r.seriesId);
    else renderCatalog();
    window.scrollTo({ top: 0 });
  }

  /* ---------------- старт ---------------- */

  Store.load().then(function () {
    var s = Store.data.site;
    document.getElementById('brand-text').textContent = s.title;
    document.getElementById('footer-text').textContent = s.subtitle || s.title;
    if (Store.source === 'seed') {
      document.getElementById('preview-banner').hidden = false;
    }
    window.addEventListener('hashchange', render);
    render();
  });
})();
