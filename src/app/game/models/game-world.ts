/**
 * Identifiant visuel de la surface propre d'une carte.
 *
 * Chaque monde propose ses propres textures, dessinées par
 * generateCleanSurface() dans l'écran de jeu.
 */
export type SurfaceStyle =
  | 'tiles'      // Dalles de pierre (terrasse).
  | 'garden'     // Terre et herbe (jardin).
  | 'concrete'   // Béton brut (sous-sol).
  | 'canvas'     // Toile encadrée à dépoussiérer (peinture).
  | 'road'       // Asphalte avec marquage au sol (extérieur).
  | 'night';     // Allée sombre éclairée par une lanterne (nuit).

/**
 * Un « monde » regroupe un ensemble de cartes partageant
 * la même ambiance visuelle et la même famille de salissures.
 */
export interface GameWorld {

  // Identifiant unique.
  id: string;

  // Nom affiché dans la sélection de cartes.
  name: string;

  // Description courte du monde.
  description: string;

  // Couleur d'accentuation utilisée par les badges du monde.
  color: string;

  // Emoji illustratif affiché sur les en-têtes de monde.
  icon: string;
}
