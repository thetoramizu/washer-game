
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
    id: 'scraper',
    name: 'Racloir à moisissure',

    description:
      'Conçu spécifiquement pour venir à bout des moisissures les ' +
      "plus tenaces. Quasi inefficace contre les autres salissures.",

    radius: 30,
    power: 1.8,
    depthPenalty: 0.10,

    efficiency: {
      dust: 0.05,
      mud: 0.05,
      mold: 4,
      moss: 0.05
    },

    price: 120,

    availableUpgrades: [
      'radius',
      'power',
      'efficiency',
      'penetration'
    ]
  },

  {
    id: 'pressure-washer',
    name: 'Nettoyeur haute pression',

    description:
      'Un jet puissant et large qui décape la plupart des ' +
      'salissures, au prix d\'une précision réduite.',

    radius: 70,
    power: 2.2,
    depthPenalty: 0.35,

    efficiency: {
      dust: 1.5,
      mud: 1.2,
      mold: 0.9,
      moss: 0.6
    },

    price: 250,

    availableUpgrades: [
      'radius',
      'power',
      'penetration'
    ]
  },

  {
    id: 'steam-cleaner',
    name: 'Nettoyeur vapeur',

    description:
      'La vapeur ramollit boue et mousses en profondeur, mais ' +
      'elle reste lente sur les surfaces très étendues.',

    radius: 26,
    power: 2.6,
    depthPenalty: 0.05,

    efficiency: {
      dust: 0.8,
      mud: 1.8,
      mold: 1.4,
      moss: 1.5
    },

    price: 400,

    availableUpgrades: [
      'radius',
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
