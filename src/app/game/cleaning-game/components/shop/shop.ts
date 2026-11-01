import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GamingState } from '../../../services/gaming-state';
import { CleaningTool, ToolUpgradeType } from '../../../models/cleaning-tool';
import { ToolUpgrade } from '../../../models/tool-upgrade';

/**
 * Boutique : achat d'outils et d'améliorations.
 */
@Component({
  imports: [CommonModule],
  selector: 'wash-shop',
  styleUrl: './shop.scss',
  templateUrl: './shop.html',
})
export class Shop {

  readonly gamingState = inject(GamingState);

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
