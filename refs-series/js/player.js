/* Адаптеры плееров: YouTube (IFrame API), локальный/прямой mp4, чужой iframe.

   Общий интерфейс adapter:
     supportsControl : bool        — можно ли управлять извне
     on(event, fn)                 — 'time' | 'state' | 'ended' | 'ready'
     off(event, fn)
     play() / pause()
     seek(sec)
     getTime()                     — текущая секунда
     getDuration()                 — длительность в секундах
     isPaused()
     setVolume(0..1) / getVolume() / mute(bool)
     destroy()
*/
(function () {
  'use strict';

  /* ---------- helpers ---------- */

  function secondsFromYouTube(t) {
    // YouTube-вид 'PT1H2M3S'
    var m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(t || '');
    if (!m) return 0;
    return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
  }

  function youtubeId(input) {
    var s = String(input || '').trim();
    if (!s) return '';
    if (/^[\w-]{11}$/.test(s)) return s;
    var m = /(?:v=|\/embed\/|\/shorts\/|\/live\/|youtu\.be\/)([\w-]{11})/.exec(s);
    return m ? m[1] : '';
  }

  var counter = 0;

  /* ---------- YouTube ---------- */

  var _ytReady = null;
  var _ytQueue = [];

  function loadYouTubeApi() {
    if (_ytReady) return _ytReady;
    _ytReady = new Promise(function (resolve) {
      if (window.YT && window.YT.Player) { resolve(window.YT); return; }
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prev === 'function') { try { prev(); } catch (e) {} }
        resolve(window.YT);
      };
      var tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = function () { resolve(null); };
      document.head.appendChild(tag);
      _ytQueue.push(resolve);
    });
    return _ytReady;
  }

  function YouTubeAdapter(host, videoId, opts) {
    opts = opts || {};
    this.kind = 'youtube';
    this.supportsControl = true;
    this.handlers = {};
    this.player = null;
    this.destroyed = false;
    this.host = host;
    this.ready = false;
    this.duration = 0;
    this._timer = null;
    this._lastState = -1;

    var self = this;
    var el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0';
    host.appendChild(el);

    loadYouTubeApi().then(function (YT) {
      if (self.destroyed) return;
      if (!YT) {
        self._emit('error', new Error('YouTube API недоступен'));
        return;
      }
      self.player = new YT.Player(el, {
        videoId: videoId,
        playerVars: {
          controls: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          playsinline: 1,
          disablekb: 1,
          fs: 0,
          cc_load_policy: 0,
          origin: location.origin
        },
        events: {
          onReady: function () {
            self.ready = true;
            try {
              self.duration = self.player.getDuration() || 0;
              var startAt = opts.resume || opts.start || 0;
              if (startAt > 0) self.player.seekTo(startAt, true);
              if (opts.volume != null) self.player.setVolume(Math.round(opts.volume * 100));
            } catch (e) {}
            self._startPolling();
            self._emit('ready');
            self._emit('duration', self.duration);
          },
          onStateChange: function (ev) {
            var st = ev.data;
            if (st === 0) { self._emit('ended'); }
            if (st === 1) {
              try { self.duration = self.player.getDuration() || self.duration; } catch (e) {}
              self._emit('state', { playing: true, duration: self.duration });
            }
            if (st === 2) self._emit('state', { playing: false, duration: self.duration });
          },
          onError: function (ev) {
            self._emit('error', new Error('YouTube: код ошибки ' + ev.data));
          }
        }
      });
    });
  }

  YouTubeAdapter.prototype._startPolling = function () {
    var self = this;
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(function () {
      if (self.destroyed || !self.ready || !self.player || typeof self.player.getCurrentTime !== 'function') return;
      try {
        var t = self.player.getCurrentTime() || 0;
        var d = self.player.getDuration() || self.duration || 0;
        if (d && Math.abs(d - self.duration) > 0.5) {
          self.duration = d;
          self._emit('duration', d);
        }
        self._emit('time', { t: t, duration: self.duration });
      } catch (e) { /* плеер мог быть заменён */ }
    }, 200);
  };

  YouTubeAdapter.prototype._emit = function (name, payload) {
    (this.handlers[name] || []).slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error(e); }
    });
  };

  YouTubeAdapter.prototype.on = function (name, fn) {
    (this.handlers[name] = this.handlers[name] || []).push(fn);
  };
  YouTubeAdapter.prototype.off = function (name, fn) {
    var list = this.handlers[name] || [];
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };

  YouTubeAdapter.prototype.play = function () {
    try { this.player && this.player.playVideo(); } catch (e) {}
  };
  YouTubeAdapter.prototype.pause = function () {
    try { this.player && this.player.pauseVideo(); } catch (e) {}
  };
  YouTubeAdapter.prototype.seek = function (sec) {
    try { this.player && this.player.seekTo(Math.max(0, sec), true); } catch (e) {}
  };
  YouTubeAdapter.prototype.getTime = function () {
    try { return this.player ? (this.player.getCurrentTime() || 0) : 0; } catch (e) { return 0; }
  };
  YouTubeAdapter.prototype.getDuration = function () { return this.duration || 0; };
  YouTubeAdapter.prototype.isPaused = function () {
    try { return this.player ? this.player.getPlayerState() !== 1 : true; } catch (e) { return true; }
  };
  YouTubeAdapter.prototype.setVolume = function (v) {
    try {
      if (!this.player) return;
      this.player.setVolume(Math.round(Math.max(0, Math.min(1, v)) * 100));
    } catch (e) {}
  };
  YouTubeAdapter.prototype.mute = function (on) {
    try {
      if (!this.player) return;
      if (on) this.player.mute(); else this.player.unMute();
    } catch (e) {}
  };
  YouTubeAdapter.prototype.destroy = function () {
    this.destroyed = true;
    if (this._timer) clearInterval(this._timer);
    try { this.player && this.player.destroy && this.player.destroy(); } catch (e) {}
    this.player = null;
    this.host.innerHTML = '';
  };

  /* ---------- файл / прямой URL ---------- */

  function VideoAdapter(host, src, opts) {
    opts = opts || {};
    this.kind = 'file';
    this.supportsControl = true;
    this.handlers = {};
    this.destroyed = false;
    this.host = host;
    this.ready = false;

    /* Отрезок внутри файла — как вырезать кусок, не перекодируя видео:
       плеер сам перескакивает с конца отрезка на его начало, а все
       таймкоды снаружи считаются от начала отрезка. */
    this.clipStart = Number(opts.clipStart) || 0;
    this.clipEnd = Number(opts.clipEnd) || 0;
    this.duration = 0;

    var self = this;
    var v = document.createElement('video');
    v.setAttribute('playsinline', '');
    v.setAttribute('preload', 'metadata');
    if (!this.clipEnd) v.setAttribute('controls', '');
    v.src = src;
    if (opts.poster) v.poster = opts.poster;
    host.appendChild(v);
    this.el = v;

    v.style.position = 'absolute';
    v.style.inset = '0';
    v.style.width = '100%';
    v.style.height = '100%';

    v.addEventListener('loadedmetadata', function () {
      self.ready = true;
      var full = v.duration || 0;
      if (self.clipStart && full && self.clipStart >= full - 0.2) self.clipStart = 0;
      if (self.clipEnd && full) self.clipEnd = Math.min(self.clipEnd, full);
      self.duration = self.clipEnd
        ? Math.max(0, self.clipEnd - self.clipStart)
        : Math.max(0, full - self.clipStart);
      var resume = Math.max(0, opts.resume || opts.start || 0);
      v.currentTime = self.clipStart + resume;
      if (opts.volume != null) v.volume = opts.volume;
      self._emit('ready');
      self._emit('duration', self.duration);
    });
    v.addEventListener('canplay', function () {
      if (!self.ready) {
        self.ready = true;
        self.duration = self.clipEnd
          ? Math.max(0, self.clipEnd - self.clipStart)
          : Math.max(0, (v.duration || 0) - self.clipStart);
        self._emit('ready');
      }
    });
    v.addEventListener('timeupdate', function () {
      var t = videoTime(self);
      if (self.clipEnd && v.currentTime >= self.clipEnd - 0.05) {
        v.pause();
        v.currentTime = self.clipEnd;   // показать последний кадр отрезка
        self._emit('time', { t: self.duration, duration: self.duration });
        if (!self._endedFired) { self._endedFired = true; self._emit('ended'); }
        return;
      }
      if (self.clipEnd && v.currentTime + 0.3 < self.clipStart) {
        // ушли левее начала отрезка (пользователь дёрнул ползунок)
        v.currentTime = self.clipStart;
      }
      self._emit('time', { t: t, duration: self.duration });
    });
    v.addEventListener('durationchange', function () {
      var full = v.duration || 0;
      if (!self.clipEnd) {
        self.duration = Math.max(0, full - self.clipStart);
        self._emit('duration', self.duration);
      }
    });
    v.addEventListener('play', function () {
      self._endedFired = false;
      self._emit('state', { playing: true, duration: self.duration });
    });
    v.addEventListener('pause', function () {
      self._emit('state', { playing: false, duration: self.duration });
    });
    v.addEventListener('ended', function () {
      if (self.clipEnd) return; // обрезок обрабатывается выше
      self._emit('ended');
    });
    v.addEventListener('seeked', function () { self._endedFired = false; });
    v.addEventListener('error', function () {
      var msg = 'Не удалось загрузить видео';
      if (v.error) {
        var codes = { 1: 'загрузка прервана', 2: 'сетевая ошибка', 3: 'ошибка декодирования', 4: 'формат не поддерживается' };
        msg = 'Видео: ' + (codes[v.error.code] || 'ошибка ' + v.error.code);
      }
      self._emit('error', new Error(msg));
    });
  }

  /* Позиция внутри отрезка (0 = начало отрезка). */
  function videoTime(adapter) {
    if (!adapter.el) return 0;
    return Math.max(0, (adapter.el.currentTime || 0) - adapter.clipStart);
  }


  VideoAdapter.prototype._emit = YouTubeAdapter.prototype._emit;
  VideoAdapter.prototype.on = YouTubeAdapter.prototype.on;
  VideoAdapter.prototype.off = YouTubeAdapter.prototype.off;

  VideoAdapter.prototype.play = function () {
    if (!this.el) return;
    // если стоим на конце отрезка — начинаем его заново
    if (this.clipEnd && this.el.currentTime >= this.clipEnd - 0.1) {
      this.el.currentTime = this.clipStart;
      this._endedFired = false;
    }
    var p = this.el.play();
    if (p && p.catch) p.catch(function () { /* автоплей заблокирован браузером */ });
  };
  VideoAdapter.prototype.pause = function () { this.el && this.el.pause(); };
  VideoAdapter.prototype.seek = function (sec) {
    if (!this.el) return;
    var t = this.clipStart + Math.max(0, sec);
    if (this.clipEnd) {
      t = Math.min(t, this.clipEnd);
      this._endedFired = false;
    }
    this.el.currentTime = t;
  };
  VideoAdapter.prototype.getTime = function () { return this.el ? videoTime(this) : 0; };
  VideoAdapter.prototype.getDuration = function () {
    if (!this.el) return 0;
    if (this.duration != null && this.ready) return this.duration;
    var full = this.el.duration || 0;
    if (!isFinite(full)) full = 0;
    return this.clipEnd
      ? Math.max(0, this.clipEnd - this.clipStart)
      : Math.max(0, full - this.clipStart);
  };

  VideoAdapter.prototype.isPaused = function () { return this.el ? this.el.paused : true; };
  VideoAdapter.prototype.setVolume = function (v) {
    if (!this.el) return;
    this.el.volume = Math.max(0, Math.min(1, v));
    this.el.muted = this.el.volume === 0;
  };
  VideoAdapter.prototype.mute = function (on) { if (this.el) this.el.muted = !!on; };
  VideoAdapter.prototype.destroy = function () {
    this.destroyed = true;
    if (this.el) {
      try { this.el.pause(); } catch (e) {}
      this.el.removeAttribute('src');
      try { this.el.load(); } catch (e) {}
    }
    this.host.innerHTML = '';
    this.el = null;
  };

  /* ---------- чужой iframe (Rutube, VK, что угодно) ---------- */

  function EmbedAdapter(host, url) {
    this.kind = 'embed';
    this.supportsControl = false;   // документированного API нет — не обманываем
    this.handlers = {};
    this.destroyed = false;
    this.url = url;

    var f = document.createElement('iframe');
    f.src = url;
    f.setAttribute('allowfullscreen', '');
    f.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    f.setAttribute('referrerpolicy', 'origin');
    host.appendChild(f);
    this.el = f;
  }

  EmbedAdapter.prototype._emit = YouTubeAdapter.prototype._emit;
  EmbedAdapter.prototype.on = YouTubeAdapter.prototype.on;
  EmbedAdapter.prototype.off = YouTubeAdapter.prototype.off;
  EmbedAdapter.prototype.play = function () {};
  EmbedAdapter.prototype.pause = function () {};
  EmbedAdapter.prototype.seek = function () {};
  EmbedAdapter.prototype.getTime = function () { return 0; };
  EmbedAdapter.prototype.getDuration = function () { return 0; };
  EmbedAdapter.prototype.isPaused = function () { return false; };
  EmbedAdapter.prototype.setVolume = function () {};
  EmbedAdapter.prototype.mute = function () {};
  EmbedAdapter.prototype.destroy = function () {
    this.destroyed = true;
    this.host.innerHTML = '';
    this.el = null;
  };

  /* ---------- фабрика ---------- */

  function create(host, video, opts) {
    opts = opts || {};
    host.innerHTML = '';
    var v = video || { kind: 'youtube', ref: '' };

    if (v.kind === 'embed') {
      var parsed = parseEmbed(v.ref);
      if (!parsed.url) return new BrokenAdapter(host, 'Не указана ссылка на плеер.');
      // прямая ссылка на видеофайл — играем её как обычный файл
      if (parsed.directVideo) {
        return new VideoAdapter(host, parsed.url, {
          volume: opts.volume,
          resume: opts.resume,
          clipStart: Number(v.clipStart) || 0,
          clipEnd: Number(v.clipEnd) || 0
        });
      }
      if (!/^https?:\/\//i.test(parsed.url) && !/^\.{0,2}\//.test(parsed.url)) {
        return new BrokenAdapter(host,
          'Не похоже на ссылку или код плеера. Вставьте адрес страницы видео, ссылку на встраиваемый плеер ' +
          'или готовый код <iframe>.');
      }
      return new EmbedAdapter(host, parsed.url);
    }

    if (v.kind === 'youtube') {
      var id = youtubeId(v.ref);
      if (!id) { return new BrokenAdapter(host, 'Не удалось распознать ссылку YouTube. Нужен id вида dQw4w9WgXcQ или полная ссылка.'); }
      return new YouTubeAdapter(host, id, opts);
    }

    if (v.kind === 'file') {
      if (!v.ref) return new BrokenAdapter(host, 'Не указан файл видео.');
      if (/^[a-zA-Z]:[\\/]/.test(v.ref) || /^\\\\/.test(v.ref) || /^file:/i.test(v.ref)) {
        return new BrokenAdapter(host,
          'Это путь к файлу на компьютере — браузер не может открыть видео по такому пути. ' +
          'Откройте админку и нажмите «Выбрать видео на диске».');
      }
      var clip = {
        clipStart: Number(v.clipStart) || 0,
        clipEnd: Number(v.clipEnd) || 0
      };
      return new VideoAdapter(host, v.ref, {
        volume: opts.volume,
        resume: opts.resume,
        start: opts.start,
        poster: opts.poster,
        clipStart: clip.clipStart,
        clipEnd: clip.clipEnd
      });
    }
    if (v.kind === 'embed') {
      if (!v.ref || !/^https?:\/\//i.test(v.ref)) return new BrokenAdapter(host, 'Не указана ссылка на embed-плеер.');
      return new EmbedAdapter(host, v.ref);
    }
    return new BrokenAdapter(host, 'Неизвестный тип видео: ' + v.kind);
  }

  function BrokenAdapter(host, message) {
    this.kind = 'broken';
    this.supportsControl = false;
    this.handlers = {};
    this.message = message;
    host.innerHTML = '';
    var box = document.createElement('div');
    box.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;color:#9aa6b8;font-size:14px;background:#0b0e13';
    box.textContent = message;
    host.appendChild(box);
  }
  BrokenAdapter.prototype._emit = YouTubeAdapter.prototype._emit;
  BrokenAdapter.prototype.on = YouTubeAdapter.prototype.on;
  BrokenAdapter.prototype.off = YouTubeAdapter.prototype.off;
  BrokenAdapter.prototype.play = function () {};
  BrokenAdapter.prototype.pause = function () {};
  BrokenAdapter.prototype.seek = function () {};
  BrokenAdapter.prototype.getTime = function () { return 0; };
  BrokenAdapter.prototype.getDuration = function () { return 0; };
  BrokenAdapter.prototype.isPaused = function () { return true; };
  BrokenAdapter.prototype.setVolume = function () {};
  BrokenAdapter.prototype.mute = function () {};
  BrokenAdapter.prototype.destroy = function () { host.innerHTML = ''; };

  /* Переход по таймкоду во встроенном плеере: пробуем параметр времени,
     который понимает конкретный хостинг. Если не понимает — просто открываем. */
  function embedUrlAtTime(url, sec) {
    var u;
    try { u = new URL(url, location.href); } catch (e) { return url; }
    sec = Math.floor(Math.max(0, sec || 0));
    var host = u.hostname.replace(/^www\./, '');

    if (/rutube\.ru$/.test(host)) {
      if (!u.searchParams.has('t')) u.searchParams.set('t', String(sec));
      return u.toString();
    }
    if (/(^|\.)vk\.com$|(^|\.)vkvideo\.ru$/.test(host)) {
      if (!u.searchParams.has('t')) u.searchParams.set('t', sec + 's');
      return u.toString();
    }
    if (/youtube\.com$|youtu\.be$|youtube-nocookie\.com$/.test(host)) {
      if (!u.searchParams.has('start')) u.searchParams.set('start', String(sec));
      return u.toString();
    }
    return url;
  }

  /* Разбирает вставленное «как есть»: код iframe с сайта, голую ссылку
     на плеер или прямую ссылку на видеофайл. Возвращает {url, host, directVideo}. */
  function parseEmbed(text) {
    var s = String(text || '').trim();
    var out = { url: '', host: '', directVideo: false };
    if (!s) return out;

    var m = /<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(s) ||
            /<embed[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(s) ||
            /<source[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(s) ||
            /<video[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(s);
    var url = m ? m[1] : s;
    url = url.trim();

    if (/^\/\//.test(url)) url = 'https:' + url;
    if (!/^https?:\/\//i.test(url) && !/^\.{0,2}\//.test(url)) {
      // ссылка без схемы: www.site.ru/video/1
      if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(url)) url = 'https://' + url;
    }
    out.url = url;

    if (/\.(mp4|webm|m4v|mov|ogv)(\?|#|$)/i.test(url)) out.directVideo = true;

    try {
      out.host = new URL(url, location.href).hostname.replace(/^www\./, '');
    } catch (e) { out.host = ''; }

    return out;
  }

  /* Знакомые хостинги — чтобы подсказать, что вставлять. */
  var EMBED_HOSTS = {
    'rutube.ru': 'Rutube',
    'vk.com': 'VK Видео',
    'vkvideo.ru': 'VK Видео',
    'dailymotion.com': 'Dailymotion',
    'dai.ly': 'Dailymotion',
    'vimeo.com': 'Vimeo',
    'archive.org': 'Archive.org',
    'ok.ru': 'Одноклассники',
    'mail.ru': 'Mail.ru',
    'my.mail.ru': 'Mail.ru',
    'streamable.com': 'Streamable',
    'bitchute.com': 'BitChute',
    'odysee.com': 'Odysee',
    'rumble.com': 'Rumble',
    'dzen.ru': 'Дзен',
    'youtube.com': 'YouTube',
    'youtu.be': 'YouTube'
  };

  function hostLabel(host) {
    if (!host) return '';
    if (EMBED_HOSTS[host]) return EMBED_HOSTS[host];
    var parts = host.split('.');
    if (parts.length > 2) {
      var two = parts.slice(-2).join('.');
      if (EMBED_HOSTS[two]) return EMBED_HOSTS[two];
    }
    return host;
  }

  window.Refs = window.Refs || {};
  window.Refs.player = {
    create: create,
    youtubeId: youtubeId,
    embedUrlAtTime: embedUrlAtTime,
    parseEmbed: parseEmbed,
    hostLabel: hostLabel
  };
})();
