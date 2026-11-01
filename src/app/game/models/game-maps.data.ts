
import { GameMap } from './game-map';

/**
 * Catalogue de toutes les cartes du jeu.
 */
export const GAME_MAPS: GameMap[] = [

  {
    id: 'terrace',
    name: 'Terrasse',
    description: 'Une terrasse qui mérite un bon nettoyage.',

    width: 800,
    height: 500,

    difficulty: 'easy',

    dirtDensity: {
      dust: 60,
      mud: 35
    },

    unlockPrice: 0,
    unlockedByDefault: true,

    previewColor: '#a6a18b'
  },

  {
    id: 'garden',
    name: 'Jardin abandonné',
    description: 'La végétation commence à reprendre ses droits.',

    width: 1200,
    height: 750,

    difficulty: 'medium',

    dirtDensity: {
      dust: 50,
      mud: 45,
      moss: 70
    },

    unlockPrice: 300,
    unlockedByDefault: false,

    previewColor: '#8a9d77'
  },

  {
    id: 'basement',
    name: 'Sous-sol',
    description: 'Un endroit humide qui n\'a pas été entretenu depuis longtemps.',

    width: 1600,
    height: 1000,

    difficulty: 'hard',

    dirtDensity: {
      dust: 40,
      mud: 35,
      mold: 90,
      moss: 45
    },

    unlockPrice: 750,
    unlockedByDefault: false,

    previewColor: '#777b79'
  }

];
