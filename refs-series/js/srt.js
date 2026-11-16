/* Импорт .srt / .vtt → черновики пояснений.
   Не претендует на полный парсер формата: понимает обычные файлы с
   нумерованными блоками и таймкодами с запятой или точкой. */
(function () {
  'use strict';

  function parseTimecode(s) {
    // 00:01:23,450  |  00:01:23.450  |  01:23.450
    var m = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/.exec(String(s).trim());
    if (!m) return null;
    var h = Number(m[1] || 0);
    return h * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number((m[4] + '00').slice(0, 3)) / 1000;
  }

  function stripTags(s) {
    return String(s || '')
      .replace(/<\/?[^>]+>/g, '')   // <i>, <b>, <font ...>
      .replace(/\{\\[^}]*\}/g, '')  // ASS-теги на всякий случай
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  /* Возвращает [{t, dur, text}] */
  function parse(text) {
    var src = String(text || '').replace(/\r\n?/g, '\n').replace(/^﻿/, '');
    var blocks = src.split(/\n{2,}/);
    var out = [];
    var prevEnd = null;

    blocks.forEach(function (block) {
      var lines = block.split('\n').filter(function (l) { return l.trim() !== ''; });
      if (!lines.length) return;
      if (/^WEBVTT/i.test(lines[0])) { lines.shift(); }

      var idx = -1;
      for (var i = 0; i < lines.length; i++) {
        if (/-->/.test(lines[i])) { idx = i; break; }
      }
      if (idx < 0) return;

      var parts = lines[idx].split('-->');
      var start = parseTimecode(parts[0]);
      var end = parseTimecode(parts[1] || '');
      if (start == null) return;

      var body = lines.slice(idx + 1).map(stripTags).join('\n').trim();
      if (!body) return;

      var dur = (end != null && end > start) ? Math.min(60, end - start) : 6;
      out.push({ t: Math.round(start * 1000) / 1000, dur: Math.max(1, Math.round(dur * 10) / 10), text: body });
      prevEnd = end;
    });

    return out;
  }

  window.Refs = window.Refs || {};
  window.Refs.srt = { parse: parse, parseTimecode: parseTimecode };
})();
