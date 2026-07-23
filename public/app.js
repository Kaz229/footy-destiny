// Client footy-destiny : UI vanilla, le serveur reste autoritatif.

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const overlay = $('#event-overlay');

const state = { id: null, monde: null, career: null };

const POSTES = { GK: 'Gardien', DEF: 'Défenseur', MID: 'Milieu', FWD: 'Attaquant' };
const PROFILS = {
  equilibre: 'Équilibré', talent_brut: 'Talent brut', travailleur: 'Travailleur', technicien: 'Technicien',
};

// ---- API ----
async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.erreur || 'Erreur'), { data, status: res.status });
  return data;
}

// ---- Utilitaires UI ----
function couleurJauge(v) {
  if (v >= 70) return 'var(--accent)';
  if (v >= 45) return 'var(--warn)';
  return 'var(--bad)';
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- Badge Ollama ----
async function majBadgeOllama() {
  const badge = $('#ollama-badge');
  try {
    const s = await api('/api/ollama');
    if (s.dispo && s.present) { badge.className = 'badge badge--ok'; badge.textContent = `IA : ${s.modeleActif}`; }
    else if (s.dispo) { badge.className = 'badge badge--off'; badge.textContent = `IA : modèle absent`; badge.title = `Ollama tourne mais ${s.modeleActif} n'est pas installé.`; }
    else { badge.className = 'badge badge--off'; badge.textContent = 'IA : hors-ligne (templates)'; }
  } catch { badge.className = 'badge badge--off'; badge.textContent = 'IA : hors-ligne'; }
}

// ---- Écran accueil ----
async function renderHome() {
  overlay.classList.add('hidden');
  const { saves } = await api('/api/saves');
  app.innerHTML = `
    <div class="card">
      <h1>Écris ta légende du football</h1>
      <p class="lead">Un simulateur de carrière du centre de formation jusqu'à la retraite. Chaque saison, des décisions façonnent ton destin — narrées par une IA locale quand elle est disponible.</p>
      <button class="btn btn--primary btn--lg" id="btn-new">＋ Nouvelle carrière</button>
    </div>
    <div class="card">
      <h3>Carrières sauvegardées</h3>
      ${saves.length ? saves.map(saveRow).join('') : '<p class="lead" style="margin:0">Aucune sauvegarde pour l\'instant.</p>'}
    </div>`;
  $('#btn-new').onclick = renderCreation;
  saves.forEach((s) => {
    $(`#load-${s.id}`).onclick = () => ouvrirCarriere(s.id);
    $(`#del-${s.id}`).onclick = async () => { await api('/api/supprimer', 'POST', { id: s.id }); renderHome(); };
  });
}

function saveRow(s) {
  return `<div class="save-item">
    <div>
      <strong>${esc(s.nom || 'Joueur')}</strong>
      <div class="save-meta">${s.age} ans · OVR ${s.overall} · saison ${s.saison} · ${s.statut === 'retraite' ? 'retraité' : 'en activité'}</div>
    </div>
    <div class="row">
      <button class="btn" id="load-${s.id}">Ouvrir</button>
      <button class="btn btn--ghost" id="del-${s.id}" title="Supprimer">🗑</button>
    </div>
  </div>`;
}

// ---- Écran création ----
async function renderCreation() {
  if (!state.monde) state.monde = await api('/api/monde');
  const { nations, ligues } = state.monde;
  const clubsOpts = ligues.map((l) =>
    `<optgroup label="${esc(l.nom)}">${l.clubs.map((c) => `<option value="${c.id}">${esc(c.nom)} (${c.force})</option>`).join('')}</optgroup>`
  ).join('');
  // Club de départ conseillé : un club de formation (niveau 2).
  const clubDefaut = ligues.find((l) => l.niveau === 2)?.clubs[0]?.id || ligues[0].clubs[0].id;

  app.innerHTML = `
    <div class="card">
      <h1>Nouvelle carrière</h1>
      <p class="lead">Tu débutes à 16 ans. Tes attributs sont faibles : c'est ton parcours et tes choix qui te feront grandir.</p>
      <div class="grid grid-2">
        <div class="field"><label>Nom du joueur</label><input id="f-nom" maxlength="40" placeholder="ex. Destiny Kado" /></div>
        <div class="field"><label>Nationalité</label><select id="f-nat">${nations.map((n) => `<option value="${n.id}">${esc(n.nom)}</option>`).join('')}</select></div>
        <div class="field"><label>Poste</label><select id="f-pos">${Object.entries(POSTES).map(([k, v]) => `<option value="${k}"${k === 'FWD' ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>Profil de départ</label><select id="f-profil">${Object.entries(PROFILS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>Club de départ</label><select id="f-club">${clubsOpts}</select></div>
        <div class="field"><label>Graine (optionnel, pour rejouer à l'identique)</label><input id="f-seed" maxlength="40" placeholder="laisser vide = aléatoire" /></div>
      </div>
      <div class="row">
        <button class="btn btn--primary btn--lg" id="btn-create">Commencer la carrière</button>
        <button class="btn btn--ghost" id="btn-back">Annuler</button>
      </div>
    </div>`;
  $('#f-club').value = clubDefaut;
  $('#btn-back').onclick = renderHome;
  $('#btn-create').onclick = async () => {
    const body = {
      nom: $('#f-nom').value, nationaliteId: $('#f-nat').value, position: $('#f-pos').value,
      profil: $('#f-profil').value, clubDepartId: $('#f-club').value, seed: $('#f-seed').value || undefined,
    };
    try {
      const { id, career } = await api('/api/nouvelle', 'POST', body);
      state.id = id; state.career = career;
      renderGame();
    } catch (e) { toast(e.message); }
  };
}

// ---- Ouvrir une carrière existante ----
async function ouvrirCarriere(id) {
  const { career, bilan } = await api(`/api/carriere?id=${encodeURIComponent(id)}`);
  state.id = id; state.career = career;
  if (career.statut === 'retraite' && bilan) return renderBilan(bilan);
  renderGame();
  if (career.pendingEvent) afficherEvenement(career.pendingEvent);
}

// ---- Écran de jeu ----
function renderGame() {
  const c = state.career;
  const p = c.player;
  const nation = state.monde?.nations.find((n) => n.id === p.nationaliteId)?.nom || p.nationaliteId;
  const clubNom = clubNomDepuisId(c.clubId);

  app.innerHTML = `
    <div class="card">
      <div class="player-head">
        <div class="ovr">${p.overall}</div>
        <div class="player-id">
          <h1>${esc(p.nom)}</h1>
          <div class="sub">${p.age} ans · ${POSTES[p.position]} · ${esc(nation)} · pied ${p.piedFort}</div>
          <div class="sub">${esc(clubNom)} · saison ${c.saison} · potentiel caché ●●●</div>
          <div class="chips">
            <span class="chip">Profil : ${PROFILS[p.profil] || p.profil}</span>
            ${(p.traits || []).map((t) => `<span class="chip chip--trait">${esc(t)}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="gauges">
        ${jauge('Moral', p.moral)}
        ${jauge('Forme', p.forme)}
        ${jauge('Réputation', p.reputation)}
        ${jauge('Physique', p.fitness)}
      </div>
      <div class="spacer"></div>
      <div class="row">
        <button class="btn btn--primary btn--lg" id="btn-play">▶ Jouer la saison ${c.saison}</button>
        <button class="btn btn--ghost" id="btn-home">Menu</button>
      </div>
    </div>
    ${renderHistorique(p.historique)}
    ${renderJournal(c.journal)}`;

  $('#btn-home').onclick = renderHome;
  $('#btn-play').onclick = jouerSaison;
}

function jauge(lbl, v) {
  return `<div class="gauge">
    <div class="lbl">${lbl}</div>
    <div class="val">${v}</div>
    <div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${couleurJauge(v)}"></i></div>
  </div>`;
}

function clubNomDepuisId(id) {
  for (const l of state.monde?.ligues || []) {
    const c = l.clubs.find((x) => x.id === id);
    if (c) return `${c.nom} · ${l.nom}`;
  }
  return id;
}

function renderHistorique(hist) {
  if (!hist?.length) return `<div class="card"><h3>Historique</h3><p class="lead" style="margin:0">Aucune saison jouée pour l'instant. Lance ta première saison !</p></div>`;
  const rows = [...hist].reverse().map((s) => `
    <tr>
      <td>${s.saison}</td>
      <td>${s.age}</td>
      <td>${esc(s.club)}</td>
      <td class="num">${s.matchs}</td>
      <td class="num">${s.buts}</td>
      <td class="num">${s.passes}</td>
      <td class="num">${s.noteMoyenne || '—'}</td>
      <td class="num">${s.classement}e</td>
      <td class="num">${s.overallAvant}→${s.overallApres}</td>
    </tr>`).join('');
  return `<div class="card">
    <h3>Historique de carrière</h3>
    <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Saison</th><th>Âge</th><th>Club</th><th class="num">MJ</th><th class="num">B</th><th class="num">PD</th><th class="num">Note</th><th class="num">Class.</th><th class="num">OVR</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function renderJournal(journal) {
  if (!journal?.length) return '';
  const items = [...journal].reverse().slice(0, 8).map((j) =>
    `<tr><td>${j.saison}</td><td><strong>${esc(j.titre)}</strong><div class="save-meta">→ ${esc(j.choix)} · ${(j.recap || []).join(', ')}</div></td></tr>`
  ).join('');
  return `<div class="card"><h3>Journal des décisions</h3><table><tbody>${items}</tbody></table></div>`;
}

// ---- Jouer une saison ----
async function jouerSaison() {
  const btn = $('#btn-play');
  if (btn) { btn.disabled = true; btn.textContent = 'Simulation en cours…'; }
  try {
    const r = await api('/api/saison', 'POST', { id: state.id });
    if (r.fini) return renderBilan(r.bilan);
    state.career.player = r.player;
    state.career.statut = r.statut;
    renderGame();
    afficherEvenement(r.event);
  } catch (e) {
    if (e.status === 409 && e.data?.event) { afficherEvenement(e.data.event); }
    else toast(e.message);
    if (btn) { btn.disabled = false; }
  }
}

// ---- Overlay événement ----
function afficherEvenement(ev) {
  $('#event-source').textContent = ev.source === 'llm' ? '✦ Narrateur IA' : 'Événement';
  $('#event-source').className = 'event-source' + (ev.source === 'llm' ? '' : ' template');
  $('#event-titre').textContent = ev.titre;
  $('#event-recit').textContent = ev.recit || '';
  const box = $('#event-choix');
  box.innerHTML = '';
  ev.choix.forEach((ch) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.innerHTML = `${esc(ch.texte)}<span class="effets">${resumeEffets(ch.effets)}</span>`;
    b.onclick = () => choisir(ch.id);
    box.appendChild(b);
  });
  overlay.classList.remove('hidden');
}

function resumeEffets(effets) {
  return (effets || []).map((e) => {
    if (e.cle === 'trait') return `trait « ${e.valeur} »`;
    const signe = e.delta > 0 ? '+' : '';
    return `${e.cle} ${signe}${e.delta}`;
  }).join(' · ');
}

async function choisir(choixId) {
  try {
    const r = await api('/api/choix', 'POST', { id: state.id, choixId });
    overlay.classList.add('hidden');
    state.career.player = r.player;
    state.career.statut = r.statut;
    state.career.saison += 1;
    if (r.recap?.length) toast(r.recap.join(' · '));
    if (r.statut === 'retraite' && r.bilan) return renderBilan(r.bilan);
    renderGame();
  } catch (e) { toast(e.message); }
}

// ---- Écran bilan (retraite) ----
function renderBilan(b) {
  overlay.classList.add('hidden');
  app.innerHTML = `
    <div class="card center">
      <h3>Fin de carrière</h3>
      <h1>${esc(b.nom)}</h1>
      <p class="lead">Raccroche les crampons à ${b.ageRetraite} ans après ${b.saisons} saisons.</p>
      <div class="gauges" style="grid-template-columns:repeat(4,1fr)">
        ${statBox('Matchs', b.matchs)}
        ${statBox('Buts', b.buts)}
        ${statBox('Passes déc.', b.passes)}
        ${statBox('Meilleur OVR', b.meilleurOverall)}
      </div>
      <div class="spacer"></div>
      <p class="lead">Clubs : ${b.clubs.map(esc).join(', ')}</p>
      ${b.traits?.length ? `<div class="chips" style="justify-content:center">${b.traits.map((t) => `<span class="chip chip--trait">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="spacer"></div>
      <button class="btn btn--primary btn--lg" id="btn-home">Retour au menu</button>
    </div>`;
  $('#btn-home').onclick = renderHome;
}
function statBox(lbl, v) {
  return `<div class="gauge"><div class="lbl">${lbl}</div><div class="val">${v}</div></div>`;
}

// ---- Démarrage ----
(async function init() {
  majBadgeOllama();
  if (!state.monde) { try { state.monde = await api('/api/monde'); } catch {} }
  renderHome();
})();
