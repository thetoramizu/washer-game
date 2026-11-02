
import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { GameMap } from '../models/game-map';
import { CleaningTool, ToolUpgradeType } from '../models/cleaning-tool';
import { CLEANING_TOOLS } from '../models/cleaning-tools.data';
import { DIRT_TYPES } from '../models/dirt-types.data';
import { ToolUpgradeInventory } from '../models/tool-upgrade';
import { TOOL_UPGRADES } from '../models/tool-upgrades-data';
import { MapRecord, SaveData, SaveState } from './save-state';

/**
 * Écrans disponibles dans le jeu.
 */
export type GameScreen =
  | 'main-menu'
  | 'map-selection'
  | 'tool-shop'
  | 'game';

@Injectable({ providedIn: 'root' })
export class GamingState {

  private readonly saveState = inject(SaveState);

  constructor() {

    // Restaure la progression sauvegardée (si elle existe) :
    // les données ont été validées et assainies à la lecture.
    this.saveState.registerApplier(save => this.applySave(save));

    // Auto-sauvegarde : dès qu'une donnée persistable change
    // (argent, outils, améliorations, cartes débloquées ou
    // terminées), l'instantané est réécrit sur le support.
    effect(() => {
      this.saveState.write(this.snapshot());
    });
  }

  /**
   * Instantané des données persistables de l'état du jeu.
   */
  snapshot(): Omit<SaveData, 'version' | 'savedAt'> {
    return {
      money: this.money(),
      ownedTools: this.ownedTools(),
      equippedToolId: this.equippedToolId(),
      unlockedMaps: this.unlockedMaps(),
      upgradeInventory: this.upgradeInventory(),
      completedMaps: this.completedMaps(),
      mapRecords: this.mapRecords(),
      audioMuted: this.saveState.audioMuted(),
    };
  }

  /**
   * Applique une sauvegarde validée aux signaux de l'état.
   */
  private applySave(save: SaveData): void {

    this.money.set(save.money);
    this.ownedTools.set(save.ownedTools);
    this.equippedToolId.set(save.equippedToolId);
    this.unlockedMaps.set(save.unlockedMaps);
    this.completedMaps.set(save.completedMaps);
    this.upgradeInventory.set(save.upgradeInventory);
    this.mapRecords.set(save.mapRecords);

    // La préférence sonore vit dans SaveState (lue par
    // l'AudioService) ; on la resynchronise ici au chargement.
    this.saveState.audioMuted.set(save.audioMuted);
  }

  /**
   * Efface la sauvegarde et recharge l'état par défaut d'un
   * nouveau joueur.
   */
  resetProgress(): void {

    this.saveState.deleteSave();

    this.money.set(250);
    this.ownedTools.set(['sponge', 'brush']);
    this.equippedToolId.set('sponge');
    this.unlockedMaps.set(['terrace', 'attic-painting']);
    this.completedMaps.set([]);
    this.mapRecords.set({});
    this.saveState.audioMuted.set(false);
    this.upgradeInventory.set({
      sponge: { radius: 0, power: 0, efficiency: 0, penetration: 0 },
      brush: { power: 0, efficiency: 0, penetration: 0 },
    });
  }

  // --------------------------------
  // Catalogue des outils
  // --------------------------------

  readonly tools = CLEANING_TOOLS;

  /**
   * Retourne un outil à partir de son identifiant.
   */
  getTool(toolId: string): CleaningTool | undefined {
    return this.tools.find(tool => tool.id === toolId);
  }

  /**
   * Achète un nouvel outil.
   */
  buyTool(tool: CleaningTool): boolean {

    if (this.ownsTool(tool.id)) {
      return false;
    }

    if (!this.spendMoney(tool.price)) {
      return false;
    }

    this.unlockTool(tool.id);

    return true;
  }


  // --------------------------------
  // Améliorations
  // --------------------------------

  readonly upgrades = TOOL_UPGRADES;

  /**
   * Stocke les niveaux achetés pour chaque outil.
   */
  readonly upgradeInventory = signal<ToolUpgradeInventory>({
    sponge: {
      radius: 0,
      power: 0,
      efficiency: 0,
      penetration: 0
    },

    brush: {
      power: 0,
      efficiency: 0,
      penetration: 0
    }
  });

  /**
   * Retourne le niveau actuel d'une amélioration.
   */
  getUpgradeLevel(
    toolId: string,
    upgradeId: ToolUpgradeType
  ): number {

    return this.upgradeInventory()[toolId]?.[upgradeId] ?? 0;
  }

  /**
   * Calcule le prix du prochain niveau.
   */
  getUpgradePrice(
    toolId: string,
    upgradeId: ToolUpgradeType
  ): number {

    const upgrade = this.upgrades.find(
      item => item.id === upgradeId
    );

    if (!upgrade) return 0;

    const currentLevel = this.getUpgradeLevel(
      toolId,
      upgradeId
    );

    return Math.round(
      upgrade.basePrice *
      Math.pow(upgrade.priceMultiplier, currentLevel)
    );
  }

  /**
   * Achète un niveau d'amélioration.
   */
  buyUpgrade(
    toolId: string,
    upgradeId: ToolUpgradeType
  ): boolean {

    const tool = this.getTool(toolId);

    if (!tool || !this.ownsTool(toolId)) {
      return false;
    }

    // Vérifie que cette amélioration est disponible pour l'outil.
    if (!tool.availableUpgrades.includes(upgradeId)) {
      return false;
    }

    const upgrade = this.upgrades.find(
      item => item.id === upgradeId
    );

    if (!upgrade) return false;

    const currentLevel = this.getUpgradeLevel(
      toolId,
      upgradeId
    );

    // Vérifie le niveau maximum.
    if (currentLevel >= upgrade.maxLevel) {
      return false;
    }

    const price = this.getUpgradePrice(
      toolId,
      upgradeId
    );

    // Vérifie et débite le portefeuille.
    if (!this.spendMoney(price)) {
      return false;
    }

    // Met à jour le niveau de l'amélioration.
    this.upgradeInventory.update(inventory => ({
      ...inventory,

      [toolId]: {
        ...inventory[toolId],
        [upgradeId]: currentLevel + 1
      }
    }));

    return true;
  }


    
/**
 * Identifiants des cartes débloquées.
 */
/**
 * Identifiants des cartes débloquées.
 *
 * Deux cartes gratuites ouvrent le jeu : la terrasse (monde
 * Maison) et le tableau du grenier (monde Peinture), afin que
 * le joueur découvre immédiatement deux ambiances différentes.
 */
readonly unlockedMaps = signal<string[]>([
  'terrace',
  'attic-painting'
]);

/**
 * Vérifie si une carte est débloquée.
 */
isMapUnlocked(mapId: string): boolean {
  return this.unlockedMaps().includes(mapId);
}

/**
 * Débloque une carte après paiement.
 */
unlockMap(map: GameMap): boolean {

  if (this.isMapUnlocked(map.id)) {
    return true;
  }

  if (!this.spendMoney(map.unlockPrice)) {
    return false;
  }

  this.unlockedMaps.update(maps => [
    ...maps,
    map.id
  ]);

  return true;
}

/**
 * Cartes déjà terminées au moins une fois (badge ✓ dans la
 * sélection de cartes ; récompense complète versée à chaque
 * revalidation de la carte).
 */
readonly completedMaps = signal<string[]>([]);

isMapCompleted(mapId: string): boolean {
  return this.completedMaps().includes(mapId);
}

markMapCompleted(mapId: string): void {

  if (this.isMapCompleted(mapId)) return;

  this.completedMaps.update(maps => [...maps, mapId]);
}

  // --------------------------------
  // Records de temps & étoiles
  // --------------------------------

  /**
   * Meilleur temps et étoiles obtenues par carte.
   */
  readonly mapRecords = signal<Record<string, MapRecord>>({});

  getMapRecord(mapId: string): MapRecord | undefined {
    return this.mapRecords()[mapId];
  }

  /**
   * Durée « cible » d'une carte, dérivée de sa surface et de la
   * densité totale de ses salissures : les étoiles sont calibrées
   * par carte (une grande carte difficile n'exige pas le même
   * chrono qu'une petite terrasse).
   */
  getMapTargetTimeMs(map: GameMap): number {

    const areaUnits = (map.width * map.height) / 10_000;

    const totalZones = Object.values(map.dirtDensity).reduce(
      (sum, count) => sum + count,
      0
    );

    // Résistance moyenne pondérée des salissures présentes :
    // une carte pleine de moisissure demandera plus de temps.
    let weightedResistance = 0;

    for (const [dirtId, count] of Object.entries(map.dirtDensity)) {
      const dirt = DIRT_TYPES.find(item => item.id === dirtId);
      weightedResistance += (dirt?.resistance ?? 20) * count;
    }

    const averageResistance =
      totalZones > 0 ? weightedResistance / totalZones : 20;

    const difficultyFactor =
      map.difficulty === 'easy' ? 1 :
      map.difficulty === 'medium' ? 1.35 : 1.7;

    // Cœur du calibrage : ~4 s par zone de salissure sur une
    // surface de référence, ajusté par résistance et difficulté.
    const baseSeconds =
      (totalZones * 4 + areaUnits * 6) *
      (0.7 + averageResistance / 100) *
      difficultyFactor;

    return Math.round(Math.max(30, baseSeconds) * 1000);
  }

  /**
   * Étoiles méritées pour un temps donné sur une carte :
   * 3★ sous la cible, 2★ sous 2× la cible, 1★ au-delà.
   */
  getStarsForTime(map: GameMap, timeMs: number): number {

    const target = this.getMapTargetTimeMs(map);

    if (timeMs <= target) return 3;
    if (timeMs <= target * 2) return 2;
    return 1;
  }

  /**
   * Enregistre une partie terminée : conserve le meilleur temps
   * et la meilleure étoile obtenue. Retourne true si un nouveau
   * record est battu (pour afficher « 🏆 Nouveau record ! »).
   */
  submitMapResult(map: GameMap, timeMs: number): boolean {

    const previous = this.mapRecords()[map.id];

    const stars = this.getStarsForTime(map, timeMs);
    const isRecord = !previous || timeMs < previous.bestTimeMs;

    const bestTimeMs = isRecord
      ? timeMs
      : previous.bestTimeMs;

    // Les étoiles suivent toujours le meilleur temps : impossible
    // de régresser son record d'étoiles en jouant plus lentement.
    const bestStars = isRecord
      ? stars
      : Math.max(previous.stars, stars);

    this.mapRecords.update(records => ({
      ...records,
      [map.id]: { bestTimeMs, stars: bestStars },
    }));

    return isRecord;
  }


  // --------------------------------
  // Navigation
  // --------------------------------

  readonly currentScreen = signal<GameScreen>('main-menu');


  navigateTo(screen: GameScreen): void {
    this.currentScreen.set(screen);
  }

  // --------------------------------
  // Argent du joueur
  // --------------------------------

  readonly money = signal(250);

  addMoney(amount: number): void {
    this.money.update(value => value + Math.max(0, amount));
  }

  spendMoney(amount: number): boolean {

    if (amount < 0 || this.money() < amount) {
      return false;
    }

    this.money.update(value => value - amount);

    return true;
  }

  // --------------------------------
  // Cartes
  // --------------------------------

  readonly selectedMap = signal<GameMap | null>(null);

  selectMap(map: GameMap): void {
    this.selectedMap.set(map);
  }

  // --------------------------------
  // Outils
  // --------------------------------

  readonly ownedTools = signal<string[]>([
    'sponge',
    'brush'
  ]);

  readonly equippedToolId = signal('sponge');

  ownsTool(toolId: string): boolean {
    return this.ownedTools().includes(toolId);
  }

  unlockTool(toolId: string): void {

    if (this.ownsTool(toolId)) return;

    this.ownedTools.update(tools => [
      ...tools,
      toolId
    ]);
  }

  equipTool(toolId: string): boolean {

    if (!this.ownsTool(toolId)) {
      return false;
    }

    this.equippedToolId.set(toolId);

    return true;
  }

  
/**
 * Retourne les caractéristiques finales d'un outil,
 * en tenant compte de toutes ses améliorations.
 *
 * Les données originales du catalogue ne sont jamais modifiées.
 */
getUpgradedTool(toolId: string): CleaningTool | undefined {

  const baseTool = this.getTool(toolId);

  if (!baseTool) {
    return undefined;
  }

  // Récupération des niveaux d'amélioration.
  const levels = this.upgradeInventory()[toolId] ?? {};

  const radiusLevel = levels.radius ?? 0;
  const powerLevel = levels.power ?? 0;
  const efficiencyLevel = levels.efficiency ?? 0;
  const penetrationLevel = levels.penetration ?? 0;

  // Création d'une copie de l'outil original.
  return {

    ...baseTool,

    // Rayon : +10 % par niveau.
    radius:
      baseTool.radius * (1 + 0.10 * radiusLevel),

    // Puissance : +15 % par niveau.
    power:
      baseTool.power * (1 + 0.15 * powerLevel),

    // Efficacité : +10 % par niveau.
    efficiency: Object.fromEntries(
      Object.entries(baseTool.efficiency).map(
        ([dirtId, value]) => [
          dirtId,
          value * (1 + 0.10 * efficiencyLevel)
        ]
      )
    ),

    // Pénétration : réduction multiplicative du malus.
    depthPenalty:
      baseTool.depthPenalty * Math.pow(
        0.90,
        penetrationLevel
      )
  };
}


/**
 * Retourne l'outil actuellement équipé
 * avec toutes ses améliorations appliquées.
 */
getEquippedTool(): CleaningTool | undefined {

  return this.getUpgradedTool(
    this.equippedToolId()
  );
}


}
