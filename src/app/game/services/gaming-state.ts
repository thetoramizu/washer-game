
import { Service, signal } from '@angular/core';

import { GameMap } from '../models/game-map';
import { CleaningTool, ToolUpgradeType } from '../models/cleaning-tool';
import { CLEANING_TOOLS } from '../models/cleaning-tools.data';
import { GAME_MAPS } from '../models/game-maps.data';
import { ToolUpgradeInventory } from '../models/tool-upgrade';
import { TOOL_UPGRADES } from '../models/tool-upgrades-data';
import {
  autoSave,
  clearSave,
  loadSave,
  persistedList,
  persistedSignal
} from './save-storage';

/**
 * Écrans disponibles dans le jeu.
 */
export type GameScreen =
  | 'main-menu'
  | 'map-selection'
  | 'tool-shop'
  | 'game';

/**
 * Clés de sauvegarde (localStorage).
 */
const SAVE_KEYS = {
  money: 'money',
  ownedTools: 'owned-tools',
  equippedTool: 'equipped-tool',
  upgrades: 'upgrades',
  unlockedMaps: 'unlocked-maps',
  sound: 'sound',
} as const;

/**
 * Progression par défaut d'un nouveau profil.
 */
const DEFAULT_MONEY = 250;
const DEFAULT_TOOLS = ['sponge', 'brush'];
const DEFAULT_EQUIPPED_TOOL = 'sponge';
const DEFAULT_MAPS = ['terrace', 'attic-painting'];

@Service()
export class GamingState {

  constructor() {

    // ---------------------------------
    // Sauvegarde automatique
    // ---------------------------------
    // Chaque signal persistant est écrit dans le localStorage
    // (avec anti-rebond) dès qu'il change — y compris lorsque la
    // modification survient hors zone Angular (gains versés par
    // la boucle de rendu du canvas à la victoire).
    autoSave(this.money, SAVE_KEYS.money);
    autoSave(this.ownedTools, SAVE_KEYS.ownedTools);
    autoSave(this.equippedToolId, SAVE_KEYS.equippedTool);
    autoSave(this.upgradeInventory, SAVE_KEYS.upgrades);
    autoSave(this.unlockedMaps, SAVE_KEYS.unlockedMaps);
    autoSave(this.soundEnabled, SAVE_KEYS.sound);
  }

  /**
   * Efface toute la progression sauvegardée et recharge
   * le profil par défaut.
   */
  resetProgress(): void {

    clearSave();

    this.money.set(DEFAULT_MONEY);
    this.ownedTools.set([...DEFAULT_TOOLS]);
    this.equippedToolId.set(DEFAULT_EQUIPPED_TOOL);
    this.upgradeInventory.set({});
    this.unlockedMaps.set([...DEFAULT_MAPS]);
    this.soundEnabled.set(true);
    this.currentScreen.set('main-menu');
  }

  // --------------------------------
  // Préférences
  // --------------------------------

  /**
   * Activation des sons synthétisés (Web Audio API).
   * Sauvegardée entre les sessions.
   */
  readonly soundEnabled = persistedSignal<boolean>(SAVE_KEYS.sound, true);

  toggleSound(): void {
    this.soundEnabled.update(enabled => !enabled);
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
   *
   * Valeur par défaut vide : tout outil sans achat explicite
   * est au niveau 0 (géré par getUpgradeLevel). La sauvegarde
   * éventuelle remplace cette valeur au démarrage.
   */
  readonly upgradeInventory =
    persistedSignal<ToolUpgradeInventory>(SAVE_KEYS.upgrades, {});

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


  // --------------------------------
  // Navigation
  // --------------------------------

  readonly currentScreen = signal<GameScreen>('main-menu');


  navigateTo(screen: GameScreen): void {
    this.currentScreen.set(screen);
  }

  // --------------------------------
  // Progression sauvegardée
  // --------------------------------

  /**
   * Argent du joueur.
   */
  readonly money = persistedSignal<number>(SAVE_KEYS.money, DEFAULT_MONEY);

  /**
   * Outils possédés : seuls les identifiants connus du catalogue
   * sont conservés lors du chargement d'une sauvegarde.
   */
  readonly ownedTools = persistedList<string>(
    SAVE_KEYS.ownedTools,
    DEFAULT_TOOLS,
    (entry): entry is string =>
      typeof entry === 'string' && CLEANING_TOOLS.some(tool => tool.id === entry)
  );

  /**
   * Carte équipée : validée contre le catalogue au chargement.
   */
  readonly equippedToolId = signal<string>(this.readSavedToolId());

  /**
   * Cartes débloquées : seuls les identifiants connus du catalogue
   * sont conservés lors du chargement d'une sauvegarde.
   */
  readonly unlockedMaps = persistedList<string>(
    SAVE_KEYS.unlockedMaps,
    DEFAULT_MAPS,
    (entry): entry is string =>
      typeof entry === 'string' && GAME_MAPS.some(map => map.id === entry)
  );

  /**
   * Lit l'outil équipé sauvegardé, en retombant sur l'outil par
   * défaut s'il est inconnu ou non possédé (cohérence de profil).
   */
  private readSavedToolId(): string {

    const saved = loadSave<string>(SAVE_KEYS.equippedTool);

    if (typeof saved === 'string' && this.ownedTools().includes(saved)) {
      return saved;
    }

    return DEFAULT_EQUIPPED_TOOL;
  }

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
  // (ownedTools / equippedToolId déclarés plus haut, section
  //  « Argent & progression sauvegardée »)

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
