
import { GameMap } from './game-map';

/**
 * Catalogue des cartes disponibles.
 *
 * Ajouter une carte ne nécessite aucune modification
 * du moteur de nettoyage.
 */
export const GAME_MAPS: GameMap[] = [

  // --------------------------------
  // Carte 1 : Terrasse
  // --------------------------------

  {
    id: 'terrace',
    name: 'Terrasse',

    width: 800,
    height: 500,

    dirtDensity: {
      dust: 60,
      mud: 35
    }
  },

  // --------------------------------
  // Carte 2 : Jardin abandonné
  // --------------------------------

  {
    id: 'garden',
    name: 'Jardin abandonné',

    width: 800,
    height: 500,

    dirtDensity: {
      dust: 50,
      mud: 45,
      moss: 70
    }
  },

  // --------------------------------
  // Carte 3 : Sous-sol
  // --------------------------------

  {
    id: 'basement',
    name: 'Sous-sol',

    width: 800,
    height: 500,

    dirtDensity: {
      dust: 40,
      mud: 35,
      mold: 90,
      moss: 45
    }
  }

];
