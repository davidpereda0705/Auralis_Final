'use strict';
/* =========================================================
   AURALIS: EL DESPERTAR — Historia, menús y bucle principal
   ========================================================= */
const SAVE_KEY = 'auralis_save_v1';
const NEWGAME = () => ({ name: 'VIAJERO', map: 'casa', x: 2, y: 2, dir: 'down', party: [], pc: [], bag: { auraball: 0, pocion: 1 }, money: 1000,
  flags: {}, defeated: {}, emblems: {}, seen: {}, caught: {}, respawn: { map: 'casa', x: 5, y: 6 }, time: 0, starter: null });
let G = NEWGAME();
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) {} }
function loadSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function updateHint() { $('#hint').classList.toggle('hidden', !(OPT.hints && mode === 'world')); }

WD.cam = new THREE.PerspectiveCamera(36, 1, .1, 150); cameras.push(WD.cam);

/* ---------------- PERSONAJES TEMPORALES EN ESCENA ---------------- */
function tempNpc(look, x, y, dir) { const n = { x, y, wx: x, wz: y, dir, visible: true, ch: makeChar(look) }; n.ch.dir = dir; setTex(n.ch); n.ch.g.position.set(x, 0, y); WD.npcs.push(n); return n; }
function removeNpc(n) { n.visible = false; n.ch.g.visible = false; WD.npcs = WD.npcs.filter(k => k !== n); }
function facePlayerTo(n) { const dx = n.x - G.x, dy = n.y - G.y; G.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); P.ch.dir = G.dir; P.ch.frame = 0; setTex(P.ch); }

/* ---------------- EVENTOS DE COMBATE ---------------- */
async function trainerEvent(n, spotted) {
  const T = n.trainer;
  await showEmote(n, '!');
  if (spotted) { const [dx, dy] = DIRS[n.dir]; let guard = 0; while (Math.abs(G.x - n.x) + Math.abs(G.y - n.y) > 1 && guard++ < 10) { const nx = n.x + dx, ny = n.y + dy; if (isBlocked(nx, ny, n)) break; await walkNpc(n, nx, ny); } }
  facePlayer(n); facePlayerTo(n);
  for (const l of [].concat(T.intro)) await say(l.includes(':') && l.indexOf(':') < 26 ? l : `${T.name}: ${l}`);
  const r = await battle({ trainer: Object.assign({ look: n.look }, T) });
  if (r === 'win') {
    G.defeated[n.id] = true; save();
    if (n.hideAfter) { await say(`${T.name}: ¡Nos veremos pronto!`); await tween(400, k => n.ch.m.material.opacity = 1 - k); removeNpc(n); n.ch.m.material.opacity = 1; }
  }
  return r;
}
async function wildEvent() {
  const tbl = WD.map.encounters, tot = tbl.reduce((a, e) => a + e[3], 0); let r = Math.random() * tot, e = tbl[0];
  for (const t of tbl) { r -= t[3]; if (r <= 0) { e = t; break; } }
  await battle({ wild: makeMon(e[0], rnd(e[1], e[2])) });
}

async function guardianEvent(n) {
  const t = n.guardian, Gd = GUARDIANS[t];
  if (G.emblems[t]) { await say(`${Gd.name}: Ya tienes el ${EMBLEMS.find(e => e.id === t).n}. ¡Sigue adelante, el Maestro te espera!`); return; }
  for (const l of Gd.intro) await say(l);
  await say('¿Aceptas el desafío?', { nowait: true });
  if (!await yesno()) { await say(`${Gd.name}: Vuelve cuando estés preparado.`); return; }
  const r = await battle({ trainer: { name: Gd.name, look: Gd.look, team: Gd.team, money: Gd.money, lose: Gd.lose, win: Gd.win, guardian: 1, music: 'boss' } });
  if (r !== 'win') return;
  G.emblems[t] = 1; sfx('catch');
  const em = EMBLEMS.find(e => e.id === t), c = Object.keys(G.emblems).length;
  await emblemPopup(em);
  await say(`¡Has recibido el ${em.n}! (${c}/6)`);
  G.bag.superpocion = (G.bag.superpocion || 0) + 2; await say('Además, recibes 2 Superpociones.');
  if (c >= 6) { await say('Un temblor recorre el Domo... ¡La barrera de aura del centro se ha disuelto!'); if (WD.barrier) WD.barrier.visible = false; shake(.3, 600); }
  else await say(`${Gd.name}: Te quedan ${6 - c} Guardianes. ¡Ánimo, Viajero!`);
  save();
}
async function emblemPopup(em) {
  const d = document.createElement('div'); d.className = 'emblem-pop'; d.innerHTML = `<div class="ep" style="--c:${TYPES[em.id].c}"><span>${TYPES[em.id].icon}</span></div><b>${em.n.toUpperCase()}</b>`;
  $('#ui').appendChild(d); await sleep(1800); d.classList.add('out'); await sleep(400); d.remove();
}

async function masterEvent(n) {
  if (G.flags.champion) {
    await say('MAESTRO DEL DOMO: El equilibrio ha vuelto a Auralis gracias a ti, Viajero.');
    await say('MAESTRO DEL DOMO: ¿Quieres un combate de revancha? Esta vez no me contendré.', { nowait: true });
    if (!await yesno()) return;
    const r = await battle({ trainer: { name: 'MAESTRO DEL DOMO', look: 'master', team: MASTER_TEAM.map(([id, l]) => [id, l + 12]), money: 5000, lose: 'Magnífico. Tu aura brilla más que nunca.', win: 'Aún te queda camino por recorrer.', boss: 1, music: 'boss' } });
    if (r === 'win') { G.flags.rematch = (G.flags.rematch || 0) + 1; save(); }
    return;
  }
  await say('MAESTRO DEL DOMO: Así que tú eres el Viajero Novato del que todos hablan.');
  await say('MAESTRO DEL DOMO: Hace cien años, el mundo de Auralis perdió su equilibrio por primera vez. Los Auralis despertaron con poderes que no podían controlar.');
  await say('MAESTRO DEL DOMO: Solo alguien capaz de unir los seis elementos en un mismo vínculo puede completar el Despertar y devolver la calma.');
  await say('MAESTRO DEL DOMO: Llevo un siglo esperando a esa persona. Has vencido a mis seis Guardianes...');
  await say('MAESTRO DEL DOMO: ¡Ahora demuéstrame que tu vínculo con los Auralis es más fuerte que el mío!', { nowait: true });
  if (!await yesno()) { await say('MAESTRO DEL DOMO: Prepárate bien. El Despertar puede esperar un poco más.'); return; }
  const r = await battle({ trainer: { name: 'MAESTRO DEL DOMO', look: 'master', team: MASTER_TEAM, money: 5000, lose: '...Lo has conseguido. El Despertar de Auralis está completo.', win: 'Tu vínculo aún no es lo bastante fuerte. Vuelve a intentarlo.', boss: 1, music: 'boss' } });
  if (r !== 'win') return;
  G.flags.champion = 1; save();
  await say('MAESTRO DEL DOMO: Siente el aura, Viajero. Los seis elementos vuelven a fluir en armonía.');
  await endingSequence();
}

/* ---------------- DIÁLOGOS ESPECIALES ---------------- */
const TALK = {
  async mom() {
    if (!G.flags.starter) {
      await say(`MAMÁ: ¡Buenos días, ${G.name}! ¿Has dormido bien? Hoy es tu primer día como Viajero.`);
      await say('MAMÁ: La Investigadora Nara te espera en el laboratorio, el edificio grande del tejado azul.');
      await say('MAMÁ: Dicen que los Auralis de la isla están muy inquietos estos días... ¡ten mucho cuidado!');
      return;
    }
    if (!G.flags.momGift) { G.flags.momGift = 1; G.bag.pocion = (G.bag.pocion || 0) + 3; sfx('item'); await say('MAMÁ: ¡Qué Auralis tan bonito! Toma, para el camino.'); await say('¡Recibes 3 Pociones!'); }
    await say('MAMÁ: Descansa un poco, cariño. Te veo agotado.'); sfx('heal'); await fade(.7, 300); healAll(); await sleep(700); await fade(0, 300);
    G.respawn = { map: 'casa', x: 5, y: 6 }; await say('¡Tus Auralis se han recuperado por completo!'); await say('MAMÁ: ¡Mucho ánimo! Y no olvides llamar de vez en cuando.'); save();
  },
  async heal() {
    await say('ENFERMERA: ¡Bienvenido al Santuario de Aura! Aquí sanamos a los Auralis con el aura pura de la isla.');
    while (true) {
      await say('ENFERMERA: ¿En qué puedo ayudarte?', { nowait: true });
      const c = await choose(['CURAR AURALIS', 'ALMACÉN DE AURA', 'ADIÓS'], { cls: 'm-yn', cancel: true });
      if (c === 0) {
        if (!G.party.length) { await say('ENFERMERA: No llevas ningún Auralis contigo.'); continue; }
        await say('ENFERMERA: Déjame tus Auralis un momento...', { auto: 500 });
        const h = WD.objs.find(o => o.type === 'healer'); sfx('heal');
        await tween(1400, k => { if (h && h.healCrystal) { h.healCrystal.scale.setScalar(1 + Math.sin(k * PI * 6) * .4); } });
        healAll(); G.respawn = { map: 'santuario', x: 6, y: 6 }; save();
        await say('ENFERMERA: ¡Listo! Tus Auralis están en plena forma. ¡Vuelve cuando quieras!');
      } else if (c === 1) await pcScreen(); else break;
    }
  },
  async shop() {
    await say('DEPENDIENTE: ¡Bienvenido a la Tienda de Veloria! ¿Qué deseas?', { nowait: true });
    while (true) {
      showMoney(true);
      const c = await choose(['COMPRAR', 'VENDER', 'SALIR'], { cls: 'm-yn', cancel: true });
      if (c === 0) await buyMenu(); else if (c === 1) await sellMenu(); else break;
    }
    showMoney(false); await say('DEPENDIENTE: ¡Gracias, vuelve pronto!'); save();
  },
  async nara() {
    if (!G.flags.starter) {
      G.flags.metNara = 1;
      await say(`INVESTIGADORA NARA: ¡${G.name}! Por fin llegas. Soy Nara, estudio la energía de aura de la isla.`);
      await say('INVESTIGADORA NARA: El mundo de Auralis ha perdido su equilibrio elemental. Los Auralis han despertado con poderes descontrolados.');
      await say('INVESTIGADORA NARA: Las leyendas dicen que solo un Viajero que domine los seis elementos podrá devolver la calma... y el Maestro del Domo busca a esa persona.');
      await say('INVESTIGADORA NARA: Para empezar necesitarás un compañero. En esos pedestales hay tres Auralis dentro de sus Auraballs.');
      await say('INVESTIGADORA NARA: Acércate y examina el que quieras. ¡Elige con el corazón!');
      return;
    }
    const caught = Object.keys(G.caught || {}).length, base = ['brakos', 'zappik', 'leafu', 'flamiki', 'bublo', 'veylo'].filter(i => G.caught && G.caught[i]).length;
    if (base >= 6 && !G.flags.naraPrize) {
      G.flags.naraPrize = 1; G.bag.superball = (G.bag.superball || 0) + 5; G.bag.revivir = (G.bag.revivir || 0) + 3; sfx('catch');
      await say('INVESTIGADORA NARA: ¡Increíble! ¡Has registrado a los seis Auralis elementales!');
      await say('INVESTIGADORA NARA: Toma esto como agradecimiento por tu investigación.'); await say('¡Recibes 5 Aura Prisma y 3 Polvos Vitales!'); return;
    }
    if (G.flags.champion) { await say('INVESTIGADORA NARA: Las lecturas de aura son estables por primera vez en años. ¡Lo conseguiste!'); await say(`INVESTIGADORA NARA: Tu Archivo Auralis tiene ${caught}/12 registros. ¿Podrás completarlo?`); return; }
    await say(`INVESTIGADORA NARA: Tu Archivo tiene ${caught} de 12 registros. Los seis Auralis elementales viven en distintos lugares de la isla.`);
    await say('INVESTIGADORA NARA: Leafu y Veylo en el Bosque Susurro, Bublo y Zappik en el Lago Espejo, Flamiki y Brakos en el Cráter Ígneo... y en la Cumbre Tormenta, un poco de todo.');
    await say(`INVESTIGADORA NARA: Tienes ${Object.keys(G.emblems).length}/6 emblemas del Domo. ¡Sigue así!`);
  },
  async pedestal(o) {
    if (G.starter) { await say('El pedestal está vacío.'); return; }
    if (!G.flags.metNara) { await say('Hay una Auraball sobre el pedestal. Deberías hablar primero con la Investigadora Nara.'); return; }
    const s = SPECIES[o.mon];
    const d = document.createElement('div'); d.className = 'starter-card'; d.innerHTML = `<img src="${monURL(o.mon)}"><b>${s.n}</b><div>${typeBadges(s.t)}</div><p>${s.desc}</p>`; $('#ui').appendChild(d);
    await say(`INVESTIGADORA NARA: ${s.n}, el Auralis de tipo ${s.t[0].toUpperCase()}. ¿Quieres que sea tu compañero?`, { nowait: true });
    const ok = await yesno(); d.remove();
    if (!ok) return;
    G.starter = o.mon; o.ball.visible = false;
    const mon = makeMon(o.mon, 5); G.party.push(mon); markCaught(o.mon); sfx('catch');
    await say(`¡${G.name} ha recibido a ${mon.n}!`);
    refreshFollower();
    await say(`INVESTIGADORA NARA: ¡${mon.n} ya te ha cogido cariño! Mira cómo te sigue.`);
    // Llega Kael
    await say('???: ¡Eh! ¡Esperad! ¡No empecéis sin mí!');
    const k = tempNpc('kael', 7, 9, 'up');
    while (k.y > G.y + 1) await walkNpc(k, k.x, k.y - 1);
    if (k.x !== G.x) { facePlayer(k); }
    facePlayerTo(k);
    const rv = COUNTER[o.mon];
    await say(`KAEL: ¡${G.name}! Siempre llegas antes que yo... ¡Pero esta vez no me ganarás!`);
    await say(`KAEL: Abuela Nara... digo, Investigadora Nara, ¡yo me quedo con ${SPECIES[rv].n}!`);
    const ped = WD.objs.find(p => p.type === 'pedestal' && p.mon === rv); if (ped) ped.ball.visible = false;
    await say(`KAEL: ¡${SPECIES[rv].n} tiene ventaja contra el tuyo! ¡Vamos a probarlo ahora mismo!`);
    await battle({ trainer: { name: 'KAEL', look: 'kael', team: 'kael1', money: 200, lose: '¡¿Qué?! ¡Pero si tenía ventaja!', win: '¡Ja! ¡Lo sabía!', music: 'trainer' }, noBlackout: true });
    await say('KAEL: Bah... Ha sido suerte. ¡Me voy a entrenar al Bosque Susurro! ¡La próxima vez te machaco!');
    await tween(300, kk => k.ch.m.material.opacity = 1 - kk); removeNpc(k);
    await say('INVESTIGADORA NARA: Kael es muy impulsivo, pero tiene talento. Será un buen rival para ti.');
    await say('INVESTIGADORA NARA: Toma, necesitarás esto para tu viaje.');
    G.bag.auraball = (G.bag.auraball || 0) + 10; G.bag.pocion = (G.bag.pocion || 0) + 3; sfx('item');
    await say('¡Recibes 10 Auraballs y 3 Pociones!');
    await say('¡Recibes el ARCHIVO AURALIS! Registrará cada Auralis que veas y captures. (Menú → ARCHIVO)');
    await say('INVESTIGADORA NARA: Debilita a los Auralis salvajes y lánzales una Auraball para capturarlos. Si están dormidos o paralizados, será más fácil.');
    await say('INVESTIGADORA NARA: Cuando estés preparado, ve al DOMO, en el norte del pueblo. Sus seis Guardianes ponen a prueba a los Viajeros.');
    await say('INVESTIGADORA NARA: Si consigues sus seis emblemas, el Maestro del Domo te recibirá. ¡Buena suerte!');
    G.flags.starter = 1; healAll(); save();
  },
  async altar() {
    await say('El Altar del Despertar. Un cristal violeta flota sobre la piedra, latiendo como un corazón.');
    await say('Hay una inscripción: "Cuando los seis elementos se unan en un solo vínculo, Auralis despertará".');
    if (G.party.length) { sfx('heal'); await fade(.6, 300, '#b08cff'); healAll(); await fade(0, 300); await say('El aura del altar envuelve a tus Auralis. ¡Han recuperado todas sus fuerzas!'); }
    if (!G.flags.altar) { G.flags.altar = 1; G.bag.superball = (G.bag.superball || 0) + 3; sfx('item'); await say('Al pie del altar encuentras 3 Aura Prisma.'); }
  },
};

function shopStock() { const n = Object.keys(G.emblems).length; return ['auraball', 'pocion', 'antidoto', ...(n >= 1 ? ['superpocion'] : []), ...(n >= 2 ? ['superball'] : []), ...(n >= 3 ? ['revivir'] : []), ...(n >= 4 ? ['potenciador'] : [])]; }
async function buyMenu() {
  let start = 0;
  while (true) {
    const ids = shopStock(); showMoney(true);
    const i = await choose(ids.map(k => `<div class="irow"><img src="${itemIcon(k)}"><div><b>${ITEMS[k].n}</b><small>${ITEMS[k].d}</small></div><span class="r">${ITEMS[k].price} ◈</span></div>`), { cls: 'm-list', cancel: true, title: 'COMPRAR', start });
    if (i < 0) return; start = i;
    const it = ITEMS[ids[i]];
    await say(`${it.n}, ${it.price} monedas cada una. ¿Cuántas quieres?`, { nowait: true });
    const qi = await choose(['x1', 'x5', 'x10'], { cls: 'm-yn', cancel: true }); if (qi < 0) continue;
    const q = [1, 5, 10][qi], cost = q * it.price;
    if (G.money < cost) { await say('DEPENDIENTE: Lo siento, no te llega el dinero.'); continue; }
    G.money -= cost; G.bag[ids[i]] = (G.bag[ids[i]] || 0) + q; showMoney(true); sfx('item');
    let msg = `DEPENDIENTE: ¡Aquí tienes! ${q} x ${it.n}.`;
    if (ids[i] === 'auraball' && q >= 10) { G.bag.superball = (G.bag.superball || 0) + 1; msg += ' ¡Y de regalo, una Aura Prisma!'; }
    await say(msg);
  }
}
async function sellMenu() {
  while (true) {
    const ids = ITEM_ORDER.filter(k => G.bag[k] > 0 && ITEMS[k].price > 0); showMoney(true);
    if (!ids.length) { await say('No tienes nada que vender.'); return; }
    const i = await choose(ids.map(k => `<div class="irow"><img src="${itemIcon(k)}"><div><b>${ITEMS[k].n}</b><small>Tienes ${G.bag[k]}</small></div><span class="r">${Math.floor(ITEMS[k].price / 2)} ◈</span></div>`), { cls: 'm-list', cancel: true, title: 'VENDER' });
    if (i < 0) return;
    const k = ids[i]; G.bag[k]--; G.money += Math.floor(ITEMS[k].price / 2); sfx('item'); showMoney(true);
  }
}
async function pcScreen() {
  while (true) {
    await say(`ALMACÉN DE AURA: ${G.pc.length} Auralis guardados.`, { nowait: true });
    const c = await choose(['SACAR', 'DEJAR', 'SALIR'], { cls: 'm-yn', cancel: true });
    if (c === 0) {
      if (!G.pc.length) { await say('No hay Auralis en el almacén.'); continue; }
      if (G.party.length >= 6) { await say('Tu equipo está lleno (máximo 6).'); continue; }
      const i = await choose(G.pc.map(monRow), { cls: 'm-list', cancel: true, title: 'ALMACÉN' });
      if (i >= 0) { const m = G.pc.splice(i, 1)[0]; G.party.push(m); sfx('out'); await say(`${m.n} se une a tu equipo.`); }
    } else if (c === 1) {
      if (G.party.length <= 1) { await say('¡No puedes quedarte sin Auralis!'); continue; }
      const i = await choose(G.party.map(monRow), { cls: 'm-list', cancel: true, title: 'EQUIPO' });
      if (i >= 0) { const m = G.party.splice(i, 1)[0]; G.pc.push(m); sfx('back'); await say(`${m.n} se guarda en el almacén.`); refreshFollower(); }
    } else return;
  }
}

/* ---------------- MENÚ DE PAUSA ---------------- */
async function startMenu() {
  sfx('sel'); let start = 0;
  while (true) {
    showMoney(true);
    const opts = [
      { html: '<span class="mi-ic">◆</span> ARCHIVO', disabled: !G.flags.starter },
      { html: '<span class="mi-ic">✦</span> EQUIPO', disabled: !G.party.length },
      '<span class="mi-ic">▣</span> MOCHILA', `<span class="mi-ic">☺</span> ${G.name}`,
      '<span class="mi-ic">✎</span> GUARDAR', '<span class="mi-ic">⚙</span> OPCIONES', '<span class="mi-ic">⌂</span> TÍTULO', '<span class="mi-ic">✕</span> CERRAR'];
    const c = await choose(opts, { cls: 'm-start', cancel: true, start }); showMoney(false); start = Math.max(0, c);
    if (c === 0) await archiveScreen();
    else if (c === 1) await partyScreen();
    else if (c === 2) { const r = await bagScreen(false); if (r && r.type === 'used') await say(r.msg); hideDialog(); }
    else if (c === 3) await cardScreen();
    else if (c === 4) { save(); sfx('heal'); toast('✔ Partida guardada'); }
    else if (c === 5) await optionsScreen();
    else if (c === 6) { await say('¿Volver a la pantalla de título? Se perderá lo que no hayas guardado.', { nowait: true }); if (await yesno()) { hideDialog(); titleScreen(); return 'title'; } hideDialog(); }
    else return;
  }
}

/* ---------------- INTRODUCCIÓN Y FINAL ---------------- */
async function nameEntry() {
  return new Promise(res => {
    const p = panel(`<div class="namebox"><h2>¿CÓMO TE LLAMAS, VIAJERO?</h2><img src="${personURL('player')}"><input id="nm" maxlength="10" value="VIAJERO" autocomplete="off" spellcheck="false"><button id="nmok">ACEPTAR</button><div class="phint">Escribe tu nombre y pulsa ENTER</div></div>`, 'p-name');
    const inp = p.querySelector('#nm'); setTimeout(() => { inp.focus(); inp.select(); }, 50);
    let fin = false;
    const done = () => { if (fin) return; fin = true; const v = (inp.value || 'VIAJERO').trim().toUpperCase().slice(0, 10) || 'VIAJERO'; keyHandler = null; p.remove(); sfx('sel'); res(v); };
    keyHandler = k => { if (k === 'start') done(); else inp.focus(); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(); });
    p.querySelector('#nmok').addEventListener('pointerdown', e => { e.stopPropagation(); done(); });
  });
}
async function storyIntro() {
  const st = $('#story'); st.classList.remove('hidden'); st.innerHTML = '<div class="st-mons"></div><div class="st-text"></div>';
  const tx = st.querySelector('.st-text'), mons = st.querySelector('.st-mons');
  const line = async (t, ms = 2600) => { tx.classList.remove('in'); await sleep(250); tx.textContent = t; tx.classList.add('in'); await waitKeyOr(ms); };
  playMusic('title');
  await line('El mundo de AURALIS vivía en equilibrio gracias a seis elementos...', 3200);
  for (const id of ['brakos', 'zappik', 'leafu', 'flamiki', 'bublo', 'veylo']) {
    const im = document.createElement('img'); im.src = monURL(id); mons.appendChild(im); sfx('move'); await sleep(320);
  }
  await line('Tierra, Electricidad, Planta, Fuego, Agua y Aire.', 2600);
  await line('Pero el equilibrio se ha roto. Los Auralis han despertado con poderes descontrolados.', 3200);
  mons.classList.add('shake');
  await line('En el Domo de Pueblo Veloria, un Maestro espera a quien sea capaz de dominar los seis elementos.', 3400);
  mons.classList.remove('shake');
  await line('Esta es la historia de un Viajero Novato...', 2600);
  await line('...y del DESPERTAR.', 2200);
  st.classList.add('out'); await sleep(800); st.classList.add('hidden'); st.classList.remove('out');
}
function waitKeyOr(ms) { return new Promise(res => { let done = false; const fin = () => { if (done) return; done = true; keyHandler = null; res(); }; keyHandler = k => { if (k === 'a' || k === 'start' || k === 'b') fin(); }; setTimeout(fin, ms); }); }
async function endingSequence() {
  await fade(1, 800); playMusic('ending');
  const st = $('#story'); st.classList.remove('hidden');
  const awake = ['brakonar', 'zapprion', 'leafaria', 'flamikora', 'bublorn', 'veylaris'];
  st.innerHTML = `<div class="credits-roll"><h1>AURALIS</h1><h4>EL DESPERTAR</h4>
    <p>Los seis elementos vuelven a fluir en armonía.<br>Los Auralis de toda la isla sienten la calma regresar.</p>
    <div class="cr-mons">${awake.map(id => `<img src="${monURL(id)}">`).join('')}</div>
    <p><b>${G.name}</b>, el Viajero que despertó Auralis.</p>
    <h3>EQUIPO</h3><p>Jordi Baulenas<br>Unai Francés<br>David Pereda</p>
    <h3>PROYECTO</h3><p>CFGS DAW · Mòdul 0616<br>Centre d'Estudis Roca</p>
    <h3>AURALIS</h3><p>Brakos · Zappik · Leafu · Flamiki · Bublo · Veylo</p>
    <h3>GRACIAS POR JUGAR</h3><p>Tu partida se ha guardado. Puedes seguir explorando, completar el Archivo y retar de nuevo al Maestro.</p></div>`;
  await waitKeyOr(26000);
  st.classList.add('out'); await sleep(800); st.classList.add('hidden'); st.classList.remove('out');
  await loadMap('domo', 15, 12, 'up', { noFade: true, silent: true }); playMusic('domo'); await fade(0, 600);
  await say('★ ¡Has completado AURALIS: EL DESPERTAR! ★');
}

/* ---------------- MODO 2 JUGADORES ---------------- */
async function versusMode() {
  const base = ['brakos', 'zappik', 'leafu', 'flamiki', 'bublo', 'veylo'];
  setDialog('MODO 2 JUGADORES · Elige el formato del duelo.');
  const f = await choose(['<b>CLÁSICO</b> — Auralis Nv 25', '<b>DESPERTADOS</b> — formas Despertadas Nv 40', 'VOLVER'], { cls: 'm-title2', cancel: true });
  hideDialog(); if (f < 0 || f === 2) return;
  const picks = [[], []], taken = new Set();
  for (let turn = 0; turn < 6; turn++) {
    const pl = [0, 1, 1, 0, 0, 1][turn];
    setDialog(`JUGADOR ${pl + 1}: elige un Auralis (${picks[pl].length + 1}/3). Por turnos: 1-2-2-1-1-2.`);
    const i = await choose(base.map(id => { const sid = f === 1 ? SPECIES[id].evo[0] : id, s = SPECIES[sid]; return { html: `<div class="draft"><img src="${monURL(sid)}"><b>${s.n}</b><div>${typeBadges(s.t)}</div>${taken.has(id) ? '<em>ELEGIDO</em>' : ''}</div>`, disabled: taken.has(id) }; }), { cls: 'm-draft', cols: 3, title: `JUGADOR ${pl + 1}` });
    taken.add(base[i]); picks[pl].push(base[i]);
  }
  hideDialog();
  const mk = id => { const sid = f === 1 ? SPECIES[id].evo[0] : id, m = makeMon(sid, f === 1 ? 40 : 25); return m; };
  const teams = picks.map(p => p.map(mk));
  await battle({ pvp: { teams }, arena: 'domo' });
  await fade(1, 300); mode = 'title'; await fade(0, 400);
}

/* ---------------- PANTALLA DE TÍTULO ---------------- */
async function titleScreen() {
  mode = 'title'; clearMenus(); hideDialog(); updateHint();
  ['#hudMe', '#hudFoe'].forEach(s => $(s).classList.add('hidden'));
  if (!WD.map || WD.map.id !== 'veloria') buildWorld('veloria');
  P.ch.g.visible = false; P.follower.g.visible = false;
  playMusic('title');
  $('#title').classList.remove('hidden'); await fade(0, 700);
  while (true) {
    const sv = loadSave();
    const opts = [...(sv ? [`CONTINUAR <small>${sv.name} · ${Object.keys(sv.emblems || {}).length}/6 emblemas</small>`] : []), 'NUEVA PARTIDA', 'MODO 2 JUGADORES', 'INSTRUCCIONES', 'OPCIONES', 'CRÉDITOS', 'SALIR'];
    const c = await choose(opts, { cls: 'm-title' });
    const k = opts[c].split(' <')[0];
    if (k === 'CONTINUAR') { await startGame(Object.assign(NEWGAME(), sv), false); return; }
    if (k === 'NUEVA PARTIDA') {
      if (sv) { setDialog('Ya hay una partida guardada. ¿Empezar de cero y sobrescribirla?'); const ok = await yesno(); hideDialog(); if (!ok) continue; }
      $('#title').classList.add('hidden');
      const name = await nameEntry();
      await fade(1, 400); await storyIntro();
      const g = NEWGAME(); g.name = name; await startGame(g, true); return;
    }
    if (k === 'MODO 2 JUGADORES') { $('#title').classList.add('hidden'); await versusMode(); $('#title').classList.remove('hidden'); playMusic('title'); if (!WD.map || WD.map.id !== 'veloria') buildWorld('veloria'); P.ch.g.visible = false; P.follower.g.visible = false; continue; }
    if (k === 'INSTRUCCIONES') await instructionsScreen();
    if (k === 'OPCIONES') await optionsScreen();
    if (k === 'CRÉDITOS') await creditsScreen();
    if (k === 'SALIR') { $('#title').classList.add('hidden'); await fade(1, 500); $('#bye').classList.remove('hidden'); stopMusic(); keyHandler = k2 => { if (k2) { keyHandler = null; $('#bye').classList.add('hidden'); titleScreen(); } }; return; }
  }
}
async function startGame(g, isNew) {
  G = g; $('#title').classList.add('hidden');
  await fade(1, 400);
  mode = 'world';
  await loadMap(G.map, G.x, G.y, G.dir, { noFade: true, silent: true });
  updateHint();
  await fade(0, 600);
  if (isNew) runEvent(async () => {
    await say('Un nuevo día amanece en Pueblo Veloria...');
    await say(`MAMÁ: ¡${G.name}! ¡Despierta, dormilón! ¡Hoy es el gran día!`);
    await say('MAMÁ: Ven a hablar conmigo antes de salir.');
    await say('(Usa las flechas o WASD para moverte, Z para hablar y ENTER para abrir el menú.)');
  });
  else areaBanner(MAPS[G.map].name, MAPS[G.map].sub);
}

/* ---------------- DISPARADORES DE MAPA ---------------- */
MAPS.lab.onEnter = async () => { if (!G.flags.metNara && !G.starter) { const n = WD.npcs.find(k => k.id === 'nara'); if (n) { await showEmote(n, '!'); await TALK.nara(); } } };
MAPS.bosque.triggers.push({ test: () => !G.defeated.kael2 && G.y >= 4 && G.y <= 6 && (G.x === 11 || G.x === 12), fn: async () => { const n = WD.npcs.find(k => k.id === 'kael2' && k.visible); if (n) await trainerEvent(n, true); } });
MAPS.domo.triggers.push({ test: () => Object.keys(G.emblems).length >= 6 && !G.defeated.kael3 && G.y <= 21 && G.y >= 18 && Math.abs(G.x - 15) <= 2, fn: async () => {
  const n = WD.npcs.find(k => k.id === 'kael3'); if (!n) return;
  if (!n.visible) { n.visible = true; n.ch.g.visible = true; }
  await trainerEvent(n, false);
} });

/* ---------------- ENTRADA EN EL MUNDO ---------------- */
worldPress = k => {
  if (mode !== 'world' || busy || P.move) return;
  if (k === 'a') runEvent(interact);
  else if (k === 'start') runEvent(startMenu);
};

/* ---------------- BUCLE ---------------- */
let last = performance.now(), TT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000); last = now; TT += dt; TIMEU.value = TT;
  if (mode === 'world' && !busy) G.time = (G.time || 0) + dt;
  if (mode === 'battle') { updateBattle(dt, TT); renderer.render(BS.scene, BS.cam); }
  else if (WD.scene) { updateWorld(dt, TT); renderer.render(WD.scene, WD.cam); }
}

/* ---------------- ARRANQUE ---------------- */
(async function boot() {
  resize(); initTouch();
  $('#loadtxt').textContent = 'Cargando Auralis...';
  await loadImages();
  DEX_ORDER.forEach(id => monCanvas(id));
  $('#title .t-mons').innerHTML = ['brakos', 'zappik', 'leafu', 'flamiki', 'bublo', 'veylo'].map((id, i) => `<img src="${monURL(id)}" style="--i:${i}">`).join('');
  buildWorld('veloria'); mode = 'title'; placePlayer();
  requestAnimationFrame(loop);
  $('#loading').classList.add('hidden');
  titleScreen();
})();
