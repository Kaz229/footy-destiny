// Modèle du joueur : attributs, note globale, potentiel, progression, vieillissement.

import { clamp } from './rng.mjs';

export const POSITIONS = {
  GK: { nom: 'Gardien', code: 'GK' },
  DEF: { nom: 'Défenseur', code: 'DEF' },
  MID: { nom: 'Milieu', code: 'MID' },
  FWD: { nom: 'Attaquant', code: 'FWD' },
};

// Poids des attributs dans la note globale, par poste.
const POIDS_POSTE = {
  GK:  { vitesse: 0.05, tir: 0.02, passe: 0.10, dribble: 0.03, defense: 0.15, physique: 0.20, mental: 0.20, gardien: 0.25 },
  DEF: { vitesse: 0.15, tir: 0.03, passe: 0.14, dribble: 0.08, defense: 0.30, physique: 0.20, mental: 0.10, gardien: 0.00 },
  MID: { vitesse: 0.12, tir: 0.12, passe: 0.26, dribble: 0.18, defense: 0.12, physique: 0.10, mental: 0.10, gardien: 0.00 },
  FWD: { vitesse: 0.20, tir: 0.28, passe: 0.12, dribble: 0.22, defense: 0.02, physique: 0.08, mental: 0.08, gardien: 0.00 },
};

export const ATTRIBUTS = ['vitesse', 'tir', 'passe', 'dribble', 'defense', 'physique', 'mental', 'gardien'];

// Note globale (0-99) dérivée des attributs et du poste.
export function calcOverall(player) {
  const poids = POIDS_POSTE[player.position];
  let total = 0;
  for (const attr of ATTRIBUTS) total += (player.attributs[attr] || 0) * poids[attr];
  return Math.round(clamp(total, 1, 99));
}

// Crée un joueur débutant à 16 ans à partir des choix de création.
export function creerJoueur({ nom, nationaliteId, position, rng, profil = 'equilibre' }) {
  // Base d'attributs faible (16 ans, centre de formation) + coloration par poste.
  const base = () => rng.int(38, 52);
  const attributs = {
    vitesse: base(), tir: base(), passe: base(), dribble: base(),
    defense: base(), physique: base(), mental: base(), gardien: 20,
  };

  // Coloration du poste : on remonte les attributs clés.
  const boost = (k, min, max) => { attributs[k] = clamp(attributs[k] + rng.int(min, max), 1, 70); };
  if (position === 'GK') { attributs.gardien = rng.int(48, 60); boost('mental', 4, 10); boost('physique', 2, 8); }
  if (position === 'DEF') { boost('defense', 6, 14); boost('physique', 4, 10); }
  if (position === 'MID') { boost('passe', 6, 14); boost('dribble', 3, 9); }
  if (position === 'FWD') { boost('tir', 6, 14); boost('vitesse', 4, 10); boost('dribble', 4, 10); }

  // Profils de départ (léger biais que le joueur choisit à la création).
  if (profil === 'talent_brut') { boost('vitesse', 3, 7); boost('dribble', 3, 7); }
  if (profil === 'travailleur') { boost('mental', 4, 8); boost('physique', 3, 7); }
  if (profil === 'technicien') { boost('passe', 4, 8); boost('dribble', 3, 7); }

  const player = {
    nom,
    nationaliteId,
    position,
    profil,
    age: 16,
    piedFort: rng.bool(0.75) ? 'droit' : 'gauche',
    attributs,
    // Potentiel caché : plafond que la progression pourra approcher.
    potentiel: rng.int(68, 94),
    // États dynamiques.
    forme: 50,       // 0-100, court terme
    moral: 65,       // 0-100
    fitness: 100,    // 0-100 (blessures / fatigue en M2)
    reputation: 20,  // 0-100, influe transferts et sélection
    argent: 0,       // € cumulés (primes, contrats — simplifié en M1)
    // Traits narratifs (ajoutés par les événements LLM).
    traits: [],
    // Palmarès et compteurs.
    ballonsdor: 0,
    // Historique par saison.
    historique: [],
  };
  player.overall = calcOverall(player);
  return player;
}

// Facteur de croissance selon l'âge : forte avant 21, plateau, déclin après 30.
export function facteurAge(age) {
  if (age <= 20) return 1.0;
  if (age <= 23) return 0.7;
  if (age <= 27) return 0.35;
  if (age <= 30) return 0.1;
  if (age <= 32) return -0.15;
  if (age <= 34) return -0.4;
  return -0.7;
}

// Applique la progression/déclin de fin de saison.
// perf: 0..1 (qualité de la saison), minutes: 0..1 (temps de jeu), rng.
//
// Modèle « tirage vers le potentiel » : comme la note globale est une moyenne
// pondérée des attributs (poids sommant à 1), ajouter ~g à chaque attribut fait
// monter la note globale d'environ g. On calcule donc un gain de note visé puis
// on le répartit sur les attributs. La marge (potentiel - overall) rétrécit à
// mesure qu'on progresse → croissance asymptotique vers le potentiel.
export function progresserJoueur(player, { perf, minutes, rng, focusAttr = null }) {
  const fAge = facteurAge(player.age);

  if (fAge > 0) {
    const marge = Math.max(2, player.potentiel - player.overall);
    // Gain de note visé : jeunesse × temps de jeu × performance × marge.
    const gain = fAge * (0.4 + 0.6 * minutes) * (0.5 + perf) * marge * 0.16;

    for (const attr of ATTRIBUTS) {
      if (player.position !== 'GK' && attr === 'gardien') continue;
      if (player.position === 'GK' && attr === 'tir') continue;
      const focusMul = focusAttr === attr ? 1.6 : 1.0;
      const delta = gain * rng.range(0.6, 1.4) * focusMul;
      player.attributs[attr] = clamp(Math.round((player.attributs[attr] + delta) * 10) / 10, 1, 99);
    }
  } else {
    // Déclin : accentué sur le physique, presque nul sur le mental.
    for (const attr of ATTRIBUTS) {
      if (player.position !== 'GK' && attr === 'gardien') continue;
      if (player.position === 'GK' && attr === 'tir') continue;
      const physique = ['vitesse', 'physique'].includes(attr) ? 1.6 : attr === 'mental' ? 0.2 : 1.0;
      const delta = fAge * physique * rng.range(0.6, 1.4);
      player.attributs[attr] = clamp(Math.round((player.attributs[attr] + delta) * 10) / 10, 1, 99);
    }
  }

  player.age += 1;
  player.overall = calcOverall(player);
  // La réputation suit l'overall et la perf, avec inertie.
  player.reputation = clamp(
    Math.round(player.reputation * 0.7 + (player.overall * 0.7 + perf * 40) * 0.3),
    1, 99,
  );
  return player;
}

// Décision de retraite : probabiliste, poussée par l'âge et la baisse de niveau.
export function veutPrendreRetraite(player, rng) {
  if (player.age < 33) return false;
  if (player.age >= 40) return true;
  // Probabilité croissante ; un joueur encore bon reste plus longtemps.
  const pAge = (player.age - 33) * 0.12;
  const pNiveau = player.overall < 68 ? 0.25 : player.overall < 74 ? 0.1 : 0;
  return rng.bool(clamp(pAge + pNiveau, 0, 0.95));
}
