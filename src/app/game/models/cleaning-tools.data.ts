
import { CleaningTool } from './cleaning-tool';

/**
 * Catalogue des outils disponibles dans le jeu.
 */
export const CLEANING_TOOLS: CleaningTool[] = [

  {
    id: 'sponge',
    name: 'Éponge basique',

    description: 'Un outil polyvalent pour les salissures légères.',

    radius: 38,
    power: 1,
    depthPenalty: 0.30,

    efficiency: {
      dust: 1,
      mud: 0.8,
      mold: 0.5,
      moss: 0.1
    },

    price: 0,

    availableUpgrades: [
      'radius',
      'power',
      'efficiency',
      'penetration'
    ]
  },

  {
    id: 'brush',
    name: 'Brosse professionnelle',

    description: 'Une brosse spécialisée dans les salissures tenaces.',

    radius: 45,
    power: 1.5,
    depthPenalty: 0.15,

    efficiency: {
      dust: 0.6,
      mud: 1,
      mold: 0.8,
      moss: 2
    },

    price: 0,

    availableUpgrades: [
      'power',
      'efficiency',
      'penetration'
    ]
  },

  {
    id: 'overpowered',
    name: 'Cheat',

    description: 'Outil de test extrêmement puissant.',

    radius: 145,
    power: 11.5,
    depthPenalty: 0.15,

    efficiency: {
      dust: 0.6,
      mud: 1,
      mold: 0.8,
      moss: 2
    },

    price: 0,

    // Outil de debug : aucune amélioration.
    availableUpgrades: []
  }

];
