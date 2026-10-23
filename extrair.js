/* Extrai linhas de texto visuais de um PDF usando pdf.js
   (mesma lógica usada no navegador e no teste em Node) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EditalExtrair = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function groupIntoLines(items) {
    var lines = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it.str) continue;
      var x = it.transform[4], y = it.transform[5];
      var line = null;
      for (var j = 0; j < lines.length; j++) {
        if (Math.abs(lines[j].y - y) <= 2.5) { line = lines[j]; break; }
      }
      if (!line) { line = { y: y, items: [] }; lines.push(line); }
      line.items.push({ x: x, w: it.width || 0, s: it.str });
    }
    lines.sort(function (a, b) { return b.y - a.y; });
    var out = [];
    for (var k = 0; k < lines.length; k++) {
      var L = lines[k];
      L.items.sort(function (a, b) { return a.x - b.x; });
      var s = '';
      var prevEnd = null;
      for (var t = 0; t < L.items.length; t++) {
        var item = L.items[t];
        if (prevEnd !== null && item.x - prevEnd > 1.0) s += ' ';
        s += item.s;
        prevEnd = item.x + item.w;
      }
      out.push(s);
    }
    return out;
  }

  function extractLines(pdfjsLib, data, onProgress, opts) {
    var params = { data: data, isEvalSupported: false, disableFontFace: true };
    if (opts && opts.standardFontDataUrl) params.standardFontDataUrl = opts.standardFontDataUrl;
    if (opts && opts.cMapUrl) {
      params.cMapUrl = opts.cMapUrl;
      params.cMapPacked = true;
    }
    var task = pdfjsLib.getDocument(params);
    return task.promise.then(function (doc) {
      var chain = Promise.resolve();
      var all = [];
      var n = doc.numPages;
      var p = 0;
      function next() {
        p++;
        if (p > n) {
          return doc.destroy().then(function () { return all; });
        }
        return doc.getPage(p).then(function (page) {
          return page.getTextContent().then(function (tc) {
            var lines = groupIntoLines(tc.items);
            for (var i = 0; i < lines.length; i++) all.push(lines[i]);
            if (onProgress) onProgress(p, n);
            try { page.cleanup(); } catch (e) { /* ignora */ }
          });
        }).then(next);
      }
      return next();
    });
  }

  return { extractLines: extractLines, groupIntoLines: groupIntoLines };
});
