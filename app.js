'use strict';
/* Salivalmentaja PWA – vaihe 1: valikko, kirjaus, asetukset, offline-jono */

const LS = { url: 'sv_url', token: 'sv_token', jono: 'sv_jono', cache: 'sv_cache' };
const PAALIIKKEET = ['Takakyykky', 'Penkkipunnerrus', 'Pystypunnerrus tangolla'];
const UUSI = '__uusi';

let data = { sarjat: [], liikkeet: [] };   // sarjat: {pvm,liike,variaatio,sarja,toistot,paino,lampo,...}
let nakyma = '';
let latausVirhe = '';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const tanaan = () => new Date().toLocaleDateString('sv-SE');   // YYYY-MM-DD
const fi = n => Number(n).toLocaleString('fi-FI', { maximumFractionDigits: 2 });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- apufunktiot ---------- */
function pvmIso(s) {
  s = String(s || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}
function luku(s) {
  const n = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}
function pvmFi(iso) { const [y, m, d] = iso.split('-'); return `${+d}.${+m}.${y}`; }

function parseSarjat(rows) {
  return rows.slice(1).map(r => ({
    pvm: pvmIso(r[0]), liike: r[1], variaatio: r[2] || '',
    sarja: luku(r[3]), toistot: luku(r[4]), paino: luku(r[5]),
    lampo: r[6] === 'x', epaonn: r[7] === 'x', autettu: r[8] === 'x', huomio: r[9] || ''
  })).filter(r => r.pvm && r.liike);
}
function parseLiikkeet(rows) {
  return rows.slice(1).map(r => ({ liike: r[0], ryhma: r[1] || '', malli: r[3] || '' })).filter(r => r.liike);
}

/* ---------- API ---------- */
function asetukset() {
  return { url: localStorage.getItem(LS.url) || '', token: localStorage.getItem(LS.token) || '' };
}
class ApiVirhe extends Error {}
async function api(action, extra = {}) {
  const { url, token } = asetukset();
  if (!url || !token) throw new ApiVirhe('Asetukset puuttuvat');
  let r;
  try {
    // Ei omia otsakkeita → text/plain, ei CORS-esikyselyä
    r = await fetch(url, { method: 'POST', body: JSON.stringify({ token, action, ...extra }) });
  } catch (e) { throw new TypeError('verkko'); }          // verkkovirhe → jonoon
  let j;
  try { j = await r.json(); } catch (e) { throw new ApiVirhe('Palvelin vastasi oudosti (HTTP ' + r.status + ')'); }
  if (!j.ok) throw new ApiVirhe(j.virhe === 'unauthorized' ? 'Väärä avain' : (j.virhe || 'Tuntematon virhe'));
  return j;
}

async function lataa() {
  const j = await api('lue');
  latausVirhe = '';
  data = { sarjat: parseSarjat(j.sarjat), liikkeet: parseLiikkeet(j.liikkeet) };
  try { localStorage.setItem(LS.cache, JSON.stringify({ t: Date.now(), sarjat: j.sarjat, liikkeet: j.liikkeet })); } catch (e) {}
  return data;
}
function lataaValimuisti() {
  try {
    const c = JSON.parse(localStorage.getItem(LS.cache) || 'null');
    if (c) { data = { sarjat: parseSarjat(c.sarjat), liikkeet: parseLiikkeet(c.liikkeet) }; return c.t; }
  } catch (e) {}
  return null;
}

/* ---------- offline-jono ---------- */
const jono = () => JSON.parse(localStorage.getItem(LS.jono) || '[]');
const asetaJono = j => localStorage.setItem(LS.jono, JSON.stringify(j));

let lahettaa = false;
let jonoVirhe = '';
async function tyhjennaJono() {
  if (lahettaa || !jono().length || !asetukset().token) return paivitaJonoTila();
  lahettaa = true;
  paivitaJonoTila();
  let lahti = false;
  try {
    while (jono().length) {
      const era = jono()[0];
      try {
        await api('lisaa', { rivit: era });
        jonoVirhe = '';
        lahti = true;
      } catch (e) {
        if (e instanceof TypeError) { jonoVirhe = 'Ei yhteyttä, yritetään uudelleen.'; break; }
        // Palvelin hylkäsi erän (esim. virheellinen rivi): siirretään sivuun, ettei jono jumitu.
        const hyl = JSON.parse(localStorage.getItem('sv_hylatyt') || '[]');
        hyl.push({ era, virhe: e.message, t: Date.now() });
        localStorage.setItem('sv_hylatyt', JSON.stringify(hyl));
        jonoVirhe = 'Palvelin hylkäsi sarjoja: ' + e.message;
      }
      const j = jono(); j.shift(); asetaJono(j);
    }
  } finally {
    lahettaa = false;
    paivitaJonoTila();
    if (lahti) lataa().then(() => { paivitaValikkoTila(); if (nakyma === 'kirjaa') { naytaPaiva(); numeroi(); } if (nakyma === 'dashboard') DB.piirra(); }).catch(() => {});
  }
}

function paivitaJonoTila() {
  const n = jono().reduce((s, e) => s + e.length, 0);
  const el = $('#jono-tila');
  el.hidden = !n && !jonoVirhe;
  $('#jono-teksti').textContent = lahettaa ? `Lähetetään ${n} sarjaa…`
    : n ? `⏳ ${n} sarjaa odottaa lähetystä.${jonoVirhe ? ' ' + jonoVirhe : ''}` : jonoVirhe;
  $('#jono-laheta').hidden = !n || lahettaa;
  paivitaValikkoTila();
  if (nakyma === 'kirjaa') naytaPaiva();
}

// Yritä uudelleen säännöllisesti niin kauan kuin jonossa on jotain.
setInterval(() => { if (jono().length && document.visibilityState === 'visible') tyhjennaJono(); }, 20000);

/* ---------- navigointi ---------- */
const OTSIKOT = { '': '💪 Salivalmentaja', kirjaa: 'Kirjaa sarjoja', dashboard: 'Dashboard', asetukset: 'Asetukset' };
function nayta(n) {
  nakyma = n;
  $('#valikko').hidden = !!n;
  for (const id of ['kirjaa', 'dashboard', 'asetukset']) $('#' + id).hidden = n !== id;
  $('#takaisin').hidden = !n;
  $('#asetukset-nappi').hidden = !!n;
  $('#otsikko').textContent = OTSIKOT[n] || OTSIKOT[''];
  if (location.hash.slice(1) !== n) history.replaceState(null, '', n ? '#' + n : location.pathname);
  if (n === 'kirjaa') { taytaLiikkeet(); naytaViimeksi(); naytaPaiva(); }
  if (n === 'dashboard') DB.piirra();
  if (n === 'asetukset') { const a = asetukset(); $('#a-url').value = a.url; $('#a-token').value = a.token; }
  window.scrollTo(0, 0);
}

function paivitaValikkoTila() {
  const osat = [];
  if (!asetukset().token) osat.push('Aseta ensin osoite ja avain ⚙︎-valikosta.');
  else if (latausVirhe) osat.push(latausVirhe);
  else osat.push(data.sarjat.length ? `${data.sarjat.length} sarjaa ladattu.` : 'Ladataan dataa…');
  $('#valikko-tila').textContent = osat.join(' ');
}

/* ---------- kirjaus ---------- */
function liikeLista() {
  const lkm = {};
  for (const s of data.sarjat) lkm[s.liike] = (lkm[s.liike] || 0) + 1;
  const kaikki = new Set([...data.liikkeet.map(l => l.liike), ...Object.keys(lkm)]);
  PAALIIKKEET.forEach(l => kaikki.delete(l));
  const muut = [...kaikki].sort((a, b) => a.localeCompare(b, 'fi'));
  return { paa: PAALIIKKEET, muut };
}
function taytaLiikkeet() {
  const sel = $('#liike'), ed = sel.value;
  const { paa, muut } = liikeLista();
  sel.innerHTML =
    `<optgroup label="Pääliikkeet">${paa.map(l => `<option>${esc(l)}</option>`).join('')}</optgroup>` +
    `<optgroup label="Muut">${muut.map(l => `<option>${esc(l)}</option>`).join('')}</optgroup>` +
    `<option value="${UUSI}">Muu / uusi liike…</option>`;
  if (ed && [...sel.options].some(o => o.value === ed)) sel.value = ed;
  $('#uusi-wrap').hidden = sel.value !== UUSI;
}
const valittuLiike = () => $('#liike').value === UUSI ? $('#uusi').value.trim() : $('#liike').value;

function lisaaRivi(toistot = '', paino = '') {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td></td>
    <td><input class="t" type="number" inputmode="decimal" step="any" min="0" value="${toistot}"></td>
    <td><input class="p" type="number" inputmode="decimal" step="any" min="0" value="${paino}"></td>
    <td><input class="l" type="checkbox"></td>
    <td><button class="poista" aria-label="Poista">✕</button></td>`;
  tr.querySelector('.poista').onclick = () => { if ($$('#rivit tr').length > 1) { tr.remove(); numeroi(); } };
  $('#rivit').appendChild(tr);
  numeroi();
  return tr;
}
function numeroi() {
  const ed = aiemmat(valittuLiike(), $('#pvm').value);
  $$('#rivit tr').forEach((tr, i) => tr.firstElementChild.textContent = ed + i + 1);
}
function aiemmat(liike, pvm) {
  const tallennetut = data.sarjat.filter(s => s.pvm === pvm && s.liike === liike).length;
  const jonossa = jono().flat().filter(r => r[0] === pvm && r[1] === liike).length;
  return tallennetut + jonossa;
}

function naytaViimeksi() {
  const liike = valittuLiike(), pvm = $('#pvm').value;
  const ed = data.sarjat.filter(s => s.liike === liike && s.pvm < pvm && !s.lampo);
  if (!liike || !ed.length) { $('#viimeksi').innerHTML = ''; return; }
  const viim = ed.reduce((m, s) => s.pvm > m ? s.pvm : m, '');
  const sarjat = ed.filter(s => s.pvm === viim)
    .map(s => `${fi(s.toistot)}×${fi(s.paino)}`).join(', ');
  $('#viimeksi').innerHTML = `<div class="kortti"><b>Viimeksi ${pvmFi(viim)}</b><span class="mut">${esc(sarjat)}</span></div>`;
}

function naytaPaiva() {
  const pvm = $('#pvm').value;
  $('#paiva-otsikko').textContent = pvm === tanaan() ? 'Tänään' : `Päivä ${pvmFi(pvm)}`;
  const tallennetut = data.sarjat.filter(s => s.pvm === pvm);
  const jonossa = jono().flat().filter(r => r[0] === pvm)
    .map(r => ({ liike: r[1], variaatio: r[2], toistot: +r[4], paino: +r[5], lampo: r[6] === 'x', jonossa: true }));
  const kaikki = [...tallennetut, ...jonossa];
  if (!kaikki.length) { $('#paiva').innerHTML = '<p class="mut">Ei vielä sarjoja.</p>'; return; }
  const ryhmat = new Map();
  for (const s of kaikki) {
    const k = s.liike + (s.variaatio ? ` (${s.variaatio})` : '');
    if (!ryhmat.has(k)) ryhmat.set(k, []);
    ryhmat.get(k).push(s);
  }
  $('#paiva').innerHTML = [...ryhmat].map(([k, ss]) =>
    `<div class="kortti"><b>${esc(k)}</b><span class="mut">${ss.map(s =>
      `${s.lampo ? 'L ' : ''}${fi(s.toistot)}×${fi(s.paino)}${s.jonossa ? ' ⏳' : ''}`).join(', ')}</span></div>`).join('');
}

function tila(el, luokka, teksti) { el.className = 'tila ' + luokka; el.textContent = teksti; el.hidden = false; }

async function tallenna() {
  const el = $('#kirjaus-tila');
  const liike = valittuLiike(), pvm = $('#pvm').value, variaatio = $('#variaatio').value.trim();
  if (!pvm) return tila(el, 'err', 'Valitse päivä.');
  if (!liike) return tila(el, 'err', 'Valitse tai kirjoita liike.');
  const syotteet = $$('#rivit tr').map(tr => ({
    t: luku(tr.querySelector('.t').value), p: luku(tr.querySelector('.p').value), l: tr.querySelector('.l').checked
  }));
  if (syotteet.some(s => s.t === null || s.p === null)) return tila(el, 'err', 'Täytä toistot ja paino jokaiselle sarjalle.');

  const ed = aiemmat(liike, pvm);
  const rivit = syotteet.map((s, i) => [pvm, liike, variaatio, ed + i + 1, s.t, s.p, s.l ? 'x' : '', '', '', '']);

  $('#tallenna').disabled = true;
  tila(el, 'info', 'Tallennetaan…');
  if (jono().length) {
    // Aiemmat jonossa olevat ensin, jotta järjestys säilyy.
    await tyhjennaJono();
    if (jono().length) {
      asetaJono([...jono(), rivit]);
      tila(el, 'info', `Ei yhteyttä – ${rivit.length} sarjaa jonossa, lähetetään automaattisesti.`);
      nollaaRivit(syotteet[syotteet.length - 1]);
      $('#tallenna').disabled = false;
      return paivitaJonoTila();
    }
  }
  try {
    await api('lisaa', { rivit });
    for (const r of rivit) data.sarjat.push({ pvm, liike, variaatio, sarja: r[3], toistot: r[4], paino: r[5], lampo: r[6] === 'x' });
    tila(el, 'ok', `✓ ${rivit.length} sarjaa tallennettu.`);
    nollaaRivit(syotteet[syotteet.length - 1]);
    lataa().then(() => { naytaPaiva(); paivitaValikkoTila(); }).catch(() => {});
  } catch (e) {
    if (e instanceof TypeError) {
      asetaJono([...jono(), rivit]);
      tila(el, 'info', `Ei yhteyttä – ${rivit.length} sarjaa jonossa, lähetetään automaattisesti.`);
      nollaaRivit(syotteet[syotteet.length - 1]);
    } else {
      tila(el, 'err', 'Tallennus epäonnistui: ' + e.message);
    }
  } finally {
    $('#tallenna').disabled = false;
    paivitaJonoTila();
  }
}
function nollaaRivit(viim) {
  $('#rivit').innerHTML = '';
  lisaaRivi(viim ? viim.t : '', viim ? viim.p : '');
}

/* ---------- asetukset ---------- */
async function tallennaAsetukset() {
  const el = $('#asetus-tila');
  const url = $('#a-url').value.trim(), token = $('#a-token').value.trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) return tila(el, 'err', 'Osoitteen pitää olla muotoa https://script.google.com/macros/s/…/exec');
  if (token.length < 16) return tila(el, 'err', 'Avain on liian lyhyt.');
  localStorage.setItem(LS.url, url);
  localStorage.setItem(LS.token, token);
  tila(el, 'info', 'Testataan yhteyttä…');
  try {
    await lataa();
    tila(el, 'ok', `✓ Yhteys toimii – ${data.sarjat.length} sarjaa ladattu.`);
    paivitaValikkoTila();
  } catch (e) {
    tila(el, 'err', 'Yhteys ei toiminut: ' + (e instanceof TypeError ? 'verkkovirhe' : e.message));
  }
}

/* ---------- käynnistys ---------- */
function init() {
  $('#pvm').value = tanaan();
  lisaaRivi();

  $$('[data-nav]').forEach(b => b.onclick = () => nayta(b.dataset.nav));
  $('#takaisin').onclick = () => nayta('');
  $('#asetukset-nappi').onclick = () => nayta('asetukset');
  $('#a-tallenna').onclick = tallennaAsetukset;
  $('#lisaa').onclick = () => {
    const rr = $$('#rivit tr'), v = rr[rr.length - 1];
    const tr = lisaaRivi(v.querySelector('.t').value, v.querySelector('.p').value);
    tr.querySelector('.t').focus();
  };
  $('#tallenna').onclick = tallenna;
  $('#liike').onchange = () => { $('#uusi-wrap').hidden = $('#liike').value !== UUSI; numeroi(); naytaViimeksi(); };
  $('#uusi').oninput = () => { numeroi(); naytaViimeksi(); };
  $('#pvm').onchange = () => { numeroi(); naytaViimeksi(); naytaPaiva(); };
  $('#jono-laheta').onclick = tyhjennaJono;
  window.addEventListener('online', tyhjennaJono);
  window.addEventListener('focus', tyhjennaJono);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tyhjennaJono(); });
  window.addEventListener('hashchange', () => nayta(location.hash.slice(1)));

  lataaValimuisti();
  nayta(location.hash.slice(1));
  paivitaValikkoTila();

  if (!asetukset().token) { nayta('asetukset'); return; }
  lataa()
    .then(() => { paivitaValikkoTila(); if (nakyma === 'kirjaa') { taytaLiikkeet(); naytaViimeksi(); naytaPaiva(); numeroi(); } if (nakyma === 'dashboard') DB.piirra(); })
    .catch(e => { latausVirhe = 'Lataus epäonnistui: ' + (e instanceof TypeError ? 'ei yhteyttä (näytetään tallennettu data)' : e.message); paivitaValikkoTila(); })
    .finally(tyhjennaJono);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
init();
