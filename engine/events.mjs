// Cadre des événements narratifs : choix de la « scène », construction du
// contexte transmis au LLM, et banque de templates de secours (fallback) qui
// produisent EXACTEMENT la même forme qu'une sortie LLM (validée pareil).

import { POSITIONS } from './player.mjs';

// Types de scènes possibles à un beat de carrière, avec un poids de tirage
// modulé par le contexte (âge, forme, réputation...).
export function choisirScene(rng, player, resume) {
  const items = [
    { value: 'presse', weight: resume.perf > 0.6 ? 3 : 1 },
    { value: 'vestiaire', weight: 2 },
    { value: 'agent', weight: player.reputation > 45 ? 3 : 1 },
    { value: 'extra_sportif', weight: player.age < 24 ? 3 : 1 },
    { value: 'style_jeu', weight: 2 },
    { value: 'reseaux', weight: 2 },
    { value: 'mental', weight: resume.perf < 0.35 ? 3 : 1 },
  ];
  return rng.weighted(items);
}

// Contexte compact et lisible transmis au narrateur (LLM) ou aux templates.
export function construireContexte(player, world, resume, scene) {
  const nation = world.nationById(player.nationaliteId);
  const derniere = player.historique[player.historique.length - 1];
  return {
    nom: player.nom,
    age: player.age,
    poste: POSITIONS[player.position].nom,
    nation: nation ? nation.nom : player.nationaliteId,
    club: resume.club.nom,
    ligue: resume.club.ligueNom,
    overall: player.overall,
    reputation: player.reputation,
    moral: player.moral,
    forme: player.forme,
    traits: player.traits,
    scene,
    derniereSaison: derniere
      ? `${derniere.matchs} matchs, ${derniere.buts} buts, ${derniere.passes} passes, note ${derniere.noteMoyenne}, ${derniere.classement}e`
      : null,
  };
}

// ---- Banque de templates de secours (si Ollama indisponible) ----
// Chaque entrée renvoie un événement { titre, recit, choix:[{id,texte,effets}] }.

const BANQUE = {
  presse: [
    (c) => ({
      titre: 'Les projecteurs se braquent sur toi',
      recit: `Après ta saison à ${c.club}, un grand média te propose une interview exclusive. Ton agent hésite : trop d'exposition trop tôt peut se retourner contre toi.`,
      choix: [
        { id: 'a', texte: 'Accepter et jouer le jeu médiatique', effets: [{ cle: 'reputation', delta: 8 }, { cle: 'moral', delta: -3 }] },
        { id: 'b', texte: 'Rester discret, parler sur le terrain', effets: [{ cle: 'moral', delta: 6 }, { cle: 'reputation', delta: -2 }] },
      ],
    }),
    (c) => ({
      titre: 'Une punchline qui fait le tour du web',
      recit: `En zone mixte, un journaliste te tend un piège sur un rival. Ta réponse peut enflammer les réseaux.`,
      choix: [
        { id: 'a', texte: 'Provoquer avec assurance', effets: [{ cle: 'reputation', delta: 10 }, { cle: 'moral', delta: 4 }, { cle: 'trait', valeur: 'Grande gueule' }] },
        { id: 'b', texte: 'Botter en touche poliment', effets: [{ cle: 'reputation', delta: 2 }] },
      ],
    }),
  ],
  vestiaire: [
    (c) => ({
      titre: 'Tension dans le vestiaire',
      recit: `Un cadre du groupe conteste ta place de titulaire devant les autres. Le vestiaire observe ta réaction.`,
      choix: [
        { id: 'a', texte: 'Le remettre à sa place', effets: [{ cle: 'moral', delta: 5 }, { cle: 'reputation', delta: 3 }] },
        { id: 'b', texte: 'Encaisser et bosser en silence', effets: [{ cle: 'moral', delta: -5 }, { cle: 'forme', delta: 6 }] },
        { id: 'c', texte: "Aller en parler au coach", effets: [{ cle: 'moral', delta: 2 }] },
      ],
    }),
  ],
  agent: [
    (c) => ({
      titre: 'Ton agent a une offre',
      recit: `Ton agent te contacte : un club plus huppé se renseigne, mais rien n'est signé. Il te demande d'envoyer un signal, quitte à fragiliser ta relation avec ${c.club}.`,
      choix: [
        { id: 'a', texte: 'Pousser pour le transfert', effets: [{ cle: 'reputation', delta: 5 }, { cle: 'moral', delta: -6 }] },
        { id: 'b', texte: 'Rester loyal cette saison', effets: [{ cle: 'moral', delta: 7 }, { cle: 'trait', valeur: 'Loyal' }] },
      ],
    }),
    (c) => ({
      titre: 'Contrat sponsoring',
      recit: `Une marque d'équipementier te propose un contrat. L'argent est là, mais le shooting empiète sur ta préparation.`,
      choix: [
        { id: 'a', texte: 'Signer le contrat', effets: [{ cle: 'argent', delta: 250000 }, { cle: 'fitness', delta: -8 }] },
        { id: 'b', texte: 'Décliner pour rester focus', effets: [{ cle: 'forme', delta: 5 }] },
      ],
    }),
  ],
  extra_sportif: [
    (c) => ({
      titre: 'Soirée ou repos ?',
      recit: `Des amis t'invitent à une grosse soirée en pleine saison. Tu es jeune, la tentation est réelle.`,
      choix: [
        { id: 'a', texte: 'Y aller à fond', effets: [{ cle: 'moral', delta: 8 }, { cle: 'fitness', delta: -12 }] },
        { id: 'b', texte: 'Passer, rester pro', effets: [{ cle: 'fitness', delta: 6 }, { cle: 'moral', delta: -3 }, { cle: 'trait', valeur: 'Professionnel' }] },
      ],
    }),
  ],
  style_jeu: [
    (c) => ({
      titre: 'Le coach veut faire évoluer ton jeu',
      recit: `Ton entraîneur te propose un rôle différent pour la saison à venir. C'est un pari sur ton adaptation.`,
      choix: [
        { id: 'a', texte: 'Accepter le nouveau rôle', effets: [{ cle: 'forme', delta: -5 }, { cle: 'trait', valeur: 'Polyvalent' }] },
        { id: 'b', texte: 'Rester sur tes points forts', effets: [{ cle: 'forme', delta: 4 }] },
      ],
    }),
  ],
  reseaux: [
    (c) => ({
      titre: 'Un post qui dérape',
      recit: `Un vieux post refait surface et t'attire des critiques. Ton community manager attend une consigne.`,
      choix: [
        { id: 'a', texte: "S'excuser publiquement", effets: [{ cle: 'reputation', delta: 3 }, { cle: 'moral', delta: -4 }] },
        { id: 'b', texte: 'Ignorer le bad buzz', effets: [{ cle: 'reputation', delta: -6 }, { cle: 'moral', delta: 2 }] },
      ],
    }),
  ],
  mental: [
    (c) => ({
      titre: 'Passage à vide',
      recit: `Les critiques s'accumulent après une saison en dedans. Le doute s'installe. Comment réagis-tu ?`,
      choix: [
        { id: 'a', texte: 'Consulter un préparateur mental', effets: [{ cle: 'moral', delta: 10 }, { cle: 'argent', delta: -30000 }, { cle: 'trait', valeur: 'Mentalité de fer' }] },
        { id: 'b', texte: 'Serrer les dents seul', effets: [{ cle: 'moral', delta: -4 }, { cle: 'forme', delta: 5 }] },
      ],
    }),
  ],
};

// Renvoie un événement de secours pour une scène donnée.
export function evenementTemplate(scene, ctx, rng) {
  const liste = BANQUE[scene] || BANQUE.vestiaire;
  const fn = rng.pick(liste);
  const ev = fn(ctx);
  ev.source = 'template';
  ev.scene = scene;
  return ev;
}
