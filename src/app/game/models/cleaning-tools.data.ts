import { CleaningTool } from './cleaning-tool';

export const CLEANING_TOOLS: CleaningTool[] = [
  {
    id: 'sponge',
    name: 'Éponge basique',

    radius: 38,
    power: 1,
    depthPenalty: 0.30,

    efficiency: {
      dust: 1,
      mud: 0.8,
      mold: 0.5,
      moss: 0.1
    }
  },
  {
    id: 'brush',
    name: 'Brosse',

    radius: 45,
    power: 1.5,
    depthPenalty: 0.20,

    efficiency: {
      dust: 0.8,
      mud: 1,
      mold: 0.8,
      moss: 2
    }
  }
];
