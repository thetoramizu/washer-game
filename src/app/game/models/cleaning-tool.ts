
export interface CleaningTool {
  id: string;
  name: string;

  // Rayon du pinceau
  radius: number;

  // Puissance générale de l'outil
  power: number;

  // Malus appliqué par couche supplémentaire
  depthPenalty: number;

  // Efficacité selon le type de salissure
  efficiency: Record<string, number>;
}
