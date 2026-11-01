
import { ToolUpgrade } from './tool-upgrade';

/**
 * Configuration générale des améliorations.
 */
export const TOOL_UPGRADES: ToolUpgrade[] = [

  {
    id: 'radius',
    name: 'Rayon',
    description: 'Augmente la surface couverte par le pinceau.',

    valuePerLevel: 0.10,

    basePrice: 100,
    priceMultiplier: 1.6,

    maxLevel: 5
  },

  {
    id: 'power',
    name: 'Puissance',
    description: 'Augmente la vitesse de nettoyage.',

    valuePerLevel: 0.15,

    basePrice: 150,
    priceMultiplier: 1.7,

    maxLevel: 5
  },

  {
    id: 'efficiency',
    name: 'Efficacité',
    description: 'Renforce proportionnellement les spécialités de l’outil.',

    valuePerLevel: 0.10,

    basePrice: 125,
    priceMultiplier: 1.6,

    maxLevel: 5
  },

  {
    id: 'penetration',
    name: 'Pénétration',
    description: 'Réduit le malus appliqué aux couches profondes.',

    valuePerLevel: 0.10,

    basePrice: 175,
    priceMultiplier: 1.8,

    maxLevel: 5
  }

];
