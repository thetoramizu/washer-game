
import { GameMap } from './game-map';

/**
 * Catalogue de toutes les cartes du jeu.
 *
 * Les cartes sont regroupées par monde (voir game-worlds.data) :
 * maison, peinture, extérieur et nuit.
 */
export const GAME_MAPS: GameMap[] = [

  // --------------------------------
  // Monde : Maison
  // --------------------------------

  {
    id: 'terrace',
    worldId: 'home',
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

    previewColor: '#a6a18b',
    surfaceStyle: 'tiles'
  },

  {
    id: 'garden',
    worldId: 'home',
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

    previewColor: '#8a9d77',
    surfaceStyle: 'garden'
  },

  {
    id: 'basement',
    worldId: 'home',
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

    previewColor: '#777b79',
    surfaceStyle: 'concrete'
  },

  // --------------------------------
  // Monde : Peinture
  // --------------------------------

  {
    id: 'attic-painting',
    worldId: 'painting',
    name: 'Tableau du grenier',
    description:
      'Une vieille toile oubliée sous des années de poussière.',

    width: 700,
    height: 520,

    difficulty: 'easy',

    dirtDensity: {
      dust: 75
    },

    unlockPrice: 0,
    unlockedByDefault: true,

    previewColor: '#c9b28a',
    surfaceStyle: 'canvas'
  },

  {
    id: 'gallery-painting',
    worldId: 'painting',
    name: 'Toile de galerie',
    description:
      'Un grand tableau encrassé par la moisissure des murs humides.',

    width: 1000,
    height: 650,

    difficulty: 'medium',

    dirtDensity: {
      dust: 55,
      mold: 60
    },

    unlockPrice: 450,
    unlockedByDefault: false,

    previewColor: '#b09bc4',
    surfaceStyle: 'canvas'
  },

  // --------------------------------
  // Monde : Extérieur
  // --------------------------------

  {
    id: 'path',
    worldId: 'outdoor',
    name: 'Chemin de traverse',
    description:
      'Un sentier bordé d\'herbe que la mousse a envahi.',

    width: 1100,
    height: 520,

    difficulty: 'easy',

    dirtDensity: {
      dust: 45,
      mud: 55,
      moss: 60
    },

    unlockPrice: 150,
    unlockedByDefault: false,

    previewColor: '#9aa87e',
    surfaceStyle: 'road'
  },

  {
    id: 'road',
    worldId: 'outdoor',
    name: 'Route de campagne',
    description:
      'L\'asphalte délavé attend un bon coup de nettoyeur.',

    width: 1500,
    height: 640,

    difficulty: 'medium',

    dirtDensity: {
      dust: 60,
      mud: 65,
      moss: 40
    },

    unlockPrice: 550,
    unlockedByDefault: false,

    previewColor: '#8f9296',
    surfaceStyle: 'road'
  },

  // --------------------------------
  // Monde : Nuit
  // --------------------------------

  {
    id: 'night-alley',
    worldId: 'night',
    name: 'Ruelle de minuit',
    description:
      'Plongée dans le noir : seul le halo de ton outil révèle les taches.',

    width: 900,
    height: 600,

    difficulty: 'medium',

    dirtDensity: {
      mud: 50,
      mold: 55
    },

    unlockPrice: 600,
    unlockedByDefault: false,

    previewColor: '#2b2f45',
    surfaceStyle: 'night'
  },

  {
    id: 'night-highway',
    worldId: 'night',
    name: 'Autoroute nocturne',
    description:
      'Une immense chaussée noire où chaque tache doit être débusquée à la lampe.',

    width: 1500,
    height: 760,

    difficulty: 'hard',

    dirtDensity: {
      mud: 60,
      mold: 85,
      moss: 45
    },

    unlockPrice: 950,
    unlockedByDefault: false,

    previewColor: '#22263a',
    surfaceStyle: 'night'
  }

];
