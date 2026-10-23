(function () {
  'use strict';

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

  var OPCOES_PDF = {
    standardFontDataUrl: 'lib/standard_fonts/',
    cMapUrl: 'lib/cmaps/'
  };

  var dropzone = document.getElementById('dropzone');
  var inputArquivo = document.getElementById('arquivo');
  var progresso = document.getElementById('progresso');
  var progressoTexto = document.getElementById('progressoTexto');
  var barra = document.getElementById('barra');
  var erroBox = document.getElementById('erro');
  var resumo = document.getElementById('resumo');
  var ferramentas = document.getElementById('ferramentas');
  var tabelaCaixa = document.getElementById('tabelaCaixa');
  var corpo = document.getElementById('corpo');
  var busca = document.getElementById('busca');

  var resultadoAtual = null;
  var arquivoAtual = '';

  dropzone.addEventListener('click', function () { inputArquivo.click(); });
  inputArquivo.addEventListener('change', function () {
    if (inputArquivo.files.length) analisar(inputArquivo.files[0]);
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove('over'); });
  });
  dropzone.addEventListener('drop', function (e) {
    var f = e.dataTransfer.files[0];
    if (f) analisar(f);
  });

  document.getElementById('btnNovo').addEventListener('click', function () {
    inputArquivo.value = '';
    resumo.classList.remove('ativo');
    ferramentas.classList.remove('ativo');
    tabelaCaixa.classList.remove('ativo');
    erroBox.classList.remove('ativo');
    dropzone.scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('btnCsv').addEventListener('click', baixarCsv);
  document.getElementById('btnImprimir').addEventListener('click', function () { window.print(); });
  busca.addEventListener('input', function () { if (resultadoAtual) renderTabela(resultadoAtual.locais); });

  function mostrarErro(msg) {
    erroBox.textContent = msg;
    erroBox.classList.add('ativo');
    progresso.classList.remove('ativo');
  }

  function analisar(file) {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      mostrarErro('Escolha um arquivo PDF.');
      return;
    }
    erroBox.classList.remove('ativo');
    resumo.classList.remove('ativo');
    ferramentas.classList.remove('ativo');
    tabelaCaixa.classList.remove('ativo');
    progresso.classList.add('ativo');
    barra.style.width = '0%';
    arquivoAtual = file.name.replace(/\.pdf$/i, '');
    dropzone.scrollIntoView({ behavior: 'smooth' });

    var leitor = new FileReader();
    leitor.onerror = function () { mostrarErro('Não consegui ler o arquivo.'); };
    leitor.onload = function () {
      var dados = new Uint8Array(leitor.result);
      try { processar(dados); }
      catch (e) { console.error(e); mostrarErro('Erro inesperado ao analisar: ' + (e && e.message ? e.message : e)); }
    };
    leitor.readAsArrayBuffer(file);
  }

  function processar(dados) {
    var t0 = Date.now();
    progressoTexto.textContent = 'Lendo o PDF...';
      EditalExtrair.extractLines(pdfjsLib, dados, function (pag, totalPag) {
      barra.style.width = Math.round((pag / totalPag) * 90) + '%';
      progressoTexto.textContent = 'Lendo o PDF... página ' + pag + ' de ' + totalPag;
    }, OPCOES_PDF).then(function (linhas) {
      progressoTexto.textContent = 'Contando alunos por escola...';
      barra.style.width = '95%';
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(linhas); }, 30);
      });
    }).then(function (linhas) {
      var res = EditalParser.parse(linhas);
      var segs = ((Date.now() - t0) / 1000).toFixed(1).replace('.', ',');
      barra.style.width = '100%';
      progressoTexto.textContent = 'Pronto! ' + res.total + ' inscrições em ' + res.locais.length + ' locais (' + segs + 's)';
      setTimeout(function () { progresso.classList.remove('ativo'); }, 900);
      mostrarResultado(res);
    }).catch(function (e) {
      console.error(e);
      var msg = 'Não consegui analisar o PDF.';
      if (e && e.name === 'PasswordException') msg = 'Este PDF está protegido por senha.';
      else if (e && e.message) msg += ' (' + e.message + ')';
      mostrarErro(msg);
    });
  }

  function mostrarResultado(res) {
    resultadoAtual = res;
    document.getElementById('totalAlunos').textContent = res.total.toLocaleString('pt-BR');
    document.getElementById('totalLocais').textContent = res.locais.length.toLocaleString('pt-BR');
    document.getElementById('maiorLocal').textContent = res.locais.length
      ? truncar(res.locais[0].nome, 26)
      : '-';
    resumo.classList.add('ativo');
    ferramentas.classList.add('ativo');
    tabelaCaixa.classList.add('ativo');
    busca.value = '';
    renderTabela(res.locais);
    resumo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function truncar(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function renderTabela(locais) {
    var filtro = busca.value.trim().toUpperCase();
    var lista = locais;
    if (filtro) {
      lista = locais.filter(function (l) { return l.nome.toUpperCase().indexOf(filtro) >= 0; });
    }
    var max = locais.length ? locais[0].alunos : 1;
    var html = '';
    for (var i = 0; i < lista.length; i++) {
      var l = lista[i];
      var pos = locais.indexOf(l) + 1;
      var pct = Math.max(2, Math.round((l.alunos / max) * 100));
      var per = '';
      if (l.periodos) {
        var partes = Object.keys(l.periodos).sort().map(function (p) { return 'Período ' + p + ': ' + l.periodos[p]; });
        if (partes.length) per = '<span class="periodo-tag">' + partes.join(' · ') + '</span>';
      }
      html += '<tr>' +
        '<td class="pos">' + pos + '</td>' +
        '<td>' + escapar(l.nome) + per + '</td>' +
        '<td class="dir qtd">' + l.alunos.toLocaleString('pt-BR') + '</td>' +
        '<td class="barra-cel"><div class="mini-barra"><div style="width:' + pct + '%"></div></div></td>' +
        '</tr>';
    }
    if (!lista.length) html = '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Nenhuma escola encontrada com esse filtro.</td></tr>';
    corpo.innerHTML = html;
  }

  function escapar(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function baixarCsv() {
    if (!resultadoAtual) return;
    var linhasCsv = ['Posicao;Local;Alunos'];
    resultadoAtual.locais.forEach(function (l, i) {
      linhasCsv.push((i + 1) + ';"' + l.nome.replace(/"/g, '""') + '";' + l.alunos);
    });
    linhasCsv.push('');
    linhasCsv.push(';;');
    linhasCsv.push('TOTAL;' + resultadoAtual.total);
    var blob = new Blob(['﻿' + linhasCsv.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = arquivoAtual + '-alunos-por-escola.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }
})();
