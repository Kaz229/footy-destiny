// Serveur local zéro-dépendance : sert l'UI statique (/public) et expose l'API
// de jeu. Le moteur est autoritatif côté serveur ; le navigateur n'affiche.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

import { loadWorld } from '../engine/world.mjs';
import {
  nouvelleCarriere, simulerSaison, attacherEvenement, resoudreChoix, bilanCarriere,
} from '../engine/career.mjs';
import { genererEvenementLLM, statutOllama } from './llm.mjs';
import { sauvegarder, charger, listerSaves, supprimer } from './store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function envoyerJSON(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function lireCorps(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error('corps trop volumineux'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('JSON invalide')); }
    });
    req.on('error', reject);
  });
}

async function servirStatique(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const chemin = normalize(join(PUBLIC_DIR, rel));
  if (!chemin.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Interdit'); }
  try {
    const contenu = await readFile(chemin);
    res.writeHead(200, { 'Content-Type': TYPES[extname(chemin)] || 'application/octet-stream' });
    res.end(contenu);
  } catch {
    res.writeHead(404); res.end('Introuvable');
  }
}

// ---- Routes API ----

async function routerAPI(req, res, pathname) {
  const world = await loadWorld();

  if (req.method === 'GET' && pathname === '/api/monde') {
    return envoyerJSON(res, 200, {
      ligues: world.ligues.map((l) => ({ id: l.id, nom: l.nom, niveau: l.niveau, clubs: l.clubs })),
      nations: world.nations.map((n) => ({ id: n.id, nom: n.nom, force: n.force })),
    });
  }

  if (req.method === 'GET' && pathname === '/api/ollama') {
    return envoyerJSON(res, 200, await statutOllama());
  }

  if (req.method === 'GET' && pathname === '/api/saves') {
    return envoyerJSON(res, 200, { saves: await listerSaves() });
  }

  if (req.method === 'GET' && pathname === '/api/carriere') {
    const url = new URL(req.url, 'http://localhost');
    const career = await charger(url.searchParams.get('id'));
    if (!career) return envoyerJSON(res, 404, { erreur: 'Carrière introuvable' });
    return envoyerJSON(res, 200, { career, bilan: career.statut === 'retraite' ? bilanCarriere(career) : null });
  }

  if (req.method === 'POST' && pathname === '/api/nouvelle') {
    const b = await lireCorps(req);
    const nom = String(b.nom || '').trim().slice(0, 40) || 'Joueur';
    const position = ['GK', 'DEF', 'MID', 'FWD'].includes(b.position) ? b.position : 'FWD';
    const nationaliteId = world.nationById(b.nationaliteId) ? b.nationaliteId : 'FRA';
    const clubDepartId = world.clubById(b.clubDepartId) ? b.clubDepartId : world.clubsByNiveau(2)[0].id;
    const profil = ['equilibre', 'talent_brut', 'travailleur', 'technicien'].includes(b.profil) ? b.profil : 'equilibre';
    const seed = b.seed ? String(b.seed) : randomUUID();

    const career = nouvelleCarriere({ seed, nom, nationaliteId, position, profil, clubDepartId, world });
    const id = randomUUID().slice(0, 8);
    await sauvegarder(id, career);
    return envoyerJSON(res, 200, { id, career });
  }

  if (req.method === 'POST' && pathname === '/api/saison') {
    const b = await lireCorps(req);
    const career = await charger(b.id);
    if (!career) return envoyerJSON(res, 404, { erreur: 'Carrière introuvable' });
    if (career.statut === 'retraite') {
      return envoyerJSON(res, 200, { fini: true, bilan: bilanCarriere(career), player: career.player });
    }
    if (career.pendingEvent) {
      return envoyerJSON(res, 409, { erreur: 'Un événement attend ta décision.', event: career.pendingEvent });
    }

    const sim = simulerSaison(career, world);

    // Tente le narrateur LLM ; sinon, template déjà généré (reproductible).
    const llm = await genererEvenementLLM(sim.contexte);
    const eventBrut = llm ? { ...llm, scene: sim.scene } : sim.fallbackEvent;
    const source = llm ? 'llm' : 'template';
    const event = attacherEvenement(career, eventBrut, source);

    await sauvegarder(b.id, career);
    return envoyerJSON(res, 200, {
      seasonEntry: sim.seasonEntry,
      event,
      player: career.player,
      statut: career.statut,
    });
  }

  if (req.method === 'POST' && pathname === '/api/choix') {
    const b = await lireCorps(req);
    const career = await charger(b.id);
    if (!career) return envoyerJSON(res, 404, { erreur: 'Carrière introuvable' });
    if (!career.pendingEvent) return envoyerJSON(res, 400, { erreur: 'Aucun événement en attente.' });

    const { recap, statut } = resoudreChoix(career, b.choixId);
    await sauvegarder(b.id, career);
    return envoyerJSON(res, 200, {
      recap,
      player: career.player,
      statut,
      bilan: statut === 'retraite' ? bilanCarriere(career) : null,
    });
  }

  if (req.method === 'POST' && pathname === '/api/supprimer') {
    const b = await lireCorps(req);
    return envoyerJSON(res, 200, { ok: await supprimer(b.id) });
  }

  return envoyerJSON(res, 404, { erreur: 'Route inconnue' });
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) return await routerAPI(req, res, pathname);
    return await servirStatique(req, res, pathname);
  } catch (err) {
    envoyerJSON(res, 500, { erreur: err.message || 'Erreur serveur' });
  }
});

server.listen(PORT, () => {
  console.log(`\n⚽ footy-destiny  →  http://localhost:${PORT}\n`);
});
