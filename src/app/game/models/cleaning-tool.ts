
/**
 * Types d'améliorations disponibles.
 */
export type ToolUpgradeType =
  | 'radius'
  | 'power'
  | 'efficiency'
  | 'penetration';

/**
 * Configuration d'un outil de nettoyage.
 */
export interface CleaningTool {

  id: string;
  name: string;

  // Rayon du pinceau.
  radius: number;

  // Puissance générale de l'outil.
  power: number;

  // Malus appliqué par couche supplémentaire.
  depthPenalty: number;

  // Efficacité selon le type de salissure.
  efficiency: Record<string, number>;

  // Description affichée dans la boutique.
  description: string;

  // Prix d'achat de l'outil.
  price: number;

  // Améliorations disponibles pour cet outil.
  availableUpgrades: ToolUpgradeType[];
}
