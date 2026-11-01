export interface DirtType {
  id: string;
  name: string;

  // Résistance de la salissure
  resistance: number;

  // Couleur utilisée pour le rendu
  color: string;

  // Multiplicateur de récompense futur
  rewardMultiplier: number;
}
