/* Работа с GitHub Contents API из браузера.
   Храним только то, что нужно одному редактору: содержимое data.json и
   бинарные файлы (видео, постеры) через обычный PUT contents. */
(function () {
  'use strict';

  var API = 'https://api.github.com';

  function cfg() {
    try {
      return JSON.parse(localStorage.getItem('refs.github') || 'null');
    } catch (e) { return null; }
  }

  function saveCfg(c) {
    localStorage.setItem('refs.github', JSON.stringify(c));
  }

  function clearCfg() {
    localStorage.removeItem('refs.github');
  }

  function headers(token) {
    return {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function encPath(path) {
    return String(path).split('/').map(encodeURIComponent).join('/');
  }

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    var CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }

  function base64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result || '');
        var comma = s.indexOf(',');
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      fr.onerror = function () { reject(fr.error || new Error('Не удалось прочитать файл')); };
      fr.readAsDataURL(file);
    });
  }

  function apiError(res, body) {
    var msg = 'GitHub: HTTP ' + res.status;
    if (body && body.message) msg += ' — ' + body.message;
    if (res.status === 401) msg += ' (проверьте токен)';
    if (res.status === 403) msg += ' (нет прав Contents: Read and write?)';
    if (res.status === 404) msg += ' (проверьте владельца, имя репозитория и ветку)';
    if (res.status === 409 || (body && /sha/i.test(body.message || ''))) msg += ' (файл изменён кем-то ещё, перечитайте)';
    var err = new Error(msg);
    err.status = res.status;
    err.body = body;
    return err;
  }

  var GH = {
    cfg: cfg,
    saveCfg: saveCfg,
    clearCfg: clearCfg,

    /* Проверка доступа и заодно — есть ли Pages. */
    test: function (c) {
      return fetch(API + '/repos/' + c.owner + '/' + c.repo, { headers: headers(c.token) })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            if (!res.ok) throw apiError(res, body);
            return {
              fullName: body.full_name,
              private: !!body.private,
              permissions: body.permissions || {},
              defaultBranch: body.default_branch,
              pagesUrl: body.has_pages ? ('https://' + c.owner + '.github.io/' + c.repo + '/') : null
            };
          });
        });
    },

    /* Читает файл: { text, sha } либо null, если файла нет. */
    get: function (c, path) {
      var url = API + '/repos/' + c.owner + '/' + c.repo + '/contents/' + encPath(path) +
        '?ref=' + encodeURIComponent(c.branch || 'main') + '&t=' + Date.now();
      return fetch(url, { headers: headers(c.token), cache: 'no-store' })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            if (res.status === 404) return null;
            if (!res.ok) throw apiError(res, body);
            if (Array.isArray(body)) throw new Error('Это папка, а не файл: ' + path);
            var text = body.encoding === 'base64' ? base64ToUtf8(body.content || '') : (body.content || '');
            return { text: text, sha: body.sha, size: body.size };
          });
        });
    },

    /* Запись текста. Если sha не передан — создаёт файл, иначе обновляет. */
    putText: function (c, path, text, message, sha) {
      var url = API + '/repos/' + c.owner + '/' + c.repo + '/contents/' + encPath(path);
      var payload = {
        message: message || ('Update ' + path),
        content: utf8ToBase64(text),
        branch: c.branch || 'main'
      };
      if (sha) payload.sha = sha;
      return fetch(url, {
        method: 'PUT',
        headers: headers(c.token),
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok) throw apiError(res, body);
          return body;
        });
      });
    },

    /* Загружает бинарный файл (< 95 МБ). Возвращает {path, url, sha}. */
    putFile: function (c, path, file, message, onProgress) {
      var LIMIT = 95 * 1024 * 1024;
      if (file.size > LIMIT) {
        return Promise.reject(new Error(
          'Файл больше 95 МБ (' + (file.size / 1048576).toFixed(1) + ' МБ). GitHub не примет такой файл: ' +
          'загрузите его на YouTube как «доступно по ссылке» или на archive.org и вставьте ссылку в поле «Видео».'
        ));
      }
      if (onProgress) onProgress(0.1);
      return fileToBase64(file).then(function (b64) {
        if (onProgress) onProgress(0.4);
        var url = API + '/repos/' + c.owner + '/' + c.repo + '/contents/' + encPath(path);
        var payload = { message: message || ('Add ' + path), content: b64, branch: c.branch || 'main' };
        return fetch(url, { method: 'PUT', headers: headers(c.token), body: JSON.stringify(payload) })
          .then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (body) {
              if (onProgress) onProgress(0.9);
              if (!res.ok) throw apiError(res, body);
              if (onProgress) onProgress(1);
              return { path: path, sha: body.content && body.content.sha };
            });
          });
      });
    },

    /* Публичный URL файла из репозитория (для <video src>). */
    rawUrl: function (c, path) {
      return 'https://raw.githubusercontent.com/' + c.owner + '/' + c.repo + '/' +
        encodeURIComponent(c.branch || 'main') + '/' + encPath(path);
    },

    /* Ссылка на опубликованный сайт (GitHub Pages project page). */
    pagesUrl: function (c) {
      return 'https://' + c.owner + '.github.io/' + c.repo + '/';
    }
  };

  window.Refs = window.Refs || {};
  window.Refs.github = GH;
})();
