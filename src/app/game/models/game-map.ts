
/**
 * Configuration d'une carte du jeu.
 */
export interface GameMap {

  // Identifiant unique.
  id: string;

  // Nom affiché dans les menus.
  name: string;

  // Description de l'environnement.
  description: string;

  // Dimensions réelles de la carte.
  width: number;
  height: number;

  // Niveau de difficulté.
  difficulty: 'easy' | 'medium' | 'hard';

  // Nombre de zones générées pour chaque salissure.
  dirtDensity: Record<string, number>;

  // Prix de déblocage.
  // 0 signifie que la carte est gratuite.
  unlockPrice: number;

  // État de disponibilité initial.
  unlockedByDefault: boolean;

  // Couleur provisoire de l'illustration.
  previewColor: string;
}
