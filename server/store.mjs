// Persistance des carrières : un fichier JSON par sauvegarde dans /saves.

import { readFile, writeFile, readdir, mkdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAVE_DIR = join(__dirname, '..', 'saves');

async function assurerDossier() {
  await mkdir(SAVE_DIR, { recursive: true });
}

const cheminSave = (id) => join(SAVE_DIR, `${sanitize(id)}.json`);
const sanitize = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'save';

export async function sauvegarder(id, career) {
  await assurerDossier();
  await writeFile(cheminSave(id), JSON.stringify(career, null, 2), 'utf8');
  return id;
}

export async function charger(id) {
  try {
    const raw = await readFile(cheminSave(id), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function supprimer(id) {
  try { await unlink(cheminSave(id)); return true; } catch { return false; }
}

export async function listerSaves() {
  await assurerDossier();
  const fichiers = await readdir(SAVE_DIR);
  const saves = [];
  for (const f of fichiers) {
    if (!f.endsWith('.json')) continue;
    try {
      const c = JSON.parse(await readFile(join(SAVE_DIR, f), 'utf8'));
      saves.push({
        id: f.replace(/\.json$/, ''),
        nom: c.player?.nom,
        age: c.player?.age,
        saison: c.saison,
        club: c.clubId,
        statut: c.statut,
        overall: c.player?.overall,
      });
    } catch { /* fichier corrompu, on ignore */ }
  }
  return saves.sort((a, b) => (b.saison || 0) - (a.saison || 0));
}
