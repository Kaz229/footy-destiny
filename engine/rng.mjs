// RNG déterministe à graine (seed). Toute l'aléa du moteur passe par ici,
// pour qu'une même carrière + mêmes choix soient rejouables à l'identique.

// Hash d'une chaîne -> entier 32 bits (xmur3).
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

// Générateur mulberry32 : rapide, correct pour un jeu.
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    this.seedString = String(seed);
    const seedFn = xmur3(this.seedString);
    this._next = mulberry32(seedFn());
    this.calls = 0;
  }

  // Réémet un état (utile pour reprendre une sauvegarde de façon reproductible).
  static fromState(seedString, calls) {
    const rng = new RNG(seedString);
    for (let i = 0; i < calls; i++) rng.float();
    return rng;
  }

  state() {
    return { seedString: this.seedString, calls: this.calls };
  }

  float() {
    this.calls++;
    return this._next();
  }

  // Entier dans [min, max] inclus.
  int(min, max) {
    return Math.floor(this.float() * (max - min + 1)) + min;
  }

  // Réel dans [min, max).
  range(min, max) {
    return this.float() * (max - min) + min;
  }

  bool(p = 0.5) {
    return this.float() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.float() * arr.length)];
  }

  // Choix pondéré : items = [{value, weight}].
  weighted(items) {
    const total = items.reduce((s, it) => s + it.weight, 0);
    let r = this.float() * total;
    for (const it of items) {
      r -= it.weight;
      if (r <= 0) return it.value;
    }
    return items[items.length - 1].value;
  }

  // Approximation d'une gaussienne (Box-Muller), bornée à ±clamp écarts-types.
  gauss(mean = 0, std = 1, clamp = 3) {
    let u = 0, v = 0;
    while (u === 0) u = this.float();
    while (v === 0) v = this.float();
    let z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    if (z > clamp) z = clamp;
    if (z < -clamp) z = -clamp;
    return mean + z * std;
  }

  // Tirage de Poisson (buts d'une équipe sur un match) via la méthode de Knuth.
  poisson(lambda) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.float();
    } while (p > L);
    return k - 1;
  }
}

export const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
