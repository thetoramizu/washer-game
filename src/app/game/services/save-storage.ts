import { InjectionToken } from '@angular/core';

/**
 * Contrat de persistance des sauvegardes.
 *
 * Par défaut, l'implémentation fournie par l'application écrit
 * dans le localStorage du navigateur (voir `LocalStorageSaveStorage`
 * et `provideSaveStorage`).
 *
 * Ce contrat existe pour que le reste du jeu (GamingState, écrans)
 * n'ait jamais à connaître le support réel : on peut brancher une
 * autre implémentation sans toucher au code du jeu — par exemple :
 *
 * - un fichier interne : Angular seul ne sait pas écrire sur le
 *   disque. Il faut soit une API exposée par une coquille desktop
 *   (Electron `window.electronAPI`, Tauri `invoke('write_file')`),
 *   soit un petit backend Node/Express qui sert l'app et expose
 *   `GET/PUT /api/save`. Ces implémentations ne nécessitent aucun
 *   changement ailleurs dans le jeu ;
 *
 * - IndexedDB (plus grande capacité, mode privé Safari où
 *   localStorage est absent).
 */
export interface SaveStorage {

  /**
   * Charge la dernière sauvegarde brute, ou null s'il n'y en a pas.
   */
  load(): string | null;

  /**
   * Écrit la sauvegarde brute. Retourne false si l'écriture a
   * échoué (quota dépassé, stockage indisponible…).
   */
  save(raw: string): boolean;

  /**
   * Supprime définitivement la sauvegarde.
   */
  clear(): void;
}

export const SAVE_STORAGE = new InjectionToken<SaveStorage>(
  'SAVE_STORAGE'
);
