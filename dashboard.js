'use strict';
/* Salivalmentaja – dashboard (ulkoasu A · Valmentaja). Laskee kaiken data.sarjat / data.liikkeet -taulukoista. */

const DB = (() => {
  const TAVOITTEET = [
    { liike: 'Takakyykky', nimi: 'Kyykky', kg: 180 },
    { liike: 'Penkkipunnerrus', nimi: 'Penkki', kg: 120 },
  ];
  const PAA = [
    { liike: 'Takakyykky', lyhyt: 'Kyykky', lo: 4, hi: 6, inc: 5 },
    { liike: 'Penkkipunnerrus', lyhyt: 'Penkki', lo: 4, hi: 6, inc: 2.5 },
    { liike: 'Pystypunnerrus tangolla', lyhyt: 'Pysty', lo: 6, hi: 8, inc: 2.5 },
  ];
  const EHDOTUKSET = {
    'Selkä': ['Ylätalja', 'Kulmasoutu tangolla', 'Yhden käden käsipainosoutu'],
    'Takareidet': ['Suorin jaloin maastaveto', 'Takareisilaite', 'Nordic hamstring curl'],
    'Etureidet': ['Bulgarialainen kyykky', 'Etukyykky', 'Etureisilaite'],
    'Rinta': ['Penkkipunnerrus käsipainoilla', 'Vinopenkki käsipainoilla', 'Dippi'],
    'Olkapäät': ['Pystypunnerrus käsipainoilla', 'Olkapäät 3-suuntaan (vipunostot)', 'Face pull taljassa'],
    'Hauis': ['Hauiskääntö käsipainoilla', 'Hauiskääntö mutkatangolla', 'Vasarakääntö'],
    'Ojentajat': ['Ojentajat taljassa', 'Kapea penkkipunnerrus', 'Dippi'],
    'Keskivartalo': ['Kyljet tangolla', 'Ab wheel -rullaus', 'Pallof press taljassa'],
    'Alaselkä': ['Alaselkä kulmassa', 'Good morning', 'Lintukoira'],
    'Lonkan loitontajat': ['Lonkan loitonnus laitteessa', 'Sivuttaiskävely kuminauhalla', 'Kylkilankku jalan nostolla'],
    'Lonkan lähentäjät': ['Lonkan lähennys laitteessa', 'Copenhagen-lankku', 'Sumokyykky'],
  };
  const KUUT = ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'];

  let suodatin = 'Kaikki';
  let ryhma = null;

  /* ---------- apurit ---------- */
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n1 = x => (Math.round(x * 10) / 10).toLocaleString('fi-FI');
  const kg = x => (Math.round(x * 4) / 4).toLocaleString('fi-FI');
  const ms = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const pv = (a, b) => Math.round((ms(b) - ms(a)) / 864e5);
  const lisaaPv = (iso, n) => new Date(ms(iso) + n * 864e5).toISOString().slice(0, 10);
  const dm = iso => { const [, m, d] = iso.split('-'); return `${+d}.${+m}.`; };
  const pyor = (x, s = 2.5) => Math.round(x / s) * s;

  function malli(liike) { return (data.liikkeet.find(l => l.liike === liike) || {}); }

  /* ---------- perusjoukot ---------- */
  function laske() {
    const tanaan = new Date().toLocaleDateString('sv-SE');
    const S = data.sarjat.filter(s => s.pvm && s.pvm <= tanaan);
    const huippu = new Map();
    for (const s of S) if (!s.lampo && s.paino != null) {
      const k = s.pvm + '|' + s.liike;
      huippu.set(k, Math.max(huippu.get(k) ?? -1, s.paino));
    }
    const tyo = s => !s.lampo && s.toistot >= 2 && s.paino != null && s.paino >= 0.85 * (huippu.get(s.pvm + '|' + s.liike) ?? 0);
    const e1 = s => (!s.lampo && !s.epaonn && !s.autettu && s.paino > 0 && s.toistot >= 1 && s.toistot <= 12) ? s.paino * (1 + s.toistot / 30) : null;
    const paivat = [...new Set(S.map(s => s.pvm))].sort();
    return { tanaan, S, tyo, e1, paivat };
  }

  function sessiot(L, liike) {
    const m = new Map();
    for (const s of L.S) if (s.liike === liike) { if (!m.has(s.pvm)) m.set(s.pvm, []); m.get(s.pvm).push(s); }
    return [...m].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([pvm, ss]) => {
      const tyo = ss.filter(L.tyo);
      const raskain = tyo.length ? Math.max(...tyo.map(s => s.paino)) : null;
      const parhaat = tyo.filter(s => s.paino === raskain).map(s => s.toistot);
      return { pvm, ss, tyo, raskain, toistot: parhaat.length ? Math.max(...parhaat) : null, lkmRaskain: parhaat.length, parhaatLista: parhaat };
    });
  }

  /* Tuplaprogressio: palauttaa {paino, toistot, teksti, tyyppi} */
  function suositus(L, liike) {
    const cfg = PAA.find(p => p.liike === liike);
    const mm = malli(liike).malli || '';
    const ala = /Kyykky|Saranaliike|Yhden jalan/.test(mm);
    const [lo, hi] = cfg ? [cfg.lo, cfg.hi]
      : mm === 'Eristävä' ? [10, 15] : mm === 'Räjähtävä' ? [3, 5] : ala ? [6, 10] : [8, 12];
    const inc = cfg ? cfg.inc : (ala ? 5 : 2.5);
    const ss = sessiot(L, liike).filter(s => s.raskain != null);
    if (!ss.length) return null;
    const v = ss[ss.length - 1];
    const tauko = pv(v.pvm, L.tanaan);
    const w = v.raskain;
    if (w === 0) {
      const t = Math.min(hi, (v.toistot || lo) + 1);
      return { paino: 0, toistot: String(t), teksti: `3×${t} omalla painolla`, tyyppi: 'pida', tauko };
    }
    if (tauko > 21) {
      const p = pyor(w * 0.9);
      return { paino: p, toistot: `${lo}–${hi}`, teksti: `paluu ${tauko} pv tauon jälkeen: ${kg(p)} kg × ${lo}–${hi}`, tyyppi: 'paluu', tauko };
    }
    const riittavat = v.parhaatLista.filter(r => r >= lo).length;
    if (v.toistot >= hi && riittavat >= 2) {
      return { paino: w + inc, toistot: `${lo}–${hi}`, teksti: `Nosta: ${kg(w + inc)} kg × ${lo}–${hi}`, tyyppi: 'nosta', tauko };
    }
    const t = Math.min(hi, Math.max(lo, v.toistot + 1));
    return { paino: w, toistot: String(t), teksti: `Pidä ${kg(w)} kg, tavoite ${t} toistoa`, tyyppi: 'pida', tauko };
  }

  /* ---------- lihasryhmät ---------- */
  function ryhmat(L) {
    const raja28 = lisaaPv(L.tanaan, -28), raja365 = lisaaPv(L.tanaan, -365);
    const r = new Map();
    for (const s of L.S) {
      if (!L.tyo(s)) continue;
      const g = malli(s.liike).ryhma || 'Muu';
      if (!r.has(g)) r.set(g, { nimi: g, n28: 0, n365: 0, viim: s.pvm });
      const o = r.get(g);
      if (s.pvm > raja28) o.n28++;
      if (s.pvm > raja365) o.n365++;
      if (s.pvm > o.viim) o.viim = s.pvm;
    }
    return [...r.values()].filter(o => o.n365 > 0 && o.nimi !== 'Muu')
      .map(o => ({ ...o, vk: o.n28 / 4, pv: pv(o.viim, L.tanaan) }))
      .sort((a, b) => b.vk - a.vk || a.pv - b.pv);
  }

  function useinTehty(L, g) {
    const raja = lisaaPv(L.tanaan, -365), c = new Map();
    for (const s of L.S) if (s.pvm > raja && L.tyo(s) && malli(s.liike).ryhma === g && malli(s.liike).malli !== 'Räjähtävä') c.set(s.liike, (c.get(s.liike) || 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1]).map(x => x[0])[0];
  }

  /* ---------- SVG-kaaviot ---------- */
  function renkaat(L) {
    return TAVOITTEET.map(t => {
      const raja90 = lisaaPv(L.tanaan, -90), raja180 = lisaaPv(L.tanaan, -180);
      let nyt = 0, ed = 0, viimeisin = 0;
      for (const s of L.S) if (s.liike === t.liike) {
        const v = L.e1(s); if (v == null) continue;
        viimeisin = v;
        if (s.pvm > raja90) nyt = Math.max(nyt, v); else if (s.pvm > raja180) ed = Math.max(ed, v);
      }
      const taso = Math.round(nyt || viimeisin);
      const pct = Math.min(100, Math.round(taso / t.kg * 100));
      const muutos = nyt && ed ? Math.round(nyt - ed) : null;
      const dash = (pct / 100 * 351.9).toFixed(1);
      const muutosTxt = muutos == null ? '<span class="mut">ei vertailua</span>'
        : muutos > 0 ? `<span class="hyva">+${muutos} kg / 3 kk</span>` : muutos < 0 ? `<span class="huono">${muutos} kg / 3 kk</span>` : '<span class="mut">±0 kg / 3 kk</span>';
      return `<div class="kortti rengas">
        <svg width="136" height="136" viewBox="0 0 136 136" role="img" aria-label="${t.nimi} ${pct} % tavoitteesta ${t.kg} kg">
          <circle cx="68" cy="68" r="56" fill="none" stroke="#2B2F36" stroke-width="13"/>
          <circle cx="68" cy="68" r="56" fill="none" stroke="var(--acc)" stroke-width="13" stroke-linecap="round" stroke-dasharray="${dash} 352" transform="rotate(-90 68 68)"/>
          <text x="68" y="74" text-anchor="middle" font-size="32" font-weight="800" fill="#E9EAEC">${pct}%</text>
          <text x="68" y="94" text-anchor="middle" font-size="12" fill="#9097A3">${taso} / ${t.kg}</text>
        </svg>
        <b>${t.nimi}</b>
        <div class="pieni">puuttuu ${Math.max(0, t.kg - taso)} kg<br>${muutosTxt}</div>
      </div>`;
    }).join('');
  }

  function treenimaara(L) {
    const pisteet = [];
    for (let i = 52; i >= 0; i--) {
      const loppu = lisaaPv(L.tanaan, -7 * i), alku = lisaaPv(loppu, -28);
      pisteet.push({ loppu, n: L.paivat.filter(p => p > alku && p <= loppu).length });
    }
    const raja91 = lisaaPv(L.tanaan, -91);
    const ka3 = L.paivat.filter(p => p > raja91).length / 13 * 4;
    const ymax = Math.max(8, Math.ceil(Math.max(...pisteet.map(p => p.n)) / 2) * 2);
    const X0 = 26, X1 = 336, Y0 = 10, Y1 = 100;
    const x = i => X0 + i * (X1 - X0) / (pisteet.length - 1);
    const y = v => Y1 - v / ymax * (Y1 - Y0);
    const viiva = pisteet.map((p, i) => `${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join(' ');
    let ruudukko = '';
    for (let v = 0; v <= ymax; v += 2) ruudukko += `<line x1="${X0 - 2}" y1="${y(v)}" x2="340" y2="${y(v)}" stroke="${v ? '#262A30' : '#3A3F47'}"/><text x="16" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#9097A3">${v}</text>`;
    let kuut = '';
    pisteet.forEach((p, i) => { const k = +p.loppu.slice(5, 7) - 1; if (+p.loppu.slice(8) <= 7 && k % 3 === 0) kuut += `<text x="${x(i).toFixed(0)}" y="120" text-anchor="middle" font-size="11" fill="#9097A3">${KUUT[k]}</text>`; });
    const xa = x(pisteet.length - 14), ya = y(ka3);
    const nyt = pisteet[pisteet.length - 1].n;
    const viim = L.paivat[L.paivat.length - 1];
    return `<div class="kortti">
      <div class="luvut"><div><span class="mut">Nyt</span><b class="acc">${nyt}</b></div><div><span class="mut">3 kk keskiarvo</span><b>${n1(ka3)}</b></div><div><span class="mut">Edellisestä</span><b>${viim ? pv(viim, L.tanaan) + ' pv' : '–'}</b></div></div>
      <svg width="100%" viewBox="0 0 340 128" role="img" aria-label="Liukuva 4 viikon treenimäärä 12 kk, nyt ${nyt}, 3 kk keskiarvo ${n1(ka3)}">
        ${ruudukko}
        <polygon points="${X0},${Y1} ${viiva} ${X1},${Y1}" fill="#2A2215"/>
        <polyline points="${viiva}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round"/>
        <line x1="${xa.toFixed(1)}" y1="${ya.toFixed(1)}" x2="340" y2="${ya.toFixed(1)}" stroke="#B9BEC7" stroke-width="1.5" stroke-dasharray="4 4"/>
        <line x1="${xa.toFixed(1)}" y1="${(ya - 7).toFixed(1)}" x2="${xa.toFixed(1)}" y2="${(ya + 7).toFixed(1)}" stroke="#B9BEC7"/>
        <text x="${(xa - 5).toFixed(1)}" y="${(ya - 3).toFixed(1)}" text-anchor="end" font-size="11" fill="#B9BEC7">3 kk ka. ${n1(ka3)}</text>
        <circle cx="${X1}" cy="${y(nyt).toFixed(1)}" r="4.5" fill="var(--acc)"/>
        ${kuut}
      </svg></div>`;
  }

  function palkit(ss, seur) {
    const kaikki = [...ss.map(s => s.raskain), seur ? seur.paino : null].filter(v => v != null);
    const hi = Math.max(...kaikki), lo = Math.min(...kaikki);
    const base = hi <= 0 ? -1 : Math.max(0, lo - Math.max(10, (hi - lo) * 1.5));
    const BOT = 104, TOP = 22;
    const y = w => hi <= 0 ? TOP + 30 : BOT - (w - base) / (hi - base) * (BOT - TOP);
    const n = ss.length + (seur ? 1 : 0), slot = 340 / Math.max(n, 3), bw = 44;
    let o = '';
    ss.forEach((s, i) => {
      const x = i * slot + (slot - bw) / 2, viim = i === ss.length - 1, yy = y(s.raskain);
      o += `<rect x="${x.toFixed(0)}" y="${yy.toFixed(0)}" width="${bw}" height="${(BOT - yy).toFixed(0)}" rx="6" fill="${viim ? '#E9EAEC' : '#5B616B'}"/>
        <text x="${(x + bw / 2).toFixed(0)}" y="${(yy - 6).toFixed(0)}" text-anchor="middle" font-size="13" font-weight="700" fill="#E9EAEC">${kg(s.raskain)}</text>
        <text x="${(x + bw / 2).toFixed(0)}" y="${BOT - 8}" text-anchor="middle" font-size="12" font-weight="600" fill="${viim ? '#121417' : '#E9EAEC'}">×${s.toistot}</text>
        <text x="${(x + bw / 2).toFixed(0)}" y="${BOT + 18}" text-anchor="middle" font-size="11" fill="#9097A3">${dm(s.pvm)}</text>`;
    });
    if (seur) {
      const x = ss.length * slot + (slot - bw) / 2, yy = y(seur.paino);
      o += `<rect x="${x.toFixed(0)}" y="${yy.toFixed(0)}" width="${bw}" height="${(BOT - yy).toFixed(0)}" rx="6" fill="#2A2215" stroke="var(--acc)" stroke-width="2" stroke-dasharray="5 4"/>
        <text x="${(x + bw / 2).toFixed(0)}" y="${(yy - 6).toFixed(0)}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--acc)">${kg(seur.paino)}</text>
        <text x="${(x + bw / 2).toFixed(0)}" y="${BOT - 8}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--acc)">×${seur.toistot}</text>
        <text x="${(x + bw / 2).toFixed(0)}" y="${BOT + 18}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--acc)">seuraava</text>`;
    }
    return `<svg width="100%" viewBox="0 0 340 130" role="img" aria-label="Raskain työsarja per treeni ja seuraava tavoite">${o}<line x1="0" y1="${BOT}" x2="340" y2="${BOT}" stroke="#2B2F36"/></svg>`;
  }

  function liikekortti(L, p) {
    const kaikki = sessiot(L, p.liike).filter(s => s.raskain != null);
    if (!kaikki.length) return '';
    const raja = lisaaPv(L.tanaan, -183);
    let ss = kaikki.filter(s => s.pvm > raja).slice(-5);
    if (!ss.length) ss = kaikki.slice(-3);
    const v = kaikki[kaikki.length - 1];
    const seur = suositus(L, p.liike);
    const luokka = seur.tyyppi === 'nosta' ? 'pill nosta' : 'pill';
    const ikoni = seur.tyyppi === 'nosta' ? '↑ ' : seur.tyyppi === 'paluu' ? '↺ ' : '→ ';
    return `<div class="kortti">
      <div class="rivi-ots"><b>${e(p.liike)}</b><span class="mut">${dm(v.pvm)} · ${pv(v.pvm, L.tanaan)} pv sitten</span></div>
      <div class="pieni">${v.tyo.map(s => `${kg(s.paino)}×${s.toistot}`).join(' · ')}</div>
      ${palkit(ss, seur)}
      <span class="${luokka}">${ikoni}${e(seur.teksti.replace(/^Nosta: /, 'Nosta: '))}</span>
    </div>`;
  }

  function e1rmKaavio(L, p, iso) {
    const kk = new Map();
    for (const s of L.S) if (s.liike === p.liike) {
      const v = L.e1(s); if (v == null) continue;
      const k = s.pvm.slice(0, 7); kk.set(k, Math.max(kk.get(k) || 0, v));
    }
    const nyt = new Date(L.tanaan);
    const kuukaudet = [];
    for (let i = 17; i >= 0; i--) { const d = new Date(Date.UTC(nyt.getUTCFullYear(), nyt.getUTCMonth() - i, 1)); kuukaudet.push(d.toISOString().slice(0, 7)); }
    const pts = kuukaudet.map((k, i) => ({ i, k, v: kk.get(k) })).filter(o => o.v);
    if (!pts.length) return '';
    const raja12 = kuukaudet[6];
    const max12 = Math.max(...pts.filter(o => o.k >= raja12).map(o => o.v), 0);
    const viim = pts[pts.length - 1];
    let tod = 0;
    const paiv = new Map();
    for (const s of L.S) if (s.liike === p.liike && !s.lampo && !s.epaonn && !s.autettu && s.paino > 0) {
      if (!paiv.has(s.pvm)) paiv.set(s.pvm, []); paiv.get(s.pvm).push(s);
    }
    for (const ss of paiv.values()) {
      const multi = Math.max(0, ...ss.filter(s => s.toistot >= 2).map(s => s.paino));
      for (const s of ss) if (s.toistot === 1 && s.paino > multi) tod = Math.max(tod, s.paino);
    }
    const tav = TAVOITTEET.find(t => t.liike === p.liike);
    const H = iso ? 140 : 90;
    const vals = pts.map(o => o.v).concat(tav ? [tav.kg] : []);
    const hi = Math.max(...vals) + 4, lo = Math.min(...pts.map(o => o.v)) - 6;
    const x = i => 6 + i * (328 / 17), y = v => 8 + (hi - v) / (hi - lo) * (H - 28);
    const viiva = pts.map(o => `${x(o.i).toFixed(1)},${y(o.v).toFixed(1)}`).join(' ');
    const maxPt = pts.filter(o => o.k >= raja12).sort((a, b) => b.v - a.v)[0];
    return `<div class="kortti">
      ${iso ? '' : `<b>${e(p.lyhyt)}</b>`}
      <div class="luvut"><div><span class="mut">Viimeisin</span><b>${Math.round(viim.v)}</b></div><div><span class="mut">Maksimi 12 kk</span><b>${Math.round(max12)}</b></div><div><span class="mut">Todellinen 1RM</span><b>${tod ? kg(tod) : '–'}</b></div></div>
      <svg width="100%" viewBox="0 0 340 ${H}" role="img" aria-label="${e(p.liike)} laskennallinen 1RM 18 kk">
        ${tav ? `<line x1="0" y1="${y(tav.kg).toFixed(1)}" x2="340" y2="${y(tav.kg).toFixed(1)}" stroke="#4CC38A" stroke-dasharray="4 4"/><text x="2" y="${(y(tav.kg) - 5).toFixed(1)}" font-size="11" fill="#4CC38A">tavoite ${tav.kg}</text>` : ''}
        <polyline points="${viiva}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round"/>
        ${maxPt && maxPt !== viim ? `<circle cx="${x(maxPt.i).toFixed(1)}" cy="${y(maxPt.v).toFixed(1)}" r="4" fill="#121417" stroke="var(--acc)" stroke-width="2"/><text x="${x(maxPt.i).toFixed(1)}" y="${(y(maxPt.v) - 9).toFixed(1)}" text-anchor="middle" font-size="11" fill="#E9EAEC">${Math.round(maxPt.v)}</text>` : ''}
        <circle cx="${x(viim.i).toFixed(1)}" cy="${y(viim.v).toFixed(1)}" r="4.5" fill="var(--acc)"/>
        <text x="${(x(viim.i) - 2).toFixed(1)}" y="${(y(viim.v) - 9).toFixed(1)}" text-anchor="end" font-size="11" fill="#E9EAEC">${Math.round(viim.v)}</text>
        <text x="4" y="${H - 4}" font-size="10" fill="#6B7280">${+kuukaudet[0].slice(5)}/${kuukaudet[0].slice(0, 4)}</text>
        <text x="336" y="${H - 4}" text-anchor="end" font-size="10" fill="#6B7280">${+kuukaudet[17].slice(5)}/${kuukaudet[17].slice(0, 4)}</text>
      </svg></div>`;
  }

  /* ---------- suositukset ---------- */
  function suositukset(L, R) {
    const out = [];
    const raja28 = lisaaPv(L.tanaan, -28);
    let tyonto = 0, veto = 0;
    for (const s of L.S) if (s.pvm > raja28 && L.tyo(s)) {
      const m = malli(s.liike).malli || '';
      if (m.startsWith('Työntö')) tyonto++; else if (m.startsWith('Veto')) veto++;
    }
    const PAARYHMAT = ['Selkä', 'Takareidet', 'Etureidet', 'Rinta', 'Olkapäät', 'Hauis', 'Ojentajat'];
    for (const g of R) if (g.pv > 14 && PAARYHMAT.includes(g.nimi)) out.push({ p: g.pv, h: `${g.nimi} ${g.pv} pv tauolla.`, t: g.nimi === 'Selkä' ? `Vetoliikkeitä ${veto} työsarjaa, työntöä ${tyonto} (4 vk).` : `Viimeisin työsarja ${dm(g.viim)}` });
    for (const g of R) if (g.pv <= 14 && g.vk < 1 && ['Selkä', 'Takareidet', 'Etureidet', 'Rinta', 'Olkapäät'].includes(g.nimi))
      out.push({ p: 10, h: `${g.nimi} ${n1(g.vk)} sarjaa/vk.`, t: `Lisää esim. ${EHDOTUKSET[g.nimi][0].toLowerCase()}.` });
    if (veto * 2 < tyonto && !R.some(g => g.nimi === 'Selkä' && g.pv > 14))
      out.push({ p: 12, h: `Veto/työntö ${veto} : ${tyonto}.`, t: 'Selkää vähemmän kuin puolet työntöliikkeistä (4 vk).' });
    const raja365 = lisaaPv(L.tanaan, -365), lkm = new Map();
    for (const s of L.S) if (s.pvm > raja365) { const k = s.liike; if (!lkm.has(k)) lkm.set(k, new Set()); lkm.get(k).add(s.pvm); }
    for (const [liike, set] of lkm) {
      if (set.size < 4) continue;
      const r = suositus(L, liike);
      if (r && r.tyyppi === 'paluu' && r.tauko > 30) out.push({ p: r.tauko / 4, h: `${liike} ${r.tauko} pv tauolla.`, t: `Aloita noin 90 %:lla: ${kg(r.paino)} kg.` });
    }
    return out.sort((a, b) => b.p - a.p).slice(0, 4);
  }

  function valmentaja(L, R) {
    const kohde = R.filter(g => ['Selkä', 'Takareidet', 'Etureidet', 'Rinta', 'Olkapäät'].includes(g.nimi))
      .sort((a, b) => (b.pv - a.pv) || (a.vk - b.vk)).slice(0, 2);
    if (!kohde.length) return '';
    const liikkeet = kohde.map(g => {
      const l = useinTehty(L, g.nimi); const r = l && suositus(L, l);
      return r ? `${l.toLowerCase()} ${r.paino ? `3×${String(r.toistot).split('–')[0]} × ${kg(r.paino)} kg` : `3×${r.toistot}`}` : null;
    }).filter(Boolean);
    const nimet = kohde.map(g => g.nimi.toLowerCase());
    const ots = kohde[0].pv > 7
      ? `${nimet[0][0].toUpperCase() + nimet[0].slice(1)}${nimet[1] ? ' ja ' + nimet[1] : ''} ${nimet[1] ? 'ovat' : 'on'} jääneet vähälle`
      : 'Kaikki pääryhmät treenattu viikon sisällä';
    return `<div class="valmentaja">
      <div class="yla">Seuraava treeni</div>
      <div class="ots">${e(ots)}</div>
      <div>${kohde.map(g => `${e(g.nimi)}: ${g.pv} pv sitten`).join(' · ')}.${liikkeet.length ? ` Ehdotus: ${e(liikkeet.join(', '))}.` : ''}</div>
    </div>`;
  }

  function lihasryhmat(L, R) {
    const max = Math.max(4, ...R.map(g => g.vk));
    const rivit = R.map(g => `<button class="ryhma${ryhma === g.nimi ? ' valittu' : ''}" data-ryhma="${e(g.nimi)}">
        <span>${e(g.nimi)}</span>
        <span class="palkki"><span style="width:${Math.max(4, g.vk / max * 140)}px;background:${g.vk < 1 ? 'var(--err)' : '#B9BEC7'}"></span><b>${n1(g.vk)}</b></span>
        <span class="mut">${g.pv} pv</span></button>`).join('');
    let paneeli = '';
    if (ryhma) {
      const lista = (EHDOTUKSET[ryhma] || []).map(l => {
        const ss = sessiot(L, l);
        if (!ss.length) return `${e(l)} <span class="acc">· uusi liike</span>`;
        const r = suositus(L, l);
        return `${e(l)} <span class="mut">· viimeksi ${dm(ss[ss.length - 1].pvm)}${r ? ' · ' + e(r.teksti) : ''}</span>`;
      });
      paneeli = `<div class="kortti ehdotus"><b>${e(ryhma)}: 3 liike-ehdotusta</b><br>${lista.join('<br>') || '<span class="mut">Ei ehdotuksia tälle ryhmälle.</span>'}</div>`;
    }
    return `<div class="ryhmat">${rivit}</div>${paneeli}`;
  }

  /* ---------- piirto ---------- */
  function piirra() {
    const juuri = document.querySelector('#dashboard');
    if (!juuri || juuri.hidden) return;
    if (!data.sarjat.length) { juuri.innerHTML = '<p class="mut">Ladataan dataa…</p>'; return; }
    const L = laske(), R = ryhmat(L);
    const valitut = suodatin === 'Kaikki' ? PAA : PAA.filter(p => p.lyhyt === suodatin);
    const sug = suositukset(L, R);
    const viimPvm = L.paivat[L.paivat.length - 1];
    juuri.innerHTML = `
      <p class="mut paivitetty">Data ${viimPvm ? dm(viimPvm) + viimPvm.slice(0, 4) : '–'} asti · ${L.S.length} sarjaa</p>
      <div class="osio-ots">Tavoitteet</div>
      <div class="kaksi">${renkaat(L)}</div>
      ${valmentaja(L, R)}
      <h2>Treenimäärä <span class="mut">treeniä / 4 vk, liukuva</span></h2>
      ${treenimaara(L)}
      <div class="chipit">${['Kaikki', ...PAA.map(p => p.lyhyt)].map(c => `<button class="chip${c === suodatin ? ' paalla' : ''}" data-suodatin="${c}">${c}</button>`).join('')}</div>
      <h2>Pääliikkeet</h2>
      <p class="mut selite">Palkki = treenin raskain työsarja (kg), luku palkissa = toistot. Katkoviiva = seuraava tavoite.</p>
      ${valitut.map(p => liikekortti(L, p)).join('')}
      ${sug.length ? `<h2>Suositukset</h2>${sug.map(s => `<div class="kortti suos"><b>${e(s.h)}</b> <span class="pieni">${e(s.t)}</span></div>`).join('')}` : ''}
      <h2>1RM-kehitys <span class="mut">laskennallinen · 18 kk</span></h2>
      ${valitut.map(p => e1rmKaavio(L, p, valitut.length === 1)).join('')}
      <h2>Lihasryhmät <span class="mut">työsarjaa / vk, 4 vk</span></h2>
      <p class="mut selite">Napauta ryhmää → 3 liike-ehdotusta.</p>
      ${lihasryhmat(L, R)}
      <details class="selitys"><summary>Miten luvut lasketaan</summary>
        <p><b>Laskennallinen 1RM</b> (Epley) = paino × (1 + toistot / 30), sarjat 1–12 toistoa, ei lämmittely-, epäonnistuneita eikä autettuja sarjoja.</p>
        <p><b>Todellinen 1RM</b> = onnistunut yhden toiston sarja, joka on raskaampi kuin saman päivän monitoistoiset sarjat.</p>
        <p><b>Tavoitteen taso</b> = paras laskennallinen 1RM 90 pv ajalta. Muutos verrataan edelliseen 90 päivään.</p>
        <p><b>Työsarja</b> = ei lämmittely, vähintään 2 toistoa ja vähintään 85 % päivän raskaimmasta painosta.</p>
        <p><b>Seuraava paino</b> (tuplaprogressio): kyykky ja penkki 4–6 toistoa, pysty 6–8. Kun raskaimmalla painolla saat yläpään toistot ja ainakin kaksi sarjaa alarajan yli, paino nousee (kyykky +5, muut +2,5 kg). Yli 21 pv tauon jälkeen aloitus noin 90 %:lla.</p>
        <p><b>Treenimäärä</b> = treenipäivien määrä edeltävien 28 päivän aikana, laskettuna viikoittain.</p>
      </details>`;
    juuri.querySelectorAll('[data-suodatin]').forEach(b => b.onclick = () => { suodatin = b.dataset.suodatin; piirra(); });
    juuri.querySelectorAll('[data-ryhma]').forEach(b => b.onclick = () => {
      ryhma = ryhma === b.dataset.ryhma ? null : b.dataset.ryhma; piirra();
      const p = juuri.querySelector('.ehdotus'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  return { piirra };
})();
