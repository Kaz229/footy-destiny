# ⚽ footy-destiny

Simulateur **local** de carrière de footballeur, du centre de formation jusqu'à la
retraite — inspiré de *Destiny Eleven*. Chaque saison, ton joueur progresse (ou
décline), et des **décisions narratives** façonnent son destin.

La particularité : la narration peut être générée par un **LLM qui tourne en local**
(via [Ollama](https://ollama.com)), pour un gameplay non-déterministe et varié —
tout en gardant l'équilibrage du jeu sous contrôle. Le jeu reste **100 % jouable
sans IA** (repli automatique sur une banque de scénarios).

Tout tourne sur ta machine : aucune donnée ne sort, aucun serveur distant.

## L'idée d'architecture : deux cerveaux séparés

Le piège serait de demander au LLM de faire tourner la simulation elle-même
(scores, stats). Les petits modèles sont lents et incohérents avec les chiffres :
le jeu deviendrait injuste. On sépare donc :

| 🧮 Moteur déterministe (JS pur) | 🎭 Narrateur LLM (Ollama) |
|---|---|
| Matchs, progression, vieillissement, forme, réputation | Texte des événements, dialogues, dilemmes |
| Rapide, reproductible (RNG à graine) | Propose des choix ramifiés inédits |
| Tourne **toujours**, même sans IA | Optionnel : repli sur templates si absent |

Le LLM ne modifie l'état du joueur qu'à travers un **contrat d'effets validé et
borné** côté serveur (`engine/effects.mjs`) : il peut « improviser » des
conséquences (`moral +5`, `réputation -8`, nouveau trait…) sans jamais casser
l'équilibrage.

## Lancer le jeu

Prérequis : **Node.js ≥ 20** (aucune dépendance npm à installer).

```bash
npm start          # ou : node server/index.mjs
# → http://localhost:3000
```

Ouvre `http://localhost:3000`, crée un joueur, et joue tes saisons.

### Activer le narrateur IA (optionnel mais recommandé)

1. Installe [Ollama](https://ollama.com).
2. Récupère un petit modèle, par exemple :
   ```bash
   ollama pull gemma3:4b        # ~3 Go, bon compromis
   # alternatives légères : qwen2.5:3b, llama3.2:3b
   ```
3. Assure-toi qu'Ollama tourne (`ollama serve`, souvent déjà lancé en arrière-plan).
4. (Re)lance le jeu. Le badge en haut à droite passe au vert : **IA : gemma3:4b**.

Le modèle et l'URL sont configurables par variables d'environnement :

```bash
OLLAMA_MODEL=qwen2.5:3b OLLAMA_URL=http://localhost:11434 npm start
```

Si Ollama est absent ou renvoie un JSON invalide, le jeu bascule silencieusement
sur les scénarios intégrés.

## Structure du projet

```
engine/            Moteur déterministe (aucune dépendance réseau)
  rng.mjs            RNG à graine (reproductibilité) + Poisson/gauss
  world.mjs          Chargement ligues / clubs / nations
  player.mjs         Modèle joueur, note globale, progression, vieillissement
  match.mjs          Simulation d'un match (score + perf individuelle)
  season.mjs         Boucle de saison, temps de jeu, clôture
  events.mjs         Choix de scène, contexte narratif, banque de templates
  effects.mjs        Contrat d'effets validés/bornés (garde-fou de l'équilibrage)
  career.mjs         Orchestration : création → saisons → retraite → bilan
server/
  index.mjs          Serveur HTTP zéro-dépendance (statique + API)
  llm.mjs            Client Ollama + repli
  store.mjs          Sauvegardes JSON (dossier /saves, non versionné)
public/              UI navigateur (HTML/CSS/JS vanilla)
data/                Données du monde (clubs.json, nations.json)
```

## État d'avancement (jalons)

- [x] **M1 — Tranche verticale jouable** : création de joueur (16 ans), simulation
  de saison, progression/vieillissement, **événement narratif LLM ou template
  avec choix à effets**, sauvegarde/chargement, écran de bilan à la retraite.
- [ ] **M2** : marché des transferts, contrats, **sélection nationale** (call-ups,
  tournois), blessures.
- [ ] **M3** : richesse narrative (relations, presse, traits), arbres de décision
  plus profonds via LLM.
- [ ] **M4** : UI soignée, courbe de carrière, palmarès (Ballon d'Or…).

## Notes

- L'aléa passe par un RNG à graine : une même carrière + mêmes choix se rejoue à
  l'identique (utile pour tester). La graine est saisissable à la création.
- Les sauvegardes vivent dans `/saves` (un fichier JSON par carrière), ignorées
  par git.

## Licence

MIT.
