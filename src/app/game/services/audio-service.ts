import { computed, inject, Service } from '@angular/core';
import { GamingState } from './gaming-state';

/**
 * Sons du jeu, entièrement synthétisés via la Web Audio API :
 * aucun fichier audio n'est nécessaire.
 *
 * L'AudioContext n'est créé qu'au premier geste utilisateur
 * (clic/touche), car les navigateurs bloquent tout son émis
 * avant une interaction. Le volume maître est volontairement
 * bas : ces sons sont d'agrément, pas de distraction.
 */
@Service()
export class AudioService {

  private readonly gamingState = inject(GamingState);

  // Contexte audio unique, créé paresseusement au premier son.
  private ctx: AudioContext | null = null;

  // Bus commun à tous les effets, pour un contrôle global.
  private masterGain: GainNode | null = null;

  // Bruit blanc précalculé une fois, réutilisé par le frottement
  // et les éclaboussures (créer un buffer par note serait coûteux).
  private noiseBuffer: AudioBuffer | null = null;

  // Horodatage de la dernière gouttelette sonore émise, pour
  // éviter que le splash ne crépite à 60 Hz pendant un frottement.
  private lastSplashAt = 0;

  /**
   * Les sons suivent automatiquement le réglage sauvegardé
   * dans le menu (GamingState.soundEnabled).
   */
  readonly enabled = computed(() => this.gamingState.soundEnabled());

  /**
   * À appeler au premier clic/touche de l'utilisateur : crée
   * l'AudioContext (obligatoirement dans un geste) et le remet
   * en route s'il avait été suspendu par le navigateur.
   */
  unlock(): void {

    const ctx = this.ensureContext();

    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {/* refus du navigateur : silencieux */});
    }
  }

  /**
   * Frottement discret pendant un nettoyage efficace : bruit
   * filtré passe-bande, court et étouffé, modulé par l'intensité
   * du passage de l'outil.
   */
  playScrub(intensity = 1): void {

    if (!this.enabled()) return;

    const ctx = this.ensureContext();

    if (!ctx || !this.noiseBuffer || !this.masterGain) return;

    const now = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    // Démarre à un offset aléatoire : deux frottements consécutifs
    // ne sonnent jamais exactement pareil.
    source.playbackRate.value = 0.8 + Math.random() * 0.5;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 700 + Math.random() * 500;
    band.Q.value = 0.8;

    const gain = ctx.createGain();

    const peak = Math.min(0.05, 0.02 + 0.03 * intensity);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    source.connect(band).connect(gain).connect(this.masterGain);

    source.start(now);
    source.stop(now + 0.15);
  }

  /**
   * Éclaboussure : courte salve de gouttelettes aiguës qui
   * retombent en fréquence. Throottlée en interne (~90 ms) pour
   * rester audible sans devenir un grésillement continu.
   */
  playSplash(): void {

    if (!this.enabled()) return;

    const ctx = this.ensureContext();

    if (!ctx || !this.noiseBuffer || !this.masterGain) return;

    const now = performance.now();

    if (now - this.lastSplashAt < 90) return;

    this.lastSplashAt = now;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 1200;

    const gain = ctx.createGain();

    const start = ctx.currentTime;

    gain.gain.setValueAtTime(0.05, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);

    // Balayage descendant : « plouf » bref.
    highpass.frequency.setValueAtTime(2400, start);
    highpass.frequency.exponentialRampToValueAtTime(900, start + 0.1);

    source.connect(highpass).connect(gain).connect(this.masterGain);

    source.start(start);
    source.stop(start + 0.13);
  }

  /**
   * Petit « tick » de confirmation (changement d'outil…).
   */
  playClick(): void {

    if (!this.enabled()) return;

    const ctx = this.ensureContext();

    if (!ctx || !this.masterGain) return;

    this.tone(880, ctx.currentTime, 0.05, 'triangle', 0.05);
  }

  /**
   * Carillon de victoire : accord parfait majeur arpégé
   * (do–mi–sol–do) avec longue traîne, façon clochette.
   */
  playVictoryDing(): void {

    if (!this.enabled()) return;

    const ctx = this.ensureContext();

    if (!ctx || !this.masterGain) return;

    const start = ctx.currentTime;

    [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
      this.tone(freq, start + index * 0.12, 0.9, 'sine', 0.12);
      // Légère octave supérieure en sourdine : brillance.
      this.tone(freq * 2, start + index * 0.12, 0.5, 'sine', 0.03);
    });
  }

  // --------------------------------
  // Interne
  // --------------------------------

  /**
   * Une note sinusoïdale avec attaque rapide et décroissance
   * exponentielle — la base de tous les sons « propres » du jeu.
   */
  private tone(
    frequency: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    peak: number
  ): void {

    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;

    const gain = this.ctx.createGain();

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain).connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  /**
   * Création paresseuse du contexte audio et du bus de sortie.
   * Retourne null si la Web Audio API est indisponible : le jeu
   * continue alors silencieusement.
   */
  private ensureContext(): AudioContext | null {

    if (this.ctx) return this.ctx;

    const Ctor = typeof window !== 'undefined'
      ? window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;

    if (!Ctor) return null;

    try {
      this.ctx = new Ctor();
    } catch {
      return null;
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.6;
    this.masterGain.connect(this.ctx.destination);

    // Un peu plus d'une seconde de bruit blanc : largement
    // suffisant pour couvrir la durée des effets filtrés.
    const length = Math.floor(this.ctx.sampleRate * 1.1);

    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);

    const channel = this.noiseBuffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      channel[i] = Math.random() * 2 - 1;
    }

    return this.ctx;
  }
}
