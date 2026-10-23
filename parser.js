/* Contador de alunos por local de prova - parser de editais
   Recebe as linhas de texto do PDF e devolve { locais, total }.
   Não guarda nomes nem CPF: apenas contagem por local. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EditalParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CODE_RE = /\b([A-Z]{1,3}-\d{3,4})\b/;
  var REC5 = /^\d{5}(?!\d)/;
  var REC7 = /^\d{7}(?!\d)/;
  var CPFH = /[#\d]{3}\.[#\d]{3}\.[#\d]{3}-[#\d]{2}/;
  var PERIODO_RE = /PER[ÍI]ODO\s+([IVX]+)\s*-\s*(.+)/;
  var FOOTER_RE = /P[Áa]gina\s+\d+\s+de\s+\d+/gi;
  var HEADS = ['SECRETARIA', 'AUTARQUIA', 'CONCURSO P', 'ORGANIZA', 'LOCAIS DE PROVAS', 'EDITAL N'];

  function cleanLine(l) {
    return String(l).replace(FOOTER_RE, '').replace(/\s+/g, ' ').trim();
  }

  function isJunk(l) {
    if (!l) return true;
    for (var i = 0; i < HEADS.length; i++) if (l.indexOf(HEADS[i]) === 0) return true;
    return false;
  }

  function cleanLines(rawLines) {
    var out = [];
    for (var i = 0; i < rawLines.length; i++) {
      var l = cleanLine(rawLines[i]);
      if (!isJunk(l)) out.push(l);
    }
    return out;
  }

  /* Alguns PDFs têm fontes com mapeamento quebrado (pdf.js extrai "MANH√").
     Só repara o texto de exibição, e só quando os sinais quebrados aparecem. */
  var GARBLE = /[√∫…¡⁄Õ]/;
  function consertaAcentos(s) {
    if (!s || !GARBLE.test(s)) return s;
    return s
      .replace(/√/g, 'Ã')
      .replace(/∫/g, 'º')
      .replace(/¡/g, 'Á')
      .replace(/…/g, 'É')
      .replace(/⁄/g, 'Ú')
      .replace(/Õ/g, 'Í')
      .replace(/¤/g, 'Ç')
      .replace(/¢/g, 'ç')
      .replace(/ACAD MICO/g, 'ACADÊMICO');
  }

  /* -------- Estratégia A: locais com código (ex.: M-100, T-460) -------- */
  function parseByCode(lines) {
    var counts = {};
    var frags = {};
    var total = 0;
    var recIdx = [];
    var i, n;
    for (i = 0; i < lines.length; i++) if (REC5.test(lines[i])) recIdx.push(i);

    function addFrag(code, frag) {
      if (!frag) return;
      if (!frags[code]) frags[code] = {};
      frags[code][frag] = (frags[code][frag] || 0) + 1;
    }

    function afterLines(from) {
      var res = [];
      for (var j = from + 1; j < lines.length && !REC5.test(lines[j]); j++) {
        if (!CODE_RE.test(lines[j])) res.push(lines[j]);
      }
      return res;
    }

    for (n = 0; n < recIdx.length; n++) {
      i = recIdx[n];
      total++;
      var line = lines[i];
      var m = CODE_RE.exec(line);
      var code, frag;
      if (m) {
        code = m[1];
        frag = line.slice(m.index) + ' ' + afterLines(i).join(' ');
      } else {
        var prevEnd = n > 0 ? recIdx[n - 1] + 1 : 0;
        var nxt = n + 1 < recIdx.length ? recIdx[n + 1] : lines.length;
        var j, found = null, foundIdx = -1;
        for (j = prevEnd; j < i; j++) {
          var mm = CODE_RE.exec(lines[j]);
          if (mm) { found = mm; foundIdx = j; break; }
        }
        if (!found) {
          for (j = i + 1; j < nxt; j++) {
            var m2 = CODE_RE.exec(lines[j]);
            if (m2) { found = m2; foundIdx = j; break; }
          }
        }
        if (!found) continue;
        code = found[1];
        frag = lines[foundIdx].slice(found.index) + ' ' + afterLines(i).join(' ');
      }
      code = code.toUpperCase();
      counts[code] = (counts[code] || 0) + 1;
      addFrag(code, cleanLine(frag));
    }

    var locais = Object.keys(counts).map(function (code) {
      var best = '', bestC = -1;
      var f = frags[code] || {};
      Object.keys(f).forEach(function (k) { if (f[k] > bestC) { bestC = f[k]; best = k; } });
      return { local: code, nome: consertaAcentos(best) || code, alunos: counts[code] };
    });
    return { locais: locais, total: total, modo: 'codigo' };
  }

  /* -------- Estratégia B: locais com "PERÍODO X - ESCOLA" -------- */
  function parseByPeriodo(lines) {
    var recs = [];
    var pending = [];
    var current = null;
    var i, l;

    function cortaSala(s) {
      var c = /\s+SALA\s+\d+/i.exec(s);
      return c ? s.slice(0, c.index) : s;
    }

    for (i = 0; i < lines.length; i++) {
      l = lines[i];
      if (REC7.test(l) && CPFH.test(l)) {
        var m = PERIODO_RE.exec(l);
        if (m) {
          current = { periodo: m[1], loc: cleanLine(cortaSala(m[2])) };
        } else {
          var joined = pending.join(' ');
          var m2 = PERIODO_RE.exec(joined);
          if (m2) {
            current = { periodo: m2[1], loc: cleanLine(cortaSala(joined.slice(m2.index + m2[0].length - m2[2].length))) };
          } else {
            current = null;
            recs.push({ periodo: '', loc: '', falhou: true, linha: l });
            pending = [];
            continue;
          }
        }
        recs.push(current);
        pending = [];
      } else if (PERIODO_RE.test(l)) {
        var mp = PERIODO_RE.exec(l);
        if (current) current = null;
        pending = [l.slice(mp.index)];
      } else if (current) {
        current.loc = cleanLine(current.loc + ' ' + l);
      } else if (pending.length) {
        pending.push(l);
      }
    }

    var byLoc = {};
    var total = 0, falhou = 0;
    var falhouLinhas = [];
    recs.forEach(function (r) {
      total++;
      if (r.falhou || !r.loc) {
        falhou++;
        if (r.linha && falhouLinhas.length < 30) falhouLinhas.push(r.linha);
        return;
      }
      if (!byLoc[r.loc]) byLoc[r.loc] = { loc: r.loc, alunos: 0, periodos: {} };
      byLoc[r.loc].alunos++;
      if (r.periodo) byLoc[r.loc].periodos[r.periodo] = (byLoc[r.loc].periodos[r.periodo] || 0) + 1;
    });

    var locais = mergeSimilar(Object.keys(byLoc).map(function (k) {
      var e = byLoc[k];
      return { local: e.loc, nome: consertaAcentos(e.loc), alunos: e.alunos, periodos: e.periodos };
    }));
    return { locais: locais, total: total, falhou: falhou, falhouLinhas: falhouLinhas, modo: 'periodo' };
  }

  /* Junta variantes pequenas de um mesmo local (ex.: nome + pedaço de página quebrada) */
  function mergeSimilar(locais) {
    locais.sort(function (a, b) { return b.alunos - a.alunos; });
    var out = [];
    var used = {};
    for (var i = 0; i < locais.length; i++) {
      if (used[i]) continue;
      var big = locais[i];
      for (var j = i + 1; j < locais.length; j++) {
        if (used[j]) continue;
        var small = locais[j];
        if (small.alunos > Math.max(5, big.alunos * 0.05)) continue;
        if (isSubsequence(tokens(big.local), tokens(small.local))) {
          big.alunos += small.alunos;
          Object.keys(small.periodos || {}).forEach(function (p) {
            big.periodos[p] = (big.periodos[p] || 0) + small.periodos[p];
          });
          used[j] = true;
        }
      }
      out.push(big);
    }
    return out;
  }

  function tokens(s) {
    return s.toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/);
  }

  function isSubsequence(a, b) {
    if (a.length < 2 || a.length >= b.length) return false;
    var i = 0;
    for (var j = 0; j < b.length && i < a.length; j++) if (a[i] === b[j]) i++;
    return i === a.length;
  }

  /* -------- Função principal -------- */
  function parse(rawLines) {
    var lines = cleanLines(rawLines);
    var a = parseByCode(lines);
    var b = parseByPeriodo(lines);
    var res = a.total >= b.total ? a : b;
    res.locais.sort(function (x, y) { return y.alunos - x.alunos || String(x.local).localeCompare(String(y.local)); });
    return res;
  }

  return { parse: parse, _parseByCode: parseByCode, _parseByPeriodo: parseByPeriodo };
});
