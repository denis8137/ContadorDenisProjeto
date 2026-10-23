const fs = require('fs');
const path = require('path');
const pdfjs = require('./lib/pdf.min.js');
const extrair = require('./extrair.js');
const parser = require('./parser.js');

const opts = {
  standardFontDataUrl: path.join(__dirname, 'lib', 'standard_fonts') + path.sep,
  cMapUrl: path.join(__dirname, 'lib', 'cmaps') + path.sep
};

(async () => {
  const dir = path.join(__dirname, '..', 'pdfs-exemplo');
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf'));
  for (const f of files) {
    const t0 = Date.now();
    const data = new Uint8Array(fs.readFileSync(path.join(dir, f)));
    const lines = await extrair.extractLines(pdfjs, data, (p, n) => {
      if (p % 200 === 0 || p === n) process.stdout.write(`\r  extraindo ${p}/${n} paginas `);
    }, opts);
    process.stdout.write('\r');
    const res = parser.parse(lines);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n${f}`);
    console.log(`  total=${res.total}  locais=${res.locais.length}  modo=${res.modo}  falhou=${res.falhou || 0}  (${secs}s, ${lines.length} linhas)`);
    (res.falhouLinhas || []).slice(0, 5).forEach(l => console.log(`  FAIL: ${l.slice(0, 75)}`));
    const show = process.env.TUDO ? res.locais : res.locais.slice(0, 10);
    show.forEach(l => console.log(`  ${String(l.alunos).padStart(6)}  ${String(l.nome || l.local).slice(0, 70)}`));
    const sum = res.locais.reduce((a, l) => a + l.alunos, 0);
    console.log(`  soma dos locais = ${sum}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
