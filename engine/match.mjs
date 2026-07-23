// Simulation d'un match : score de l'équipe (Poisson sur des lambda dérivés des
// forces) + contribution individuelle du joueur (note, buts, passes déc.).

import { clamp } from './rng.mjs';

// Contribution offensive attendue du joueur selon son poste (part des buts/passes
// de l'équipe qui peut lui revenir).
const PART_BUTS = { GK: 0.0, DEF: 0.06, MID: 0.18, FWD: 0.42 };
const PART_PASSES = { GK: 0.01, DEF: 0.12, MID: 0.30, FWD: 0.22 };

// Simule un match. `equipe` et `adversaire` = {force}. `domicile` bool.
// `joueur` = {overall, forme, position}. Renvoie le détail du match.
export function simulerMatch({ rng, equipe, adversaire, domicile, joueur, titulaire = true }) {
  const avantageDom = domicile ? 4 : 0;
  const forceEquipe = equipe.force + avantageDom;

  // Lambda de buts : ~1.4 de base, modulé par l'écart de force.
  const diff = (forceEquipe - adversaire.force) / 10;
  const lambdaPour = clamp(1.35 + diff * 0.45, 0.2, 4.5);
  const lambdaContre = clamp(1.35 - diff * 0.45, 0.2, 4.5);

  const butsPour = rng.poisson(lambdaPour);
  const butsContre = rng.poisson(lambdaContre);

  // Minutes jouées : titulaire = 70-90, sinon remplaçant 0-30.
  const minutes = titulaire ? rng.int(70, 90) : rng.int(0, 30);

  // Performance individuelle : base sur overall+forme, bruit, bonus si l'équipe marque.
  const niveauJour = (joueur.overall * 0.7 + joueur.forme * 0.3) + rng.gauss(0, 8);
  let buts = 0, passes = 0;
  if (minutes >= 10) {
    // Chaque but de l'équipe a une chance d'être marqué par le joueur.
    for (let i = 0; i < butsPour; i++) {
      const pBut = PART_BUTS[joueur.position] * (niveauJour / 75) * (minutes / 90);
      if (rng.bool(clamp(pBut, 0, 0.85))) buts++;
      else if (rng.bool(clamp(PART_PASSES[joueur.position] * (niveauJour / 75), 0, 0.6))) passes++;
    }
  }

  // Note du match (0-10).
  let note = 6.0;
  note += (niveauJour - 70) / 15;
  note += buts * 1.1 + passes * 0.6;
  if (joueur.position === 'GK' && butsContre === 0 && minutes >= 60) note += 1.0;
  if (joueur.position === 'DEF' && butsContre === 0 && minutes >= 60) note += 0.6;
  if (butsContre >= 3 && ['GK', 'DEF'].includes(joueur.position)) note -= 0.8;
  if (minutes < 10) note = 0; // n'a pas joué
  note = clamp(Math.round(note * 10) / 10, 0, 10);

  const resultat = butsPour > butsContre ? 'V' : butsPour < butsContre ? 'D' : 'N';

  return { butsPour, butsContre, resultat, minutes, buts, passes, note, domicile };
}
