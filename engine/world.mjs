// Chargement et accès au « monde » : ligues, clubs, nations.
// Les données brutes sont dans /data ; ce module les met en forme et fournit
// des helpers (trouver un club, tirer un club par niveau de force, etc.).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

let _world = null;

export async function loadWorld() {
  if (_world) return _world;
  const [clubsRaw, nationsRaw] = await Promise.all([
    readFile(join(DATA_DIR, 'clubs.json'), 'utf8'),
    readFile(join(DATA_DIR, 'nations.json'), 'utf8'),
  ]);
  const { ligues } = JSON.parse(clubsRaw);
  const { nations } = JSON.parse(nationsRaw);

  // Index à plat de tous les clubs, en gardant le rattachement ligue.
  const clubs = [];
  for (const ligue of ligues) {
    for (const c of ligue.clubs) {
      clubs.push({ ...c, ligueId: ligue.id, ligueNom: ligue.nom, pays: ligue.pays, niveau: ligue.niveau });
    }
  }

  _world = {
    ligues,
    clubs,
    nations,
    clubById: (id) => clubs.find((c) => c.id === id) || null,
    ligueById: (id) => ligues.find((l) => l.id === id) || null,
    nationById: (id) => nations.find((n) => n.id === id) || null,
    // Clubs dont la force est proche d'une cible (pour proposer des transferts crédibles).
    clubsAround: (force, spread = 6) =>
      clubs.filter((c) => Math.abs(c.force - force) <= spread),
    // Clubs d'un niveau de ligue donné (1 = élite, 2 = formation).
    clubsByNiveau: (niveau) => clubs.filter((c) => c.niveau === niveau),
  };
  return _world;
}
