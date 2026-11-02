import { Signal, WritableSignal, effect, signal } from '@angular/core';

/**
 * Version du format de sauvegarde.
 *
 * À incrémenter à chaque modification incompatible de la structure
 * sauvegardée ; les sauvegardes d'anciennes versions seront alors
 * ignorées (le jeu repart sur un profil neuf) plutôt que corrompues.
 */
export const SAVE_VERSION = 1;

const STORAGE_PREFIX = 'moldwasher:';

/**
 * Charge une sauvegarde depuis le localStorage.
 *
 * Retourne `null` si rien n'est sauvegardé ou si la donnée est
 * illisible / obsolète — le jeu démarre alors avec ses valeurs
 * par défaut.
 */
export function loadSave<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as { version: number; data: T };

    if (!parsed || typeof parsed !== 'object' || parsed.version !== SAVE_VERSION) {
      return null;
    }

    return parsed.data ?? null;
  } catch {
    // localStorage indisponible (mode privé, quota…) ou JSON corrompu :
    // on joue sans persistance plutôt que de bloquer le jeu.
    return null;
  }
}

/**
 * Écrit une sauvegarde dans le localStorage.
 *
 * Échoue silencieusement si le stockage n'est pas disponible.
 */
export function writeSave(key: string, value: unknown): void {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify({ version: SAVE_VERSION, data: value })
    );
  } catch {
    // Quota dépassé ou stockage indisponible : rien à faire.
  }
}

/**
 * Supprime toutes les sauvegardes du jeu.
 */
export function clearSave(): void {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}

/**
 * Valeur initiale d'un signal persistant : sauvegarde existante
 * si elle est valide, sinon valeur par défaut fournie.
 */
export function persistedSignal<T>(key: string, fallback: T): WritableSignal<T> {
  const saved = loadSave<T>(key);

  return signal<T>(saved === null ? fallback : saved);
}

/**
 * Comme `persistedSignal`, mais filtre la sauvegarde lue : un
 * tableau ne contenant que des éléments valides (par exemple des
 * identifiants connus du catalogue) est accepté ; sinon on retombe
 * sur la valeur par défaut. Protège le jeu contre des données
 * altérées ou obsolètes dans le localStorage.
 */
export function persistedList<T>(
  key: string,
  fallback: T[],
  isValidEntry: (entry: unknown) => entry is T
): WritableSignal<T[]> {

  const saved = loadSave<T[]>(key);

  const sanitized = Array.isArray(saved)
    ? saved.filter(isValidEntry)
    : null;

  return signal<T[]>(
    sanitized && sanitized.length > 0 ? sanitized : [...fallback]
  );
}

/**
 * Attache une sauvegarde automatique d'un signal au localStorage,
 * avec anti-rebond : plusieurs modifications rapprochées (achats
 * en série, gains pendant la partie…) ne déclenchent qu'une seule
 * écriture.
 *
 * `effect()` fonctionne même hors zone Angular (boucle de rendu du
 * canvas), ce qui garantit la sauvegarde des gains versés à la
 * victoire.
 *
 * À appeler dans un contexte d'injection (constructeur de service).
 */
export function autoSave(target: Signal<unknown>, key: string): void {
  let lastValue: unknown;

  effect(() => {
    const value = target();

    if (value === lastValue) return;

    lastValue = value;

    scheduleWrite(key, () => value);
  });
}

// ---------------------------------
// Anti-rebond partagé entre toutes
// les sauvegardes automatiques.
// ---------------------------------

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

const AUTO_SAVE_DEBOUNCE_MS = 500;

function scheduleWrite(key: string, read: () => unknown): void {
  const existing = pendingTimers.get(key);

  if (existing !== undefined) {
    clearTimeout(existing);
  }

  pendingTimers.set(
    key,
    setTimeout(() => {
      pendingTimers.delete(key);
      writeSave(key, read());
    }, AUTO_SAVE_DEBOUNCE_MS)
  );
}
