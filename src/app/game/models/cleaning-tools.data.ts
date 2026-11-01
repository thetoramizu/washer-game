import { CleaningTool } from './cleaning-tool';

/**
 * Catalogue des outils disponibles dans le jeu.
 *
 * Les coefficients d'efficacité sont indépendants
 * de la puissance générale de chaque outil.
 */
export const CLEANING_TOOLS: CleaningTool[] = [

    // --------------------------------
    // Éponge basique
    // --------------------------------

    {
        id: 'sponge',
        name: 'Éponge basique',

        radius: 38,
        power: 1,

        // Chaque couche supplémentaire réduit
        // l'efficacité de 30 %.
        depthPenalty: 0.30,

        efficiency: {
            dust: 1,
            mud: 0.8,
            mold: 0.5,
            moss: 0.1
        }
    },

    // --------------------------------
    // Brosse professionnelle
    // --------------------------------

    {
        id: 'brush',
        name: 'Brosse professionnelle',

        radius: 45,
        power: 1.5,

        // La brosse pénètre mieux les couches profondes.
        depthPenalty: 0.15,

        efficiency: {
            dust: 0.6,
            mud: 1,
            mold: 0.8,
            moss: 2
        }
    },


 // --------------------------------
    // DEBUG
    // --------------------------------

    {
        id: 'overpowered',
        name: 'Cheat',

        radius: 145,
        power: 11.5,

        // La brosse pénètre mieux les couches profondes.
        depthPenalty: 0.15,

        efficiency: {
            dust: 0.6,
            mud: 1,
            mold: 0.8,
            moss: 2
        }
    }

];
