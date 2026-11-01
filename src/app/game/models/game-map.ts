
/**
 * Configuration d'une carte.
 */
export interface GameMap {

  // Identifiant unique de la carte.
  id: string;

  // Nom affiché dans l'interface.
  name: string;

  // Dimensions de la carte.
  width: number;
  height: number;

  /**
   * Densité de chaque type de salissure.
   *
   * La valeur représente le nombre de zones
   * générées pour ce type de salissure.
   *
   * Une salissure absente de cet objet
   * ne sera pas générée sur la carte.
   */
  dirtDensity: Record<string, number>;
}
