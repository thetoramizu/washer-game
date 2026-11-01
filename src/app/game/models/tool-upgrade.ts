
import { ToolUpgradeType } from './cleaning-tool';

/**
 * Configuration d'une amélioration.
 */
export interface ToolUpgrade {

  id: ToolUpgradeType;

  // Nom affiché dans la boutique.
  name: string;

  // Description de l'amélioration.
  description: string;

  // Valeur ajoutée à chaque niveau.
  valuePerLevel: number;

  // Prix du premier niveau.
  basePrice: number;

  // Multiplicateur du prix à chaque niveau.
  priceMultiplier: number;

  // Niveau maximal.
  maxLevel: number;
}

/**
 * Niveaux d'amélioration d'un outil.
 *
 * Chaque outil possède ses propres niveaux.
 */
export type ToolUpgradeLevels = Partial<
  Record<ToolUpgradeType, number>
>;

/**
 * Inventaire des améliorations.
 *
 * La première clé correspond à l'identifiant de l'outil.
 */
export type ToolUpgradeInventory = Record<
  string,
  ToolUpgradeLevels
>;
