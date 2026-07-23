// Contrat d'effets : la SEULE façon dont un événement (LLM ou template) peut
// modifier l'état du joueur. Chaque effet est validé et borné avant application.
// C'est ce qui permet de laisser le LLM « improviser » sans casser l'équilibrage.

import { clamp } from './rng.mjs';

// Clés autorisées -> {min, max} du delta accepté, et champ ciblé sur le joueur.
export const EFFETS_AUTORISES = {
  moral:      { champ: 'moral',      min: -20, max: 20,  borne: [1, 100] },
  forme:      { champ: 'forme',      min: -20, max: 20,  borne: [1, 100] },
  reputation: { champ: 'reputation', min: -15, max: 15,  borne: [1, 99] },
  fitness:    { champ: 'fitness',    min: -30, max: 20,  borne: [1, 100] },
  argent:     { champ: 'argent',     min: -500000, max: 2000000, borne: [0, Infinity] },
};

// Valide une liste d'effets bruts (venant du LLM ou d'un template).
// Rejette les clés inconnues, borne les deltas, ignore le reste silencieusement.
export function validerEffets(effetsBruts) {
  if (!Array.isArray(effetsBruts)) return [];
  const out = [];
  for (const e of effetsBruts) {
    if (!e || typeof e !== 'object') continue;
    const cle = e.cle;
    // Effet spécial : ajout d'un trait narratif (chaîne courte).
    if (cle === 'trait' && typeof e.valeur === 'string') {
      const trait = e.valeur.trim().slice(0, 40);
      if (trait) out.push({ cle: 'trait', valeur: trait });
      continue;
    }
    const spec = EFFETS_AUTORISES[cle];
    if (!spec) continue;
    let delta = Number(e.delta);
    if (!Number.isFinite(delta)) continue;
    delta = clamp(delta, spec.min, spec.max);
    if (delta === 0) continue;
    out.push({ cle, delta });
  }
  return out;
}

// Applique des effets déjà validés au joueur. Renvoie un récap lisible.
export function appliquerEffets(player, effets) {
  const recap = [];
  for (const e of effets) {
    if (e.cle === 'trait') {
      if (!player.traits.includes(e.valeur)) {
        player.traits.push(e.valeur);
        recap.push(`Nouveau trait : « ${e.valeur} »`);
      }
      continue;
    }
    const spec = EFFETS_AUTORISES[e.cle];
    const [bmin, bmax] = spec.borne;
    const avant = player[spec.champ] || 0;
    player[spec.champ] = clamp(Math.round(avant + e.delta), bmin, bmax);
    const signe = e.delta > 0 ? '+' : '';
    recap.push(`${labelEffet(e.cle)} ${signe}${e.delta}`);
  }
  return recap;
}

function labelEffet(cle) {
  return {
    moral: 'Moral', forme: 'Forme', reputation: 'Réputation',
    fitness: 'Forme physique', argent: 'Gains (€)',
  }[cle] || cle;
}
