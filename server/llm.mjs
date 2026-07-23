// Client LLM local via Ollama. Génère des événements narratifs structurés.
// Si Ollama est absent / répond mal, on renvoie null et l'appelant bascule
// sur la banque de templates (le jeu ne casse jamais).

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';

// Schéma attendu, décrit au modèle. On force `format: json` côté Ollama.
const SYSTEM_PROMPT = `Tu es le narrateur d'un jeu de simulation de carrière de footballeur (style "Destiny Eleven").
Tu génères UN événement narratif court et immersif, en français, adapté au contexte fourni.
Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme :
{
  "titre": "titre court (max 60 caractères)",
  "recit": "2 à 4 phrases immersives à la 2e personne (tu), ancrées dans le contexte",
  "choix": [
    { "id": "a", "texte": "option courte", "effets": [ { "cle": "moral", "delta": 5 } ] },
    { "id": "b", "texte": "autre option", "effets": [ { "cle": "reputation", "delta": -4 } ] }
  ]
}
Règles STRICTES :
- 2 ou 3 choix, chacun avec 1 à 2 effets.
- "cle" ∈ {"moral","forme","reputation","fitness","argent","trait"}.
- Pour moral/forme : delta entre -20 et 20. reputation : -15 à 15. fitness : -30 à 20. argent : -500000 à 2000000.
- Pour "trait" : mettre "valeur" (chaîne courte) au lieu de "delta".
- Les choix doivent avoir des conséquences CONTRASTÉES (risque/récompense), jamais tous positifs.
- Reste crédible par rapport à l'âge, au club et à la forme du joueur.`;

function contexteVersTexte(ctx) {
  const l = [];
  l.push(`Joueur: ${ctx.nom}, ${ctx.age} ans, ${ctx.poste}, nationalité ${ctx.nation}.`);
  l.push(`Club: ${ctx.club} (${ctx.ligue}). Note globale ${ctx.overall}, réputation ${ctx.reputation}.`);
  l.push(`État: moral ${ctx.moral}, forme ${ctx.forme}.`);
  if (ctx.derniereSaison) l.push(`Dernière saison: ${ctx.derniereSaison}.`);
  if (ctx.traits?.length) l.push(`Traits: ${ctx.traits.join(', ')}.`);
  l.push(`Type de scène à générer: ${ctx.scene}.`);
  return l.join('\n');
}

// Appelle Ollama et renvoie l'événement brut (non validé) ou null.
export async function genererEvenementLLM(ctx, { timeoutMs = 20000 } = {}) {
  const body = {
    model: OLLAMA_MODEL,
    stream: false,
    format: 'json',
    options: { temperature: 0.9, top_p: 0.95 },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: contexteVersTexte(ctx) },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (!parsed?.titre || !Array.isArray(parsed?.choix) || parsed.choix.length < 2) return null;
    return parsed;
  } catch {
    return null; // Ollama absent, timeout, JSON invalide -> fallback template
  } finally {
    clearTimeout(timer);
  }
}

// Vérifie la disponibilité d'Ollama (pour l'afficher dans l'UI).
export async function statutOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { dispo: false };
    const data = await res.json();
    const modeles = (data?.models || []).map((m) => m.name);
    return { dispo: true, modeles, modeleActif: OLLAMA_MODEL, present: modeles.includes(OLLAMA_MODEL) };
  } catch {
    return { dispo: false };
  }
}
