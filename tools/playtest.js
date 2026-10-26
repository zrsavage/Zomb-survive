const { chromium } = require('playwright'); const fs = require('fs');
const src = fs.readFileSync(__dirname + '/aibot.js', 'utf8');
const configs = JSON.parse(process.argv[2]); const out = process.argv[3]; const conc = +(process.argv[4] || 4);
(async () => {
  const b = await chromium.launch(); const results = []; let idx = 0;
  async function worker() {
    while (idx < configs.length) {
      const cfg = configs[idx++];
      const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
      const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); 
      await p.goto('file://' + require('path').resolve(__dirname, '..', 'index.html')); await p.addScriptTag({ content: src });
      const t0 = Date.now();
      let r; try { r = await p.evaluate(c => (0, eval)('runAI')(c), cfg); } catch (e) { r = { cfg, crash: String(e).slice(0, 300) }; }
      r.pageErrs = errs; r.ms = Date.now() - t0; results.push(r); await p.close();
      console.log(JSON.stringify({ cfg: cfg.name, t: r.t, over: r.over, why: r.why, hordes: r.hordes, beat: r.beaten, kills: r.kills, lvl: r.level, ppl: r.people, mem: r.memorial, towns: r.towns, errs: (r.errors || []).length + errs.length, ms: r.ms }));
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));
  fs.writeFileSync(out, JSON.stringify(results));
  await b.close();
})();
