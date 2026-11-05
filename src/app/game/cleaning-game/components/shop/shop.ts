import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GamingState } from '../../../services/gaming-state';
import { CleaningTool, ToolUpgradeType } from '../../../models/cleaning-tool';
import { GameMap } from '../../../models/game-map';
import { GAME_MAPS } from '../../../models/game-maps.data';
import { ToolUpgrade } from '../../../models/tool-upgrade';

/** Nom lisible des types de salissure (clé → étiquette). */
const DIRT_LABELS: Record<string, string> = {
  dust: 'Poussière',
  mud: 'Boue',
  mold: 'Moisissure',
  moss: 'Mousse'
};

/** Onglets de la boutique. */
export type ShopTab = 'tools' | 'maps';

/**
 * Boutique : achat d'outils, d'améliorations et de cartes.
 */
@Component({
  imports: [CommonModule],
  selector: 'wash-shop',
  styleUrl: './shop.scss',
  templateUrl: './shop.html',
})
export class Shop {

  readonly gamingState = inject(GamingState);

  /** Onglet affiché. */
  readonly activeTab = signal<ShopTab>('tools');

  /** Catalogue des cartes, pour l'onglet « Cartes ». */
  readonly maps = GAME_MAPS;

  selectTab(tab: ShopTab): void {
    this.activeTab.set(tab);
  }

  dirtLabel(dirtId: string): string {
    return DIRT_LABELS[dirtId] ?? dirtId;
  }

  /**
   * Tente de débloquer une carte depuis la boutique.
   */
  buyMap(map: GameMap): void {
    this.gamingState.unlockMap(map);
  }

  /**
   * Statistiques affichées dans une carte d'outil : valeurs de
   * base, puis valeurs réellement en jeu (améliorations incluses).
   *
   * Les stats « améliorées » sont recalculées à partir du signal
   * `upgradeInventory` : la boutique se met donc à jour
   * instantanément après chaque achat.
   */
  getToolStats(toolId: string): {
    radius: number;
    power: number;
    depthPenalty: number;
    efficiency: Record<string, number>;
    hasUpgradesApplied: boolean;
  } {

    const base = this.gamingState.getTool(toolId);
    const upgraded = this.gamingState.getUpgradedTool(toolId);

    if (!base || !upgraded) {
      return {
        radius: 0,
        power: 0,
        depthPenalty: 0,
        efficiency: {},
        hasUpgradesApplied: false
      };
    }

    // Un outil possède des améliorations appliquées dès qu'une
    // entrée existe dans l'inventaire pour lui.
    const levels = this.gamingState.upgradeInventory()[toolId] ?? {};

    const hasUpgradesApplied = Object.values(levels).some(
      level => (level ?? 0) > 0
    );

    return {
      radius: upgraded.radius,
      power: upgraded.power,
      depthPenalty: upgraded.depthPenalty,
      efficiency: upgraded.efficiency,
      hasUpgradesApplied
    };
  }

  /**
   * Prochaine valeur d'une statistique si le joueur achète le
   * niveau suivant de l'amélioration correspondante — sert à
   * afficher « avant → après » sur le bouton d'achat.
   */
  previewUpgradeEffect(
    toolId: string,
    upgradeId: ToolUpgradeType
  ): string | null {

    const tool = this.gamingState.getTool(toolId);
    const upgraded = this.gamingState.getUpgradedTool(toolId);

    if (!tool || !upgraded) return null;

    const level = this.gamingState.getUpgradeLevel(toolId, upgradeId);

    switch (upgradeId) {

      case 'radius': {
        const next = tool.radius * (1 + 0.10 * (level + 1));
        const current = tool.radius * (1 + 0.10 * level);
        return `${current.toFixed(0)} → ${next.toFixed(0)} px`;
      }

      case 'power': {
        const next = tool.power * (1 + 0.15 * (level + 1));
        const current = tool.power * (1 + 0.15 * level);
        return `${current.toFixed(2)} × → ${next.toFixed(2)} ×`;
      }

      case 'efficiency': {
        const nextMult = 1 + 0.10 * (level + 1);
        const currentMult = 1 + 0.10 * level;
        return `spécialités ×${currentMult.toFixed(2)} → ×${nextMult.toFixed(2)}`;
      }

      case 'penetration': {
        const next = tool.depthPenalty * Math.pow(0.90, level + 1);
        const current = tool.depthPenalty * Math.pow(0.90, level);
        return `malus ${(current * 100).toFixed(0)} % → ${(next * 100).toFixed(0)} %`;
      }
    }

    return null;
  }

  /**
   * Améliorations disponibles pour un outil,
   * accompagnées de leur niveau et prix actuels.
   */
  getUpgradeRows(toolId: string): {
    upgrade: ToolUpgrade;
    level: number;
    price: number;
    maxedOut: boolean;
  }[] {

    const tool = this.gamingState.getTool(toolId);

    if (!tool) return [];

    return tool.availableUpgrades.map(upgradeId => {

      const upgrade = this.gamingState.upgrades.find(
        item => item.id === upgradeId
      )!;

      const level = this.gamingState.getUpgradeLevel(
        toolId,
        upgradeId
      );

      return {
        upgrade,
        level,
        price: this.gamingState.getUpgradePrice(toolId, upgradeId),
        maxedOut: level >= upgrade.maxLevel
      };
    });
  }

  /**
   * Tente d'acheter un nouvel outil.
   */
  buyTool(tool: CleaningTool): void {
    this.gamingState.buyTool(tool);
  }

  /**
   * Tente d'acheter le prochain niveau d'amélioration.
   */
  buyUpgrade(toolId: string, upgradeId: ToolUpgradeType): void {
    this.gamingState.buyUpgrade(toolId, upgradeId);
  }

  /**
   * Retour au menu principal.
   */
  goBack(): void {
    this.gamingState.navigateTo('main-menu');
  }
}
