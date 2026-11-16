/* Админка: правит data/data.json, публикует его в GitHub.
   Черновик всегда лежит в localStorage, публикация — отдельное действие. */
(function () {
  'use strict';

  var util = window.Refs.util;
  var GH = window.Refs.github;
  var P = window.Refs.player;
  var Store = window.Refs.Store;

  var view = document.getElementById('view');
  var syncStatus = document.getElementById('sync-status');
  var adminCrumb = document.getElementById('admin-crumb');

  var DRAFT_KEY = 'refs.draft';
  var EMPTY_DATA = {
    site: { title: 'Отсылки', subtitle: 'Сериалы с пояснением отсылок' },
    series: []
  };

  var state = {
    cfg: null,
    data: null,
    sha: null,
    selSeries: null,
    selEpisode: null,
    selNote: null,
    dirty: false,
    adapter: null,
    previewNote: null,
    draftAt: null
  };

  /* ---------------- helpers ---------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function svg(path, extra) {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + path + '</svg>';
  }
  var Icons = {
    play: svg('<path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/>'),
    pause: svg('<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    trash: svg('<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>'),
    up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    upload: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3h16v-3"/>')
  };

  function field(labelText, node, help) {
    var f = el('div', 'field');
    var lab = el('label', null, labelText);
    f.appendChild(lab);
    f.appendChild(node);
    if (help) f.appendChild(el('div', 'help', help));
    return f;
  }

  function input(value, placeholder, type) {
    var i = el('input', 'input');
    i.type = type || 'text';
    i.value = value == null ? '' : value;
    if (placeholder) i.placeholder = placeholder;
    return i;
  }

  function textarea(value, placeholder, rows) {
    var t = el('textarea', 'input');
    t.value = value == null ? '' : value;
    if (placeholder) t.placeholder = placeholder;
    if (rows) t.rows = rows;
    return t;
  }

  function select(options, value) {
    var s = el('select', 'input');
    options.forEach(function (o) {
      var opt = el('option', null, o.label);
      opt.value = o.value;
      if (o.value === value) opt.selected = true;
      s.appendChild(opt);
    });
    return s;
  }

  function button(label, cls, onClick, icon) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    if (icon) b.innerHTML = icon;
    b.appendChild(document.createTextNode(label));
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function miniBtn(html, title, onClick, cls) {
    var b = el('button', 'mini-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.innerHTML = html;
    b.title = title || '';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function setStatus(text, kind) {
    syncStatus.textContent = text;
    syncStatus.className = 'status' + (kind ? ' ' + kind : '');
  }

  function markDirty() {
    state.dirty = true;
    if (state.cfg) setStatus('есть неопубликованные правки', '');
    saveDraft();
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        data: state.data,
        sha: state.sha,
        at: Date.now()
      }));
      state.draftAt = Date.now();
    } catch (e) {
      setStatus('черновик не сохранился: ' + e.message, 'err');
    }
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !d.data) return null;
      return d;
    } catch (e) { return null; }
  }

  /* ---------------- вход ---------------- */

  function renderLogin(reason) {
    view.className = 'view narrow';
    view.textContent = '';

    var box = el('div', 'login-box');
    var panel = el('div', 'panel');
    var head = el('div', 'panel-head');
    head.appendChild(el('h2', null, 'Подключение к GitHub'));
    panel.appendChild(head);
    var body = el('div', 'panel-body');

    body.appendChild(el('p', 'small muted',
      'Сайт статический, поэтому контент хранится в репозитории. Введите параметры и токен — ' +
      'дальше админка будет читать и сохранять data/data.json прямо в ваш репозиторий.'));

    if (reason) {
      var r = el('div', 'status err', reason);
      r.style.marginBottom = '14px';
      body.appendChild(r);
    }

    var saved = state.cfg || GH.cfg() || {};
    var fOwner = input(saved.owner || '', 'ваш логин на GitHub');
    var fRepo = input(saved.repo || '', 'refs-series');
    var fBranch = input(saved.branch || 'main', 'main');
    var fPath = input(saved.path || 'data/data.json', 'data/data.json');
    var fToken = input(saved.token || '', 'github_pat_...', 'password');

    body.appendChild(field('Владелец репозитория', fOwner));
    body.appendChild(field('Репозиторий', fRepo));
    body.appendChild(field('Ветка', fBranch));
    body.appendChild(field('Путь к файлу данных', fPath, 'Обычно data/data.json'));
    body.appendChild(field('Токен (fine-grained, Contents: Read and write)', fToken,
      'Токен остаётся в этом браузере. Не вставляйте его на чужом компьютере.'));

    var row = el('div', 'admin-actions');
    var btnConnect = button('Подключиться', 'primary', function () { connect(fOwner, fRepo, fBranch, fPath, fToken); });
    var btnLocal = button('Без GitHub (локально)', '', function () {
      GH.clearCfg();
      state.cfg = null;
      state.data = util.normalize(EMPTY_DATA);
      state.sha = null;
      state.selSeries = null;
      state.selEpisode = null;
      renderShell();
      setStatus('локальный режим: публикация недоступна', '');
    });
    row.appendChild(btnConnect);
    row.appendChild(btnLocal);
    body.appendChild(row);

    var draft = loadDraft();
    if (draft && draft.data) {
      var drow = el('div', 'admin-actions');
      drow.style.marginTop = '14px';
      drow.appendChild(el('span', 'small muted', 'Есть черновик от ' + new Date(draft.at).toLocaleString() + '. '));
      drow.appendChild(button('Восстановить черновик', '', function () {
        state.data = util.normalize(draft.data);
        state.sha = draft.sha || null;
        renderShell();
        markDirty();
        setStatus('восстановлен черновик', '');
      }));
      body.appendChild(drow);
    }

    panel.appendChild(body);
    box.appendChild(panel);

    var help = el('div', 'panel');
    var hh = el('div', 'panel-head');
    hh.appendChild(el('h2', null, 'Где взять параметры'));
    help.appendChild(hh);
    var hb = el('div', 'panel-body');
    hb.innerHTML =
      '<ol class="small" style="margin:0;padding-left:18px;line-height:1.7">' +
      '<li>Создайте публичный репозиторий на GitHub и загрузите в него файлы сайта.</li>' +
      '<li>Settings → Pages → Source: <b>Deploy from a branch</b>, ветка <code>main</code>, папка <code>/ (root)</code>.</li>' +
      '<li>Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b>.</li>' +
      '<li>Repository access: только этот репозиторий. Permissions → Contents: <b>Read and write</b>.</li>' +
      '<li>Скопируйте токен сюда. Он даёт доступ только к этому репозиторию и только к файлам.</li>' +
      '</ol>';
    help.appendChild(hb);
    box.appendChild(help);

    view.appendChild(box);
    adminCrumb.textContent = 'Подключение';
    fToken.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') btnConnect.click();
    });
    fOwner.focus();
  }

  function connect(fOwner, fRepo, fBranch, fPath, fToken) {
    var cfg = {
      owner: fOwner.value.trim(),
      repo: fRepo.value.trim(),
      branch: fBranch.value.trim() || 'main',
      path: fPath.value.trim() || 'data/data.json',
      token: fToken.value.trim()
    };
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      setStatus('заполните владельца, репозиторий и токен', 'err');
      return;
    }
    state.cfg = cfg;
    setStatus('проверяю доступ…', '');
    GH.test(cfg).then(function (info) {
      GH.saveCfg(cfg);
      state.repoInfo = info;
      setStatus('подключено: ' + info.fullName, 'ok');
      return loadRemote();
    }).catch(function (err) {
      state.cfg = null;
      renderLogin(err.message);
    });
  }

  function loadRemote() {
    setStatus('читаю ' + state.cfg.path + '…', '');
    return GH.get(state.cfg, state.cfg.path).then(function (file) {
      if (!file) {
        state.data = util.normalize(EMPTY_DATA);
        state.sha = null;
        setStatus('файл ещё не создан — первая публикация его создаст', '');
      } else {
        var json;
        try { json = JSON.parse(file.text); }
        catch (e) { throw new Error('data.json в репозитории — битый JSON: ' + e.message); }
        state.data = util.normalize(json);
        state.sha = file.sha;
        setStatus('загружено с GitHub', 'ok');
      }
      state.selSeries = state.data.series[0] ? state.data.series[0].id : null;
      state.selEpisode = null;
      state.dirty = false;
      renderShell();
      return state.data;
    }).catch(function (err) {
      setStatus(err.message, 'err');
      renderLogin(err.message);
    });
  }

  /* ---------------- каркас редактора ---------------- */

  function curSeries() {
    return (state.data.series || []).filter(function (s) { return s.id === state.selSeries; })[0] || null;
  }
  function curEpisode() {
    var s = curSeries();
    if (!s) return null;
    return s.episodes.filter(function (e) { return e.id === state.selEpisode; })[0] || null;
  }

  function renderShell() {
    destroyPlayer();
    view.className = 'view';
    view.textContent = '';

    var grid = el('div', 'admin-grid');
    grid.appendChild(renderTree());
    grid.appendChild(renderMain());
    view.appendChild(grid);

    adminCrumb.textContent = state.data.site.title || 'Редактор';
    if (!state.cfg) setStatus('локальный режим: сохранение только в браузер', '');
    else if (state.dirty) setStatus('есть неопубликованные правки', '');
    else setStatus('синхронизировано', 'ok');
  }

  function renderTree() {
    var panel = el('div', 'panel');
    var head = el('div', 'panel-head');
    head.appendChild(el('h2', null, 'Содержание'));
    var addBtn = miniBtn('+ сериал', 'Добавить сериал', function () {
      var s = util.normalizeSeries({ title: 'Новый сериал' });
      state.data.series.push(s);
      state.selSeries = s.id;
      state.selEpisode = null;
      state.selNote = null;
      markDirty();
      renderShell();
    });
    head.appendChild(addBtn);
    panel.appendChild(head);

    var ul = el('ul', 'tree');
    if (!state.data.series.length) {
      panel.appendChild(el('div', 'empty-state', 'Сериалов пока нет. Нажмите «+ сериал».'));
      return panel;
    }

    state.data.series.forEach(function (s) {
      var li = el('li', 'tree-group');
      var row = el('div', 'tree-series' + (s.id === state.selSeries ? ' sel' : ''));
      row.appendChild(el('span', null, s.title || 'Без названия'));
      row.addEventListener('click', function () {
        state.selSeries = s.id;
        state.selEpisode = null;
        state.selNote = null;
        renderShell();
      });
      li.appendChild(row);

      var eps = el('ul', 'tree-episodes');
      s.episodes.forEach(function (e) {
        var er = el('li', 'tree-ep' + (e.id === state.selEpisode ? ' sel' : ''));
        er.appendChild(el('span', 'n', String(e.number)));
        er.appendChild(el('span', null, e.title || ('Серия ' + e.number)));
        er.addEventListener('click', function (ev) {
          ev.stopPropagation();
          state.selSeries = s.id;
          state.selEpisode = e.id;
          state.selNote = null;
          renderShell();
        });
        eps.appendChild(er);
      });
      if (!s.episodes.length) {
        var empty = el('li', 'tree-ep');
        empty.appendChild(el('span', 'muted', 'нет серий'));
        eps.appendChild(empty);
      }
      li.appendChild(eps);
      ul.appendChild(li);
    });
    panel.appendChild(ul);

    var foot = el('div', 'panel-body');
    var row = el('div', 'admin-actions');
    row.appendChild(button('Сохранить черновик', '', function () {
      saveDraft();
      setStatus('черновик сохранён ' + new Date().toLocaleTimeString(), 'ok');
    }));
    row.appendChild(button('Опубликовать', 'primary', publish));
    foot.appendChild(row);

    var row2 = el('div', 'admin-actions');
    row2.style.marginTop = '8px';
    row2.appendChild(button('Забыть токен', 'danger', function () {
      if (!confirm('Удалить параметры GitHub из этого браузера?')) return;
      GH.clearCfg();
      state.cfg = null;
      renderLogin(null);
    }));
    foot.appendChild(row2);

    var row3 = el('div', 'admin-actions');
    row3.style.marginTop = '8px';
    row3.appendChild(button('Скачать data.json', '', downloadData));
    foot.appendChild(row3);
    foot.appendChild(el('div', 'help',
      'Пригодится, если публиковать вручную: скачайте файл и замените им data/data.json в репозитории.'));

    foot.appendChild(buildStorageInfo());

    if (state.repoInfo && state.repoInfo.pagesUrl) {
      var a = el('a', 'small', 'Открыть опубликованный сайт →');
      a.href = state.repoInfo.pagesUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.display = 'inline-block';
      a.style.marginTop = '10px';
      foot.appendChild(a);
    }
    panel.appendChild(foot);
    return panel;
  }

  function renderMain() {
    var wrap = el('div');
    var s = curSeries();

    if (!s) {
      var p = el('div', 'panel');
      var b = el('div', 'panel-body');
      b.appendChild(el('p', 'muted', 'Выберите сериал слева или создайте новый.'));
      p.appendChild(b);
      wrap.appendChild(p);
      return wrap;
    }

    wrap.appendChild(renderSeriesPanel(s));
    var ep = curEpisode();
    if (ep) wrap.appendChild(renderEpisodePanel(s, ep));
    else wrap.appendChild(renderEpisodeListPanel(s));
    return wrap;
  }

  function renderSeriesPanel(s) {
    var panel = el('div', 'panel');
    var head = el('div', 'panel-head');
    head.appendChild(el('h2', null, 'Сериал'));
    var tools = el('div', 'admin-actions');
    tools.appendChild(miniBtn(Icons.trash, 'Удалить сериал', function () {
      if (!confirm('Удалить сериал «' + (s.title || '') + '» со всеми сериями?')) return;
      state.data.series = state.data.series.filter(function (x) { return x.id !== s.id; });
      state.selSeries = state.data.series[0] ? state.data.series[0].id : null;
      state.selEpisode = null;
      markDirty();
      renderShell();
    }, 'danger'));
    head.appendChild(tools);
    panel.appendChild(head);

    var body = el('div', 'panel-body');

    var fTitle = input(s.title, 'Название сериала');
    fTitle.addEventListener('input', function () {
      s.title = fTitle.value;
      markDirty();
      updateTreeTitle(s.title);
    });
    body.appendChild(field('Название', fTitle));

    var fPoster = input(s.poster, 'https://... или videos/poster.jpg');
    fPoster.addEventListener('input', function () { s.poster = fPoster.value.trim(); markDirty(); });
    body.appendChild(field('Постер (URL)', fPoster, 'Необязательно. Ссылка на картинку 16:9.'));

    var fDesc = textarea(s.description, 'О чём сериал', 2);
    fDesc.addEventListener('input', function () { s.description = fDesc.value; markDirty(); });
    body.appendChild(field('Описание', fDesc));

    var actions = el('div', 'admin-actions');
    actions.appendChild(button('+ Серия', '', function () {
      var nums = s.episodes.map(function (e) { return e.number; });
      var next = nums.length ? Math.max.apply(null, nums) + 1 : 1;
      var e = util.normalizeEpisode({ number: next, title: 'Серия ' + next, video: { kind: 'youtube', ref: '' } });
      s.episodes.push(e);
      state.selEpisode = e.id;
      state.selNote = null;
      markDirty();
      renderShell();
    }, Icons.plus));
    body.appendChild(actions);

    panel.appendChild(body);
    return panel;
  }

  function updateTreeTitle(text) {
    var rows = document.querySelectorAll('.tree-series.sel span');
    if (rows.length) rows[0].textContent = text || 'Без названия';
  }

  function renderEpisodeListPanel(s) {
    var panel = el('div', 'panel');
    var head = el('div', 'panel-head');
    head.appendChild(el('h2', null, 'Серии'));
    panel.appendChild(head);
    var body = el('div', 'panel-body');
    body.appendChild(el('p', 'muted', 'Выберите серию слева или создайте новую кнопкой «+ Серия» выше.'));
    panel.appendChild(body);
    return panel;
  }

  function renderEpisodePanel(s, ep) {
    var panel = el('div', 'panel');
    var head = el('div', 'panel-head');
    head.appendChild(el('h2', null, 'Серия ' + ep.number));
    var tools = el('div', 'admin-actions');
    var idx = s.episodes.indexOf(ep);

    tools.appendChild(miniBtn(Icons.up, 'Выше', function () {
      if (idx <= 0) return;
      var a = s.episodes[idx - 1], b = s.episodes[idx];
      var t = a.number; a.number = b.number; b.number = t;
      s.episodes.splice(idx - 1, 2, b, a);
      markDirty();
      renderShell();
    }, idx <= 0 ? 'danger' : ''));
    tools.appendChild(miniBtn(Icons.down, 'Ниже', function () {
      if (idx >= s.episodes.length - 1) return;
      var a = s.episodes[idx], b = s.episodes[idx + 1];
      var t = a.number; a.number = b.number; b.number = t;
      s.episodes.splice(idx, 2, b, a);
      markDirty();
      renderShell();
    }));
    tools.appendChild(miniBtn(Icons.trash, 'Удалить серию', function () {
      if (!confirm('Удалить серию «' + (ep.title || '') + '»?')) return;
      s.episodes = s.episodes.filter(function (x) { return x.id !== ep.id; });
      state.selEpisode = s.episodes[idx] ? s.episodes[idx].id : (s.episodes[idx - 1] ? s.episodes[idx - 1].id : null);
      markDirty();
      renderShell();
    }, 'danger'));
    head.appendChild(tools);
    panel.appendChild(head);

    var body = el('div', 'panel-body');

    var row = el('div', 'row');
    var fNum = input(ep.number, '1', 'number');
    fNum.min = '1';
    fNum.addEventListener('change', function () {
      ep.number = Math.max(1, Number(fNum.value) || 1);
      markDirty();
      renderShell();
    });
    var fTitle = input(ep.title, 'Название серии');
    fTitle.addEventListener('input', function () {
      ep.title = fTitle.value;
      markDirty();
    });
    var colNum = field('Номер', fNum);
    colNum.style.maxWidth = '110px';
    colNum.style.flex = 'none';
    row.appendChild(colNum);
    row.appendChild(field('Название серии', fTitle));
    body.appendChild(row);

    var fDesc = textarea(ep.description, 'Краткое описание (необязательно)', 2);
    fDesc.addEventListener('input', function () { ep.description = fDesc.value; markDirty(); });
    body.appendChild(field('Описание', fDesc));

    /* ---- видео ---- */

    body.appendChild(el('h3', 'section-title', 'Видео'));

    var vrow = el('div', 'row');
    var kindSel = select([
      { value: 'youtube', label: 'YouTube' },
      { value: 'file', label: 'Файл с компьютера / прямая ссылка' },
      { value: 'embed', label: 'Любой другой сайт (Rutube, VK, griffinfan и т.п.)' }
    ], ep.video.kind);
    kindSel.addEventListener('change', function () {
      ep.video.kind = kindSel.value;
      markDirty();
      renderShell();
    });
    vrow.appendChild(field('Источник', kindSel));
    body.appendChild(vrow);

    /* ---- вставка кода плеера с чужого сайта ---- */

    if (ep.video.kind === 'embed') {
      body.appendChild(buildEmbedBox(ep, function () { renderShell(); }));
    }

    var placeholders = {
      youtube: 'https://www.youtube.com/watch?v=... или id',
      file: 'выберите файл кнопкой ниже — или вставьте ссылку https://…',
      embed: 'https://rutube.ru/play/embed/...'
    };
    var fRef = input(ep.video.ref, placeholders[ep.video.kind]);
    fRef.addEventListener('input', function () {
      ep.video.ref = fRef.value.trim();
      markDirty();
      refreshRefHint();
    });
    body.appendChild(field(
      ep.video.kind === 'youtube' ? 'Ссылка YouTube'
        : ep.video.kind === 'file' ? 'Видео: папка сайта или прямая ссылка'
        : 'Ссылка на embed',
      fRef
    ));

    var refHint = el('div', 'help', '');
    if (ep.video.kind === 'youtube') body.appendChild(refHint);

    function refreshRefHint() {
      if (ep.video.kind !== 'youtube') return;
      var id = P.youtubeId(ep.video.ref);
      refHint.textContent = !ep.video.ref ? '' : id ? 'Распознан id: ' + id : 'Не похоже на ссылку YouTube.';
      refHint.style.color = ep.video.ref && !id ? '#d8b06a' : '';
    }
    refreshRefHint();

    if (ep.video.kind === 'file') {
      body.appendChild(buildFilePicker(ep, fRef, function () { renderShell(); }));
      body.appendChild(buildClipEditor(ep, function () { renderShell(); }));
    }

    if (ep.video.kind === 'embed') {
      body.appendChild(el('div', 'notice warn',
        'У Rutube и VK нет документированного API плеера: сайт не сможет показывать пояснения синхронно и менять громкость. ' +
        'Список отсылок с таймкодами работать будет. Если нужны всплывающие пояснения — используйте YouTube или файл.'));
    }

    /* ---- превью ---- */

    body.appendChild(el('h3', 'section-title', 'Превью и отсылки'));

    var previewShell = el('div', 'player-shell');
    previewShell.style.marginBottom = '12px';
    var previewFrame = el('div', 'player-frame');
    var previewStage = el('div');
    previewStage.style.cssText = 'position:absolute;inset:0;z-index:1';
    var previewOverlay = el('div', 'note-overlay');
    var previewBubble = el('div', 'note-bubble');
    previewOverlay.appendChild(previewBubble);
    previewFrame.appendChild(previewStage);
    previewFrame.appendChild(previewOverlay);
    previewShell.appendChild(previewFrame);
    body.appendChild(previewShell);

    var pctrls = el('div', 'player-controls');
    var playBtn = el('button', 'pc-btn play');
    playBtn.type = 'button';
    playBtn.innerHTML = Icons.play;
    pctrls.appendChild(playBtn);
    var ptime = el('div', 'pc-time', '0:00');
    pctrls.appendChild(ptime);
    var addNoteBtn = button('+ Отсылка на этой секунде', 'primary', function () {
      addNoteAtCurrent(ep, previewStage, ptime);
    }, Icons.target);
    addNoteBtn.style.marginLeft = 'auto';
    pctrls.appendChild(addNoteBtn);
    var srtInput = el('input');
    srtInput.type = 'file';
    srtInput.accept = '.srt,.vtt,text/plain';
    srtInput.style.display = 'none';
    srtInput.addEventListener('change', function () {
      var f = srtInput.files && srtInput.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { importSrt(String(fr.result || ''), ep); };
      fr.readAsText(f, 'utf-8');
      srtInput.value = '';
    });
    var srtBtn = button('Импорт .srt', '', function () { srtInput.click(); });
    srtBtn.title = 'Превратить субтитры в черновики отсылок';
    pctrls.appendChild(srtBtn);
    pctrls.appendChild(srtInput);

    previewShell.appendChild(pctrls);

    /* сам плеер */
    state.adapter = P.create(previewStage, ep.video, { volume: 0.9 });
    var ad = state.adapter;
    ad.on('ready', function () {
      playBtn.innerHTML = ad.isPaused() ? Icons.play : Icons.pause;
    });
    ad.on('state', function (st) {
      playBtn.innerHTML = st.playing ? Icons.pause : Icons.play;
    });
    ad.on('time', function (p) {
      ptime.textContent = util.fmtTime(p.t);
      var active = null;
      (ep.notes || []).forEach(function (n) {
        if (p.t >= n.t - 0.15 && p.t < n.t + n.dur) active = n;
      });
      if (active) {
        if (state.previewNote !== active.id) {
          state.previewNote = active.id;
          showPreviewBubble(active);
        }
      } else if (state.previewNote) {
        state.previewNote = null;
        previewBubble.classList.remove('show');
      }
    });
    playBtn.addEventListener('click', function () {
      if (!ad.supportsControl) return;
      if (ad.isPaused()) ad.play(); else ad.pause();
    });

    function showPreviewBubble(n) {
      previewBubble.textContent = '';
      var k = el('div', 'nb-kicker', 'Отсылка');
      k.appendChild(el('span', 'tc', util.fmtTime(n.t)));
      previewBubble.appendChild(k);
      if (n.title) previewBubble.appendChild(el('div', 'nb-title', n.title));
      previewBubble.appendChild(el('div', 'nb-text', n.text || ''));
      previewBubble.classList.add('show');
    }

    /* ---- список отсылок ---- */

    var notesPanel = el('div', 'panel');
    var nh = el('div', 'panel-head');
    var nhTitle = el('h2', null, 'Отсылки (' + ep.notes.length + ')');
    nhTitle.id = 'notes-count';
    nh.appendChild(nhTitle);
    notesPanel.appendChild(nh);
    var nb = el('div', 'panel-body');
    nb.id = 'admin-note-list-host';
    nb.appendChild(buildAdminNoteList(ep, previewStage, ptime));
    notesPanel.appendChild(nb);
    body.appendChild(notesPanel);

    var optsPanel = el('div', 'panel');
    var optsHead = el('div', 'panel-head');
    optsHead.appendChild(el('h2', null, 'Поведение серии'));
    optsPanel.appendChild(optsHead);
    var optsBody = el('div', 'panel-body');
    var nx = select(
      [{ value: '', label: 'Автоматически: следующая по порядку в списке' }].concat(
        s.episodes.filter(function (x) { return x.id !== ep.id; })
          .map(function (x) { return { value: x.id, label: x.number + '. ' + (x.title || '') }; })
      ),
      ep.nextOverride || ''
    );
    nx.addEventListener('change', function () {
      ep.nextOverride = nx.value || null;
      markDirty();
    });
    optsBody.appendChild(field('«Следующая серия» ведёт на', nx, 'Нужно, если серии смотрят не по порядку.'));

    var autoChk = el('input');
    autoChk.type = 'checkbox';
    autoChk.checked = util.lsGet(util.LS.autonext, '1') === '1';
    autoChk.addEventListener('change', function () {
      util.lsSet(util.LS.autonext, autoChk.checked ? '1' : '0');
      setStatus('автопереход: ' + (autoChk.checked ? 'вкл' : 'выкл'), '');
    });
    var autoLine = el('label', 'checkline');
    autoLine.appendChild(autoChk);
    autoLine.appendChild(document.createTextNode('Включать следующую серию автоматически'));
    optsBody.appendChild(autoLine);
    optsPanel.appendChild(optsBody);
    body.appendChild(optsPanel);

    var formHolder = el('div');
    formHolder.id = 'note-form-holder';
    body.appendChild(formHolder);
    if (state.selNote) renderNoteForm(ep, formHolder, previewStage, ptime);

    panel.appendChild(body);

    return panel;
  }

  function renderNoteRow(ep, n, stage, ptime) {
    var li = el('li', 'admin-note' + (n.id === state.selNote ? ' sel' : ''));
    li.dataset.noteId = n.id;

    var tc = el('input', 'input tc-input');
    tc.value = util.fmtTime(n.t);
    tc.title = 'Время начала, можно писать 1:23.5 или секунды';
    tc.addEventListener('change', function () {
      n.t = util.parseTime(tc.value);
      tc.value = util.fmtTime(n.t);
      markDirty();
      sortNotes(ep);
      rerenderNotesList(ep, stage, ptime);
    });
    li.appendChild(tc);

    var mid = el('div');
    mid.style.cursor = 'pointer';
    var title = el('div', 'an-title', n.title || '(без заголовка)');
    var text = el('div', 'an-text', n.text || '');
    mid.appendChild(title);
    mid.appendChild(text);
    var meta = el('div', 'an-links',
      (n.links.length ? n.links.length + ' ' + (n.links.length === 1 ? 'ссылка' : 'ссылок') : 'без ссылок') +
      ' · ' + n.dur + ' с' + (n.spoiler ? ' · спойлер' : ''));
    mid.appendChild(meta);
    mid.addEventListener('click', function () {
      state.selNote = n.id;
      if (state.adapter && state.adapter.supportsControl) state.adapter.seek(n.t);
      renderNoteRowsSel();
      renderNoteForm(ep, document.getElementById('note-form-holder'), stage, ptime);
    });
    li.appendChild(mid);

    var tools = el('div', 'an-tools');
    tools.appendChild(miniBtn(Icons.target, 'Перейти к таймкоду', function () {
      if (state.adapter && state.adapter.supportsControl) state.adapter.seek(n.t);
    }));
    tools.appendChild(miniBtn(Icons.trash, 'Удалить отсылку', function () {
      ep.notes = ep.notes.filter(function (x) { return x.id !== n.id; });
      if (state.selNote === n.id) state.selNote = null;
      markDirty();
      renderShell();
    }, 'danger'));
    li.appendChild(tools);

    return li;
  }

  function renderNoteRowsSel() {
    var rows = document.querySelectorAll('.admin-note');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('sel', rows[i].dataset.noteId === state.selNote);
    }
  }

  function rerenderNotesList(ep, stage, ptime) {
    // проще перерисовать панель целиком
    renderShell();
  }

  function sortNotes(ep) {
    ep.notes.sort(function (a, b) { return a.t - b.t; });
  }

  function renderNoteForm(ep, holder, stage, ptime) {
    if (!holder) return;
    holder.textContent = '';
    var n = ep.notes.filter(function (x) { return x.id === state.selNote; })[0];
    if (!n) return;

    var panel = el('div', 'panel');
    panel.style.marginTop = '14px';
    var head = el('div', 'panel-head');
    head.appendChild(el('h2', null, 'Отсылка на ' + util.fmtTime(n.t)));
    var tools = el('div', 'admin-actions');
    tools.appendChild(miniBtn(Icons.close, 'Готово', function () {
      state.selNote = null;
      holder.textContent = '';
      renderNoteRowsSel();
    }));
    head.appendChild(tools);
    panel.appendChild(head);

    var body = el('div', 'panel-body');

    var row = el('div', 'row tight');
    var fTime = input(util.fmtTime(n.t), '1:23');
    fTime.style.width = '110px';
    fTime.addEventListener('change', function () {
      n.t = util.parseTime(fTime.value);
      fTime.value = util.fmtTime(n.t);
      markDirty();
      sortNotes(ep);
      head.querySelector('h2').textContent = 'Отсылка на ' + util.fmtTime(n.t);
      renderNoteRowsSel();
    });
    var grab = button('Взять текущее время', '', function () {
      if (!state.adapter || !state.adapter.supportsControl) {
        alert('Для этого источника плеер не сообщает текущий таймкод.');
        return;
      }
      n.t = Math.round(state.adapter.getTime() * 10) / 10;
      fTime.value = util.fmtTime(n.t);
      markDirty();
      sortNotes(ep);
      head.querySelector('h2').textContent = 'Отсылка на ' + util.fmtTime(n.t);
    }, Icons.target);
    row.appendChild(field('Время', fTime));
    row.appendChild(field('Или', grab));

    var fDur = input(n.dur, '6', 'number');
    fDur.min = '1';
    fDur.step = '0.5';
    fDur.addEventListener('input', function () {
      n.dur = Math.min(600, Math.max(1, Number(fDur.value) || 6));
      markDirty();
    });
    var durCol = field('Показывать, сек', fDur);
    durCol.style.maxWidth = '150px';
    durCol.style.flex = 'none';
    row.appendChild(durCol);
    body.appendChild(row);

    var fTitle = input(n.title, 'Короткий заголовок, например «Отсылка к «Твин Пиксу»»');
    fTitle.addEventListener('input', function () { n.title = fTitle.value; markDirty(); updateRowLabel(n); });
    body.appendChild(field('Заголовок', fTitle));

    var fText = textarea(n.text, 'Что это за отсылка и почему она здесь', 4);
    fText.addEventListener('input', function () { n.text = fText.value; markDirty(); updateRowLabel(n); });
    body.appendChild(field('Пояснение', fText));

    var chk = el('input');
    chk.type = 'checkbox';
    chk.checked = !!n.spoiler;
    chk.addEventListener('change', function () { n.spoiler = chk.checked; markDirty(); });
    var cl = el('label', 'checkline');
    cl.appendChild(chk);
    cl.appendChild(document.createTextNode('Спойлер — в списке скрыт до клика'));
    body.appendChild(cl);
    body.appendChild(el('div', 'field'));

    /* ссылки */
    body.appendChild(el('h3', 'section-title', 'Что посмотреть или прочитать'));

    function renderLinks() {
      var old = body.querySelector('.links-holder');
      if (old) old.remove();
      var holderLinks = el('div', 'links-holder');
      n.links.forEach(function (l, i) {
        var rowL = el('div', 'link-row');
        var k = select([
          { value: 'watch', label: 'Смотреть' },
          { value: 'read', label: 'Читать' },
          { value: 'listen', label: 'Слушать' }
        ], l.kind);
        k.addEventListener('change', function () { l.kind = k.value; markDirty(); });
        var lab = input(l.label, 'Подпись, например «фильм-первоисточник»');
        lab.addEventListener('input', function () { l.label = lab.value; markDirty(); });
        var url = input(l.url, 'https://...');
        url.addEventListener('input', function () { l.url = url.value.trim(); markDirty(); });
        rowL.appendChild(k);
        rowL.appendChild(lab);
        rowL.appendChild(url);
        rowL.appendChild(miniBtn(Icons.trash, 'Удалить ссылку', function () {
          n.links.splice(i, 1);
          markDirty();
          renderLinks();
          updateRowLabel(n);
        }, 'danger'));
        holderLinks.appendChild(rowL);
      });
      var add = button('+ Ссылка', '', function () {
        n.links.push({ kind: 'watch', label: '', url: '' });
        markDirty();
        renderLinks();
      }, Icons.plus);
      holderLinks.appendChild(add);
      body.appendChild(holderLinks);
    }
    renderLinks();

    panel.appendChild(body);
    holder.appendChild(panel);
  }

  function updateRowLabel(n) {
    var row = document.querySelector('.admin-note[data-note-id="' + n.id + '"]');
    if (!row) return;
    var t = row.querySelector('.an-title');
    var x = row.querySelector('.an-text');
    if (t) t.textContent = n.title || '(без заголовка)';
    if (x) x.textContent = n.text || '';
  }

  function addNoteAtCurrent(ep, stage, ptime) {
    var t = 0;
    if (state.adapter && state.adapter.supportsControl) t = Math.round(state.adapter.getTime() * 10) / 10;
    var n = util.normalizeNote({ t: t, dur: 6, title: '', text: '', links: [] });
    ep.notes.push(n);
    sortNotes(ep);
    state.selNote = n.id;
    markDirty();
    updateAdminTreeNoteCount(ep);
    // перерисовываем только список и форму, чтобы не терять позицию видео
    var listHost = document.getElementById('admin-note-list-host');
    if (listHost) {
      listHost.textContent = '';
      listHost.appendChild(buildAdminNoteList(ep, stage, ptime));
    }
    renderNoteForm(ep, document.getElementById('note-form-holder'), stage, ptime);
  }

  function updateAdminTreeNoteCount(ep) {
    var rows = document.querySelectorAll('.admin-note');
    var head = document.querySelector('#notes-count');
    if (head) head.textContent = 'Отсылки (' + ep.notes.length + ')';
    if (!ep.notes.length && rows.length === 0) {
      var host = document.getElementById('admin-note-list-host');
      if (host) {
        host.textContent = '';
        host.appendChild(el('p', 'muted small',
          'Пока нет отсылок. Поставьте видео на нужный момент и нажмите «+ Отсылка на этой секунде».'));
      }
    }
  }

  function buildAdminNoteList(ep, stage, ptime) {
    if (!ep.notes.length) {
      return el('p', 'muted small', 'Пока нет отсылок. Поставьте видео на нужный момент и нажмите «+ Отсылка на этой секунде».');
    }
    var list = el('ul', 'admin-note-list');
    ep.notes.slice().sort(function (a, b) { return a.t - b.t; }).forEach(function (n) {
      list.appendChild(renderNoteRow(ep, n, stage, ptime));
    });
    return list;
  }

  function importSrt(text, ep) {
    var rows = window.Refs.srt.parse(text);
    if (!rows.length) {
      alert('Не удалось разобрать файл. Нужны обычные субтитры SRT или WebVTT с таймкодами.');
      return;
    }
    var ok = confirm('Найдено ' + rows.length + ' блоков. Добавить их как отсылки?\n' +
      'Текст станет пояснением, дальше его можно отредактировать.');
    if (!ok) return;
    rows.forEach(function (r) {
      ep.notes.push(util.normalizeNote({ t: r.t, dur: r.dur, text: r.text, title: '', links: [] }));
    });
    sortNotes(ep);
    markDirty();
    renderShell();
  }

  /* ---------------- публикация ---------------- */

  function publish() {
    if (!state.cfg) {
      alert('Локальный режим: публиковать некуда. Подключитесь к GitHub.');
      return;
    }
    var payload = JSON.stringify(state.data, null, 2);
    if (payload.length > 900 * 1024) {
      alert('Файл данных слишком большой для Contents API. Уменьшите количество отсылок или разбейте сериалы.');
      return;
    }

    // предупреждения перед публикацией
    var problems = [];
    state.data.series.forEach(function (s) {
      if (!s.episodes.length) problems.push('«' + s.title + '»: нет ни одной серии');
      s.episodes.forEach(function (e) {
        if (!e.video.ref) problems.push('«' + s.title + '», серия ' + e.number + ': не указано видео');
        if (e.video.kind === 'youtube' && e.video.ref && !P.youtubeId(e.video.ref)) {
          problems.push('«' + s.title + '», серия ' + e.number + ': ссылка YouTube не распознана');
        }
        e.notes.forEach(function (n) {
          n.links.forEach(function (l) {
            if (l.url && !util.isHttpUrl(l.url)) {
              problems.push('Отсылка «' + (n.title || util.fmtTime(n.t)) + '»: ссылка должна начинаться с http:// или https://');
            }
          });
        });
      });
    });
    if (problems.length) {
      var text = 'Перед публикацией стоит поправить:\n\n' + problems.slice(0, 12).join('\n') +
        (problems.length > 12 ? '\n…и ещё ' + (problems.length - 12) : '') + '\n\nОпубликовать всё равно?';
      if (!confirm(text)) return;
    }

    setStatus('публикую…', '');
    GH.putText(state.cfg, state.cfg.path, payload,
      'Update ' + state.cfg.path + ' (' + new Date().toLocaleString('ru-RU') + ')', state.sha)
      .then(function (res) {
        state.sha = res.content && res.content.sha;
        state.dirty = false;
        saveDraft();
        setStatus('опубликовано. GitHub Pages обновится в течение минуты', 'ok');
        var url = state.repoInfo && state.repoInfo.pagesUrl ? state.repoInfo.pagesUrl : GH.pagesUrl(state.cfg);
        setTimeout(function () {
          setStatus('опубликовано → ' + url, 'ok');
        }, 10);
      })
      .catch(function (err) {
        setStatus(err.message, 'err');
        if (err.status === 409) {
          setTimeout(function () {
            if (confirm('Файл в репозитории изменился. Перечитать его с GitHub и потерять локальные правки?\n' +
              'Отмена — остаться с локальной версией (тогда сначала сохраните её копию).')) {
              loadRemote();
            }
          }, 50);
        }
      });
  }

  function downloadData() {
    var text = JSON.stringify(state.data, null, 2);
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    setStatus('файл data.json скачан в папку «Загрузки»', 'ok');
  }

  /* Вставка плеера с любого сайта: код <iframe>, ссылка на страницу видео
     или ссылка на встраиваемый плеер. Работает для griffinfan.ru и подобных. */
  function buildEmbedBox(ep, onDone) {
    var box = el('div', 'upload-box');

    box.appendChild(el('div', 'help',
      'Скопируйте на сайте с видео код плеера (обычно кнопка «Поделиться» → «Встроить» / «Код для вставки») ' +
      'или просто адрес страницы с видео — и вставьте сюда. Подходит для griffinfan.ru, VK, Rutube, ' +
      'Dailymotion, archive.org и любых других открытых сайтов.'));

    var ta = el('textarea', 'input');
    ta.rows = 4;
    ta.placeholder = '<iframe src="https://www.griffinfan.ru/embed/12345" ...></iframe>\n' +
      '— или просто https://www.griffinfan.ru/serial/1/2\n' +
      '— или ссылка на видеофайл https://.../video.mp4';
    ta.value = ep.video.ref || '';
    ta.style.fontFamily = 'Consolas, monospace';
    ta.style.fontSize = '13px';
    box.appendChild(ta);

    var status = el('div', 'help', '');
    box.appendChild(status);

    var previewBox = el('div', 'embed-preview');
    previewBox.style.marginTop = '10px';
    box.appendChild(previewBox);

    function renderPreview() {
      previewBox.textContent = '';
      var raw = ta.value.trim();
      if (!raw) {
        status.textContent = '';
        return;
      }
      var parsed = P.parseEmbed(raw);
      ep.video.ref = raw;
      markDirty();

      if (!parsed.url) {
        status.textContent = 'Не понял, что вставлено. Нужен код <iframe> или ссылка.';
        status.className = 'help warn-text';
        return;
      }

      var label = P.hostLabel(parsed.host) || parsed.host;
      if (parsed.directVideo) {
        status.textContent = 'Это прямая ссылка на видеофайл (' + label + ') — будет играть как обычное видео, ' +
          'с пояснениями и громкостью.';
        status.className = 'help ok-text';
      } else if (/youtube\.com|youtu\.be/.test(parsed.host)) {
        status.textContent = 'Это YouTube — лучше выберите источник «YouTube» выше: там работают пояснения и громкость.';
        status.className = 'help warn-text';
      } else {
        status.textContent = 'Плеер сайта: ' + label + '. Вставка: ' + parsed.url;
        status.className = 'help ok-text';
      }

      var frame = el('div', 'player-frame');
      frame.style.position = 'relative';
      frame.style.aspectRatio = '16 / 9';
      var ifr = el('iframe');
      ifr.src = parsed.url;
      ifr.setAttribute('allowfullscreen', '');
      ifr.setAttribute('referrerpolicy', 'origin');
      ifr.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:8px;background:#000';
      frame.appendChild(ifr);
      previewBox.appendChild(frame);
      previewBox.appendChild(el('div', 'help',
        'Если здесь пусто — сайт запрещает встраивание своих страниц. Тогда вставьте ссылку на его ' +
        'встраиваемый плеер (обычно она содержит слово embed или /play/).'));
    }

    var t = null;
    ta.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(renderPreview, 600);
    });

    var row = el('div', 'admin-actions');
    row.appendChild(button('Проверить и вставить', 'primary', renderPreview));
    row.appendChild(button('Открыть страницу в новой вкладке', '', function () {
      var parsed = P.parseEmbed(ta.value);
      if (parsed.url) window.open(parsed.url, '_blank', 'noopener');
    }));
    box.appendChild(row);

    if (ep.video.ref) renderPreview();

    return box;
  }

  /* Сколько места занимают видео в папке сайта и сколько осталось на диске. */
  function buildStorageInfo() {
    var box = el('div', 'storage-info');
    box.appendChild(el('div', 'small muted', 'Считаю место на диске…'));

    if (!location.protocol.startsWith('http')) {
      box.textContent = '';
      box.appendChild(el('div', 'help',
        'Сведения о месте появятся, если открыть админку через «Редактировать сайт.cmd».'));
      return box;
    }

    fetch('/api/storage?v=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) throw new Error('no data');
        box.textContent = '';
        var used = humanSize(d.videosBytes || 0);
        var free = humanSize(d.freeBytes || 0);
        box.appendChild(el('div', 'small',
          'Видео в папке сайта: ' + used + ' (' + (d.videosCount || 0) + ' файлов) · свободно на диске: ' + free));
        if (d.freeBytes && d.freeBytes < 2000 * 1024 * 1024) {
          box.appendChild(el('div', 'help warn-text',
            'На диске почти не осталось места. Удалите лишние файлы из папки videos.'));
        }
        box.appendChild(el('div', 'help',
          'Видео лежат в папке videos внутри сайта — это копии, оригиналы на диске можно удалять.'));
      })
      .catch(function () {
        box.textContent = '';
        box.appendChild(el('div', 'help', 'Не удалось узнать свободное место.'));
      });

    return box;
  }

  /* ---------- видео с диска ---------- */

  function humanSize(bytes) {
    if (bytes > 1024 * 1024 * 1024) return (bytes / 1073741824).toFixed(2) + ' ГБ';
    if (bytes > 1024 * 1024) return (bytes / 1048576).toFixed(1) + ' МБ';
    return Math.round(bytes / 1024) + ' КБ';
  }

  /* Понятная ошибка вместо «ошибки»: путь на диске браузер открыть не может. */
  function explainBadRef(ref) {
    var s = String(ref || '').trim();
    if (!s) return '';
    if (/^[a-zA-Z]:[\\/]/.test(s) || /^\\\\/.test(s)) {
      return 'Это путь к файлу на компьютере. Браузер по такому пути видео открыть не может. ' +
        'Нажмите «Выбрать видео на диске» — файл скопируется в папку сайта, и серия заработает.';
    }
    if (/^file:/i.test(s)) {
      return 'Ссылки вида file:// браузер не открывает. Нажмите «Выбрать видео на диске».';
    }
    if (!/^https?:/i.test(s) && !/^\.{0,2}\//.test(s)) {
      return 'Похоже, это не ссылка и не путь внутри сайта. Если файл лежит на компьютере — нажмите «Выбрать видео на диске».';
    }
    return '';
  }

  /* Кнопка «Выбрать видео на диске»: файл уезжает в папку videos/ сайта
     (через локальный сервер) или в репозиторий (если подключён GitHub). */
  function buildFilePicker(ep, fRef, onDone) {
    var box = el('div', 'upload-box');

    var fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'video/*,.mp4,.webm,.mkv,.mov,.m4v';
    fileInput.style.display = 'none';

    var pickBtn = button('Выбрать видео на диске', 'primary', function () { fileInput.click(); }, Icons.upload);
    var note = el('div', 'help', '');
    var prog = el('div', 'upload-progress');
    prog.hidden = true;
    var bar = el('div', 'upload-bar');
    var barFill = el('div', 'upload-fill');
    bar.appendChild(barFill);
    var progText = el('div', 'small muted', '');
    prog.appendChild(bar);
    prog.appendChild(progText);

    box.appendChild(pickBtn);
    box.appendChild(fileInput);
    box.appendChild(note);
    box.appendChild(prog);

    /* ещё один способ — перетащить файл из проводника */
    var drop = el('div', 'upload-drop', 'или перетащите файл видео сюда');
    box.appendChild(drop);

    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.add('over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.remove('over');
      });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
    box.addEventListener('dragover', function (e) { e.preventDefault(); });
    box.addEventListener('drop', function (e) { e.preventDefault(); });

    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (f) handleFile(f);
      fileInput.value = '';
    });

    function updateHint() {
      var msg = explainBadRef(ep.video.ref);
      if (msg) {
        note.textContent = msg;
        note.className = 'help warn-text';
      } else if (ep.video.ref) {
        note.textContent = 'Видео: ' + ep.video.ref;
        note.className = 'help ok-text';
      } else {
        note.textContent = 'Пока видео не выбрано. Можно выбрать файл, перетащить его сюда или вставить прямую ссылку https://… выше.';
        note.className = 'help';
      }
    }
    updateHint();

    function handleFile(f) {
      var isVideo = /^video\//.test(f.type) || /\.(mp4|webm|mkv|mov|m4v|avi)$/i.test(f.name);
      if (!isVideo) {
        alert('Это не похоже на видеофайл. Выберите файл .mp4, .webm, .mkv или .mov.');
        return;
      }
      pickBtn.disabled = true;
      prog.hidden = false;
      barFill.style.width = '0%';
      progText.textContent = 'Готовлю файл: ' + f.name + ' (' + humanSize(f.size) + ')';

      var useRepo = !!state.cfg;
      if (useRepo && f.size > 95 * 1024 * 1024) {
        var keepRepo = confirm(
          'Файл ' + humanSize(f.size) + ' больше 95 МБ — GitHub такой не примет.\n\n' +
          'Хотите положить его в папку сайта на этом компьютере? Тогда видео будет работать при локальном просмотре, ' +
          'но не появится на опубликованном сайте.\n\n' +
          'ОК — сохранить локально, Отмена — выбрать файл поменьше.');
        if (!keepRepo) {
          pickBtn.disabled = false;
          prog.hidden = true;
          return;
        }
        useRepo = false;
      }

      var done = function (ref, where) {
        ep.video.kind = 'file';
        ep.video.ref = ref;
        fRef.value = ref;
        markDirty();
        progText.textContent = 'Готово: ' + where;
        barFill.style.width = '100%';
        setStatus('видео добавлено: ' + ref, 'ok');
        updateHint();
        pickBtn.disabled = false;
        if (onDone) onDone();
      };

      if (useRepo) {
        var safe = f.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
        var path = 'videos/' + Date.now().toString(36) + '-' + (safe || 'video.mp4');
        progText.textContent = 'Отправляю в GitHub…';
        GH.putFile(state.cfg, path, f, 'Add video ' + path, function (part) {
          barFill.style.width = Math.round(part * 100) + '%';
        }).then(function () {
          done(path, 'загружено в репозиторий');
        }).catch(function (err) {
          pickBtn.disabled = false;
          barFill.style.width = '0%';
          progText.textContent = '';
          alert(err.message);
        });
        return;
      }

      /* локально: отдаём файл маленькому серверу, он кладёт его в videos/ */
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload?name=' + encodeURIComponent(f.name), true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          var pct = Math.round((e.loaded / e.total) * 100);
          barFill.style.width = pct + '%';
          progText.textContent = 'Копирую в папку сайта… ' + pct + '%  (' +
            humanSize(e.loaded) + ' из ' + humanSize(e.total) + ')';
        }
      };
      xhr.onload = function () {
        var res = null;
        try { res = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200 && res && res.ok) {
          done(res.path, 'сохранено в папку videos');
        } else {
          pickBtn.disabled = false;
          barFill.style.width = '0%';
          progText.textContent = '';
          if (!location.protocol.startsWith('http')) {
            alert('Сайт открыт двойным щелчком по файлу — так загрузка видео не работает.\n\n' +
              'Закройте сайт и откройте его через «Редактировать сайт.cmd».');
          } else {
            alert('Не удалось сохранить файл. Ответ сервера: ' + xhr.status + ' ' + (xhr.responseText || ''));
          }
        }
      };
      xhr.onerror = function () {
        pickBtn.disabled = false;
        progText.textContent = '';
        alert('Не удалось связаться с локальным сервером.\n\n' +
          'Похоже, сайт открыт не через «Смотреть сайт.cmd» / «Редактировать сайт.cmd». ' +
          'Закройте эту вкладку и запустите админку ярлыком из папки.');
      };
      xhr.send(f);
    }

    return box;
  }

  /* Отрезок внутри большого файла: без перекодирования, простым выбором границ. */
  function buildClipEditor(ep, onDone) {
    var wrap = el('div', 'clip-box');
    var hasSource = !!(ep.video.ref && !explainBadRef(ep.video.ref));

    var head = el('div', 'clip-head');
    head.appendChild(el('strong', null, 'Отрезок из файла'));
    head.appendChild(el('span', 'small muted', 'Необязательно. Если нужен кусок, а не всё видео.'));
    wrap.appendChild(head);

    if (!hasSource) {
      wrap.appendChild(el('div', 'help', 'Сначала выберите видео выше.'));
      return wrap;
    }

    var state = {
      full: 0,
      start: Number(ep.video.clipStart) || 0,
      end: Number(ep.video.clipEnd) || 0
    };

    /* свой маленький плеер только для выбора границ */
    var stageHolder = el('div', 'clip-stage');
    var probe = document.createElement('video');
    probe.setAttribute('controls', '');
    probe.setAttribute('preload', 'metadata');
    probe.src = ep.video.ref;
    probe.style.cssText = 'width:100%;max-height:260px;background:#000;border-radius:8px;display:block';
    stageHolder.appendChild(probe);
    wrap.appendChild(stageHolder);

    var info = el('div', 'small muted', 'Загружаю сведения о видео…');
    wrap.appendChild(info);

    probe.addEventListener('loadedmetadata', function () {
      state.full = probe.duration || 0;
      info.textContent = 'Длина файла: ' + util.fmtTime(state.full);
      if (state.end > state.full) state.end = 0;
      syncInputs();
    });
    probe.addEventListener('error', function () {
      info.textContent = 'Не удалось прочитать видео. Проверьте, что файл на месте и формат поддерживается браузером (mp4 — надёжнее всего).';
    });

    var tRow = el('div', 'row tight');
    var fStart = input('', '0:00');
    var fEnd = input('', '0:00');
    tRow.appendChild(field('Начало отрезка', fStart));
    var endField = field('Конец отрезка', fEnd, 'Пусто = до конца файла');
    tRow.appendChild(endField);
    wrap.appendChild(tRow);

    var marks = el('div', 'admin-actions');
    marks.appendChild(button('Начало = текущая секунда', '', function () {
      state.start = Math.round((probe.currentTime || 0) * 10) / 10;
      fStart.value = util.fmtTime(state.start);
      applyToEpisode();
    }, Icons.target));
    marks.appendChild(button('Конец = текущая секунда', '', function () {
      state.end = Math.round((probe.currentTime || 0) * 10) / 10;
      fEnd.value = util.fmtTime(state.end);
      applyToEpisode();
    }, Icons.target));
    marks.appendChild(button('Очистить отрезок', '', function () {
      state.start = 0;
      state.end = 0;
      fStart.value = '';
      fEnd.value = '';
      applyToEpisode();
    }));
    wrap.appendChild(marks);

    var hint = el('div', 'help',
      'Время указывается в файле. После сохранения сайт будет играть только этот кусок, ' +
      'а таймкоды отсылок начнутся с 0:00 — от его начала.');
    wrap.appendChild(hint);

    function syncInputs() {
      fStart.value = state.start ? util.fmtTime(state.start) : '';
      fEnd.value = state.end ? util.fmtTime(state.end) : '';
    }
    fStart.addEventListener('change', function () {
      state.start = util.parseTime(fStart.value);
      fStart.value = state.start ? util.fmtTime(state.start) : '';
      applyToEpisode();
    });
    fEnd.addEventListener('change', function () {
      state.end = util.parseTime(fEnd.value);
      fEnd.value = state.end ? util.fmtTime(state.end) : '';
      applyToEpisode();
    });

    function applyToEpisode() {
      if (state.end && state.start && state.end <= state.start) {
        hint.textContent = 'Конец отрезка должен быть позже начала.';
        hint.className = 'help warn-text';
        return;
      }
      hint.textContent = 'Время указывается в файле. После сохранения сайт будет играть только этот кусок, ' +
        'а таймкоды отсылок начнутся с 0:00 — от его начала.';
      hint.className = 'help';

      if (state.start > 0) ep.video.clipStart = state.start; else delete ep.video.clipStart;
      if (state.end > 0) ep.video.clipEnd = state.end; else delete ep.video.clipEnd;
      markDirty();
      updateLength();
      if (onDone) onDone();
    }

    function updateLength() {
      if (!state.full) return;
      var from = state.start || 0;
      var to = state.end || state.full;
      var len = Math.max(0, to - from);
      info.textContent = 'Длина файла: ' + util.fmtTime(state.full) +
        ' · отрезок: ' + util.fmtTime(from) + '–' + util.fmtTime(to) +
        ' (длится ' + util.fmtTime(len) + ')';
    }
    var origSync = syncInputs;
    syncInputs = function () { origSync(); updateLength(); };

    syncInputs();
    return wrap;
  }

  function destroyPlayer() {
    if (state.adapter) {
      try { state.adapter.destroy(); } catch (e) {}
      state.adapter = null;
    }
    state.previewNote = null;
  }

  /* ---------------- старт ---------------- */

  var saved = GH.cfg();

  /* #local — работать без GitHub: править черновик и скачивать data.json.
     Удобно, чтобы попробовать редактор, не создавая репозиторий. */
  function selectFirst() {
    var s = state.data.series[0] || null;
    state.selSeries = s ? s.id : null;
    state.selEpisode = s && s.episodes[0] ? s.episodes[0].id : null;
    state.selNote = null;
  }

  function startLocal() {
    var draft = loadDraft();
    if (draft && draft.data) {
      state.data = util.normalize(draft.data);
      state.sha = draft.sha || null;
      setStatus('восстановлен черновик', '');
    } else {
      // Первый запуск: показываем текущее содержимое сайта, чтобы было с чего начать.
      state.data = util.normalize(window.SEED_DATA);
      setStatus('локальный режим: правки только в этом браузере', '');
      fetch('data/data.json?v=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (json) {
          if (!json || state.dirty || loadDraft()) return;
          state.data = util.normalize(json);
          selectFirst();
          renderShell();
        })
        .catch(function () { /* остаёмся на демо-данных */ });
    }
    selectFirst();
    renderShell();
  }

  if (!saved && /(^|[#&])local\b/.test(location.hash)) {
    startLocal();
  } else if (saved) {
    state.cfg = saved;
    loadRemote();
  } else {
    renderLogin(null);
  }

  window.addEventListener('beforeunload', function (ev) {
    if (state.dirty) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });
})();
