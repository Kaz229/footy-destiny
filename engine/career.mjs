// Orchestration de la carrière : création, déroulé d'une saison, résolution
// d'un événement, bilan final. Le hasard passe par un RNG reconstruit depuis
// l'état sauvegardé (rngState) pour que tout soit reproductible.

import { RNG } from './rng.mjs';
import { creerJoueur, veutPrendreRetraite } from './player.mjs';
import { jouerSaisonClub, cloturerSaison } from './season.mjs';
import { choisirScene, construireContexte, evenementTemplate } from './events.mjs';
import { validerEffets, appliquerEffets } from './effects.mjs';

const VERSION = 1;
const SAISON_DEPART = 2026;

export function nouvelleCarriere({ seed, nom, nationaliteId, position, profil, clubDepartId, world }) {
  const rng = new RNG(seed);
  const player = creerJoueur({ nom, nationaliteId, position, profil, rng });
  const club = world.clubById(clubDepartId) || world.clubsByNiveau(2)[0];

  return {
    version: VERSION,
    seed: String(seed),
    rngState: rng.state(),
    createdAt: new Date().toISOString(),
    player,
    clubId: club.id,
    saison: SAISON_DEPART,
    statut: 'active', // 'active' | 'retraite'
    pendingEvent: null,
    journal: [],
  };
}

// Simule la prochaine saison : matchs, progression, choix de scène et
// génération de l'événement de secours (template). Ne pousse PAS encore
// l'événement définitif (le serveur peut le remplacer par une sortie LLM).
export function simulerSaison(career, world) {
  if (career.statut !== 'active') return { fini: true };
  if (career.pendingEvent) throw new Error('Un événement est déjà en attente de décision.');

  const rng = RNG.fromState(career.rngState.seedString, career.rngState.calls);
  const player = career.player;
  const club = world.clubById(career.clubId);

  const resume = jouerSaisonClub({ rng, player, club, world });
  resume.club = club;

  const seasonEntry = cloturerSaison({
    rng, player, club, saison: career.saison, resume,
  });

  // Choix de la scène + contexte pour le narrateur.
  const scene = choisirScene(rng, player, resume);
  const contexte = construireContexte(player, world, resume, scene);
  const fallbackEvent = evenementTemplate(scene, contexte, rng);

  // Décision de retraite en fin de saison.
  if (veutPrendreRetraite(player, rng)) career.statut = 'retraite';

  // Sauvegarde l'état du RNG (tout le hasard déterministe a été consommé ici).
  career.rngState = rng.state();

  return { resume, seasonEntry, scene, contexte, fallbackEvent };
}

// Fixe l'événement définitif (LLM ou template), après validation des effets.
export function attacherEvenement(career, eventBrut, source) {
  const choixValides = (eventBrut.choix || []).slice(0, 3).map((c, i) => ({
    id: c.id || String.fromCharCode(97 + i),
    texte: String(c.texte || `Option ${i + 1}`).slice(0, 120),
    effets: validerEffets(c.effets),
  })).filter((c) => c.effets.length > 0);

  // Sécurité : si la validation a tout vidé, on garde un choix neutre.
  if (choixValides.length < 2) {
    choixValides.push({ id: 'x', texte: 'Passer', effets: [{ cle: 'moral', delta: 1 }] });
  }

  const event = {
    titre: String(eventBrut.titre || 'Un moment de carrière').slice(0, 80),
    recit: String(eventBrut.recit || '').slice(0, 600),
    choix: choixValides,
    source,
    scene: eventBrut.scene,
    saison: career.saison,
  };
  career.pendingEvent = event;
  return event;
}

// Applique le choix du joueur à l'événement en attente.
export function resoudreChoix(career, choixId) {
  const ev = career.pendingEvent;
  if (!ev) throw new Error('Aucun événement en attente.');
  const choix = ev.choix.find((c) => c.id === choixId) || ev.choix[0];
  const recap = appliquerEffets(career.player, choix.effets);

  career.journal.push({
    saison: ev.saison,
    titre: ev.titre,
    choix: choix.texte,
    recap,
  });
  career.pendingEvent = null;

  // Avance la saison de calendrier une fois l'événement résolu.
  career.saison += 1;
  return { recap, statut: career.statut };
}

// Bilan de carrière (écran de retraite).
export function bilanCarriere(career) {
  const h = career.player.historique;
  const totaux = h.reduce((acc, s) => {
    acc.matchs += s.matchs; acc.buts += s.buts; acc.passes += s.passes;
    acc.saisons += 1;
    acc.meilleurOverall = Math.max(acc.meilleurOverall, s.overallApres);
    acc.clubs.add(s.club);
    return acc;
  }, { matchs: 0, buts: 0, passes: 0, saisons: 0, meilleurOverall: 0, clubs: new Set() });

  return {
    nom: career.player.nom,
    ageRetraite: career.player.age,
    saisons: totaux.saisons,
    matchs: totaux.matchs,
    buts: totaux.buts,
    passes: totaux.passes,
    meilleurOverall: totaux.meilleurOverall,
    clubs: [...totaux.clubs],
    ballonsdor: career.player.ballonsdor,
    traits: career.player.traits,
  };
}
