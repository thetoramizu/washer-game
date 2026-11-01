
import { DirtType } from './dirt-type';

export const DIRT_TYPES: DirtType[] = [
  {
    id: 'moss',
    name: 'Mousse',
    resistance: 30,
    color: '#527b37',
    rewardMultiplier: 1
  },
  {
    id: 'mold',
    name: 'Moisissure',
    resistance: 80,
    color: '#294b32',
    rewardMultiplier: 2
  },
  {
    id: 'mud',
    name: 'Boue',
    resistance: 20,
    color: '#765034',
    rewardMultiplier: 0.8
  },
  {
    id: 'dust',
    name: 'Poussière',
    resistance: 10,
    color: '#a99b7e',
    rewardMultiplier: 0.5
  }
];
