import { Injectable, computed, inject, signal } from '@angular/core';

import { ToolUpgradeType } from '../models/cleaning-tool';
import { CLEANING_TOOLS } from '../models/cleaning-tools.data';
import { ToolUpgradeInventory } from '../models/tool-upgrade';
import { TOOL_UPGRADES } from '../models/tool-upgrades-data';
import { GAME_MAPS } from '../models/game-maps.data';
import { SAVE_STORAGE } from './save-storage';

/**
 * Écrans disponibles dans le jeu.
 */
export type GameScreen =
  | 'main-menu'
  | 'map-selection'
  | 'tool-shop'
  | 'game';

/**
 * Structure persistée de la sauvegarde.

 * Seules les données qui ont une valeur d'une partie à l'autre
 * sont enregistrées : jamais l'écran courant ni la carte en cours
 * (données de session).
 */
export interface SaveData {

  // Version du format : permet de migrer ou d'ignorer une
  // sauvegarde devenue incompatible.
  version: number;

  money: number;

  ownedTools: string[];

  equippedToolId: string;

  unlockedMaps: string[];

  upgradeInventory: ToolUpgradeInventory;

  // Cartes déjà terminées au moins une fois (identifiants),
  // pour afficher une coche ✓ dans la sélection de cartes.
  completedMaps: string[];

  savedAt: string;
}

/**
 * État par défaut d'un nouveau joueur.
 */
const DEFAULT_SAVE: Omit<SaveData, 'version' | 'savedAt'> = {
  money: 250,
  ownedTools: ['sponge', 'brush'],
  equippedToolId: 'sponge',
  // Deux cartes gratuites ouvrent le jeu : la terrasse (monde
  // Maison) et le tableau du grenier (monde Peinture), afin que
  // le joueur découvre immédiatement deux ambiances différentes.
  unlockedMaps: ['terrace', 'attic-painting'],
  upgradeInventory: {
    sponge: { radius: 0, power: 0, efficiency: 0, penetration: 0 },
    brush: { power: 0, efficiency: 0, penetration: 0 },
  },
  completedMaps: [],
};

/**
 * Service central de la sauvegarde.

 * - Charge l'état du joueur au démarrage (support injecté via
 *   `SAVE_STORAGE`, localStorage par défaut).
 * - Réécrit automatiquement la sauvegarde dès qu'une donnée
 *   persistable change (money, outils, améliorations, cartes).
 * - Expose la suppression de la sauvegarde (`resetProgress`).
 */
@Injectable({ providedIn: 'root' })
export class SaveState {

  private readonly storage = inject(SAVE_STORAGE);

  static readonly SAVE_VERSION = 1;

  /**
   * Sauvegarde chargée au démarrage, ou null si aucune
   * sauvegarde valide n'a pu être lue.
   */
  readonly hasSave = signal(false);

  // --------------------------------
  // Chargement & validation
  // --------------------------------

  /**
   * Callback chargé d'appliquer les données chargées à l'état
   * du jeu (GamingState s'enregistre ici à sa construction :
   * évite la dépendance circulaire entre les deux services).
   */
  private applier: ((save: SaveData) => void) | null = null;

  registerApplier(applier: (save: SaveData) => void): void {
    this.applier = applier;

    // Si la sauvegarde avait déjà été lue avant cet enregistrement,
    // on rejoue le chargement.
    if (this.hasSave()) {
      const raw = this.storage.load();
      const parsed = raw ? this.parse(raw) : null;
      if (parsed) applier(parsed);
    }
  }

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Lit et valide la sauvegarde depuis le support.
   */
  private loadFromStorage(): void {

    const raw = this.storage.load();

    if (!raw) return;

    const parsed = this.parse(raw);

    if (!parsed) return;

    this.hasSave.set(true);

    // Applique immédiatement si GamingState est déjà prêt.
    this.applier?.(parsed);
  }

  /**
   * Analyse et assainit une sauvegarde brute.

   * Retourne des données fiables ou null si le contenu est
   * illisible/incompatible — une sauvegarde corrompue ne doit
   * jamais faire planter le jeu ni injecter d'ids inconnus.
   */
  parse(raw: string): SaveData | null {

    let data: unknown;

    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }

    if (
      typeof data !== 'object' ||
      data === null ||
      (data as SaveData).version !== SaveState.SAVE_VERSION
    ) {
      return null;
    }

    const save = data as SaveData;

    // Assainissement : on ne fait confiance à aucun champ lu.
    return {
      version: SaveState.SAVE_VERSION,
      savedAt: typeof save.savedAt === 'string' ? save.savedAt : '',

      money:
        typeof save.money === 'number' && isFinite(save.money)
          ? Math.max(0, Math.round(save.money))
          : DEFAULT_SAVE.money,

      ownedTools: this.knownIds(save.ownedTools, CLEANING_TOOLS),

      equippedToolId:
        this.knownIds([save.equippedToolId], CLEANING_TOOLS)[0] ??
        DEFAULT_SAVE.equippedToolId,

      unlockedMaps: this.knownIds(save.unlockedMaps, GAME_MAPS),

      completedMaps: this.knownIds(save.completedMaps, GAME_MAPS),

      upgradeInventory: this.sanitizeUpgrades(
        save.upgradeInventory
      ),
    };
  }

  /**
   * Garde uniquement les identifiants connus du catalogue,
   * sans doublons.
   */
  private knownIds(
    ids: unknown,
    catalog: { id: string }[]
  ): string[] {

    if (!Array.isArray(ids)) return [];

    const valid = new Set<string>();

    for (const id of ids) {
      if (typeof id === 'string' && catalog.some(item => item.id === id)) {
        valid.add(id);
      }
    }

    return [...valid];
  }

  /**
   * Ne conserve que les niveaux entiers valides, pour des outils
   * existants et des types d'amélioration autorisés.
   */
  private sanitizeUpgrades(inventory: unknown): ToolUpgradeInventory {

    const result: ToolUpgradeInventory = {};

    if (typeof inventory !== 'object' || inventory === null) {
      return result;
    }

    const allowedTypes: ToolUpgradeType[] = [
      'radius',
      'power',
      'efficiency',
      'penetration',
    ];

    for (const [toolId, levels] of Object.entries(inventory)) {

      const tool = CLEANING_TOOLS.find(item => item.id === toolId);

      if (!tool || typeof levels !== 'object' || levels === null) {
        continue;
      }

      const cleanLevels: Record<string, number> = {};

      for (const type of allowedTypes) {

        if (!tool.availableUpgrades.includes(type)) continue;

        const upgrade = TOOL_UPGRADES.find(item => item.id === type);

        if (!upgrade) continue;

        const value = (levels as Record<string, unknown>)[type];

        if (
          typeof value === 'number' &&
          Number.isInteger(value) &&
          value >= 0 &&
          value <= upgrade.maxLevel
        ) {
          cleanLevels[type] = value;
        }
      }

      result[toolId] = cleanLevels;
    }

    return result;
  }

  // --------------------------------
  // Écriture
  // --------------------------------

  /**
   * Construit la sauvegarde à partir de l'état du jeu fourni
   * par GamingState (évite la dépendance circulaire : c'est
   * GamingState qui pousse son instantané ici).
   */
  write(snapshot: Omit<SaveData, 'version' | 'savedAt'>): void {

    const save: SaveData = {
      ...snapshot,
      version: SaveState.SAVE_VERSION,
      savedAt: new Date().toISOString(),
    };

    this.storage.save(JSON.stringify(save));
  }

  // --------------------------------
  // Suppression
  // --------------------------------

  /**
   * Supprime définitivement la sauvegarde du support.
   */
  deleteSave(): void {
    this.storage.clear();
    this.hasSave.set(false);
  }

  // --------------------------------
  // Consultation (menu principal)
  // --------------------------------

  /**
   * Résumé lisible de la dernière sauvegarde, pour proposer au
   * joueur de reprendre ou d'effacer sa progression.
   */
  readonly saveSummary = computed(() => {

    if (!this.hasSave()) return null;

    const raw = this.storage.load();

    if (!raw) return null;

    const save = this.parse(raw);

    if (!save) return null;

    const date = save.savedAt ? new Date(save.savedAt) : null;

    return {
      money: save.money,
      ownedToolsCount: save.ownedTools.length,
      unlockedMapsCount: save.unlockedMaps.length,
      completedMapsCount: save.completedMaps.length,
      savedAtLabel:
        date && !isNaN(date.getTime())
          ? new Intl.DateTimeFormat('fr-FR', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(date)
          : 'date inconnue',
    };
  });

  /**
   * Relit le support et rafraîchit `hasSave` (utilisé après une
   * suppression ou une écriture externe du fichier de sauvegarde).
   */
  refreshSummary(): void {
    this.hasSave.set(this.storage.load() !== null);
  }
}
