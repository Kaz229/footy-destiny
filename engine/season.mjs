// Boucle de saison : enchaîne les matchs de club, agrège les stats, calcule le
// temps de jeu et la performance globale, puis applique la progression.

import { simulerMatch } from './match.mjs';
import { progresserJoueur } from './player.mjs';
import { clamp } from './rng.mjs';

const MATCHS_PAR_SAISON = 34;

// Détermine si le joueur est titulaire ce match : dépend de son overall
// comparé à la force du club (un jeune de 55 dans un club à 80 débute peu).
function probaTitulaire(overall, forceClub, reputation) {
  const ecart = overall - forceClub;
  // -20 -> ~5%, 0 -> ~60%, +10 -> ~95%
  const base = 1 / (1 + Math.exp(-(ecart + 8) / 6));
  const bonusRep = (reputation - 40) / 300;
  return clamp(base + bonusRep, 0.02, 0.98);
}

// Joue une saison complète de club. Renvoie le résumé (stats + contexte perf).
export function jouerSaisonClub({ rng, player, club, world }) {
  const adversairesPool = world.clubs.filter((c) => c.ligueId === club.ligueId && c.id !== club.id);

  const stats = {
    matchs: 0, titularisations: 0, minutes: 0, buts: 0, passes: 0,
    victoires: 0, nuls: 0, defaites: 0, sommeNotes: 0, notesComptees: 0,
  };
  const feuilles = [];

  const pTit = probaTitulaire(player.overall, club.force, player.reputation);

  for (let j = 0; j < MATCHS_PAR_SAISON; j++) {
    const adversaire = adversairesPool.length
      ? rng.pick(adversairesPool)
      : { force: club.force + rng.int(-6, 6) };
    const domicile = j % 2 === 0;
    const titulaire = rng.bool(pTit);

    const m = simulerMatch({ rng, equipe: club, adversaire, domicile, joueur: player, titulaire });
    feuilles.push(m);

    stats.matchs += 1;
    if (m.minutes >= 45) stats.titularisations += 1;
    stats.minutes += m.minutes;
    stats.buts += m.buts;
    stats.passes += m.passes;
    if (m.resultat === 'V') stats.victoires += 1;
    else if (m.resultat === 'N') stats.nuls += 1;
    else stats.defaites += 1;
    if (m.note > 0) { stats.sommeNotes += m.note; stats.notesComptees += 1; }

    // La forme évolue au fil des matchs (mémoire courte).
    const impact = (m.note - 6) * 3 + m.buts * 4 + m.passes * 2;
    player.forme = clamp(Math.round(player.forme * 0.85 + (55 + impact) * 0.15), 1, 100);
  }

  stats.noteMoyenne = stats.notesComptees ? Math.round((stats.sommeNotes / stats.notesComptees) * 100) / 100 : 0;

  // Indicateurs pour la progression.
  const minutesPct = clamp(stats.minutes / (MATCHS_PAR_SAISON * 90), 0, 1);
  // perf 0..1 : combine note moyenne et production offensive.
  const perf = clamp((stats.noteMoyenne - 5.5) / 2.5 + (stats.buts + stats.passes) / 40, 0, 1);

  return { stats, feuilles, minutesPct, perf, classement: estimerClassement(rng, stats, club) };
}

// Estime une place au classement à partir du bilan V/N/D (approximatif, pour le récit).
function estimerClassement(rng, stats, club) {
  const points = stats.victoires * 3 + stats.nuls;
  const max = MATCHS_PAR_SAISON * 3;
  const ratio = points / max;
  // Meilleur ratio -> meilleure place. Bruit pour éviter le déterminisme total.
  let place = Math.round((1 - ratio) * 17 + 1 + rng.range(-1.5, 1.5));
  return clamp(place, 1, 18);
}

// Applique la fin de saison au joueur (progression + archivage historique).
export function cloturerSaison({ rng, player, club, saison, resume, focusAttr = null, evenements = [] }) {
  const overallAvant = player.overall;
  progresserJoueur(player, {
    perf: resume.perf,
    minutes: resume.minutesPct,
    rng,
    focusAttr,
  });

  const entree = {
    saison,
    age: player.age - 1, // âge pendant la saison qui vient de se terminer
    club: club.nom,
    clubId: club.id,
    ligue: club.ligueNom,
    ...resume.stats,
    classement: resume.classement,
    overallAvant,
    overallApres: player.overall,
    focusAttr,
    evenements: evenements.map((e) => e.titre),
  };
  player.historique.push(entree);

  // Le moral suit le temps de jeu et le résultat sportif.
  const dMoral = (resume.minutesPct - 0.5) * 30 + (resume.classement <= 4 ? 10 : resume.classement >= 15 ? -10 : 0);
  player.moral = clamp(Math.round(player.moral * 0.6 + (65 + dMoral) * 0.4), 1, 100);

  return entree;
}
