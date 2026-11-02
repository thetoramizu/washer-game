import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { SAVE_STORAGE, SaveStorage } from './save-storage';

const STORAGE_KEY = 'moldwasher-save-v1';

/**
 * Implémentation par défaut : localStorage.
 *
 * Toutes les opérations sont défensives : en navigation privée
 * (Safari) ou si le quota est dépassé, on échoue silencieusement
 * au lieu de casser le jeu.
 */
export class LocalStorageSaveStorage implements SaveStorage {

  load(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  save(raw: string): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, raw);
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Rien à faire : pas de stockage disponible.
    }
  }
}

/**
 * Fournit le support de sauvegarde de l'application.
 *
 * Pour brancher un autre support (fichier via Electron/Tauri ou
 * backend HTTP), il suffit de passer ici une implémentation
 * différente de `SaveStorage` — aucun code du jeu n'est à modifier.
 */
export function provideSaveStorage(
  storage: SaveStorage = new LocalStorageSaveStorage()
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: SAVE_STORAGE, useValue: storage },
  ]);
}
