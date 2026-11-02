import { GameWorld } from './game-world';

/**
 * Catalogue des mondes du jeu.
 *
 * Chaque monde rassemble des cartes qui partagent la même
 * ambiance : peinture (tableaux à restaurer), extérieur
 * (routes et chemins) et nuit (carte noire, seul le halo de
 * l'outil révèle les salissures).
 */
export const GAME_WORLDS: GameWorld[] = [

  {
    id: 'home',
    name: 'Maison',
    description: 'Terrasses et intérieurs à remettre à neuf.',
    color: '#648b70',
    icon: '🏠'
  },

  {
    id: 'painting',
    name: 'Peinture',
    description:
      'De vieux tableaux couverts de poussière à restaurer avec délicatesse.',
    color: '#a56f9e',
    icon: '🖼️'
  },

  {
    id: 'outdoor',
    name: 'Extérieur',
    description:
      'Routes, allées et chemins envahis par la mousse et la boue.',
    color: '#4d86a8',
    icon: '🛣️'
  },

  {
    id: 'night',
    name: 'Nuit',
    description:
      'La lampe de ton outil est la seule lumière : le reste de la carte est noir.',
    color: '#3d4470',
    icon: '🌙'
  }
];
