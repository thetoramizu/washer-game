import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideSaveStorage } from './game/services/local-save-storage';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),

    // Support de sauvegarde du jeu (localStorage par défaut ;
    // remplacer par une autre implémentation de SaveStorage pour
    // un fichier via Electron/Tauri ou un backend HTTP).
    provideSaveStorage()
  ]
};
