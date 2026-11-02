import { Injectable, inject, signal } from '@angular/core';

import { SaveState } from './save-state';

/**
 * Ambiances synthétisées, une par monde de surface.
 */
export type WorldAmbience = 'home' | 'painting' | 'outdoor' | 'night';

/**
 * Service audio 100 % synthétisé (Web Audio API).
 *
 * Aucun fichier audio : tous les sons sont fabriqués à la volée —
 * bruit blanc filtré pour le frottement, oscillateurs pour les
 * gains et l'ambiance, petit arpège pour la victoire.
 *
 * Contraintes navigateur respectées :
 * - l'AudioContext n'est créé qu'au premier geste utilisateur
 *   (politique d'autoplay) via `ensureStarted()` ;
 * - tout est défensif : si Web Audio est indisponible, le service
 *   devient silencieusement inoffensif.
 */
@Injectable({ providedIn: 'root' })
export class AudioService {

  private readonly saveState = inject(SaveState);

  /**
   * État du son, lié à la sauvegarde (`audioMuted`).
   */
  readonly muted = this.saveState.audioMuted;

  // Contexte audio unique, créé au premier geste utilisateur.
  private ctx: AudioContext | null = null;

  // Chaîne principale : master -> destination.
  private master: GainNode | null = null;

  // Bus dédié à l'ambiance (plus discret que les effets).
  private ambienceGain: GainNode | null = null;

  // Source de bruit blanc, réutilisée par toutes les couches
  // filtrées (frottement, gouttes, souffle).
  private noiseBuffer: AudioBuffer | null = null;

  // --- Frottement (son continu pendant le nettoyage) ---
  private scrubSource: AudioBufferSourceNode | null = null;
  private scrubBandpass: BiquadFilterNode | null = null;
  private scrubGain: GainNode | null = null;

  // --- Ambiance par monde ---
  private ambienceNodes: AudioNode[] = [];
  private currentAmbience: WorldAmbience | null = null;

  /**
   * À appeler au premier geste utilisateur (clic sur un bouton,
   * pointerdown sur le canvas) : crée l'AudioContext et applique
   * l'état muet mémorisé. Aucune opération avant ce démarrage.
   */
  ensureStarted(): void {

    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ??
          (window as unknown as Record<string, typeof AudioContext>)
            ['webkitAudioContext'];

        if (!Ctor) return;

        this.ctx = new Ctor();

        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted() ? 0 : 0.9;
        this.master.connect(this.ctx.destination);

        this.ambienceGain = this.ctx.createGain();
        this.ambienceGain.gain.value = 0.5;
        this.ambienceGain.connect(this.master);

        this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
      } catch {
        // Web Audio indisponible : le jeu reste jouable en silence.
        this.ctx = null;
        return;
      }
    }

    // Les navigateurs suspendent le contexte tant qu'aucun geste
    // n'a eu lieu : on le réveille à chaque interaction.
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Bascule le son et persiste le choix dans la sauvegarde.
   */
  toggleMute(): void {

    const next = !this.muted();

    this.muted.set(next);

    if (this.master && this.ctx) {
      // Fondu court pour éviter un clic désagréable.
      this.master.gain.linearRampToValueAtTime(
        next ? 0 : 0.9,
        this.ctx.currentTime + 0.1
      );
    }
  }

  // --------------------------------
  // Frottement
  // --------------------------------

  /**
   * Démarre le son de brosse (boucle de bruit blanc passe-bande).
   */
  startScrub(): void {

    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    if (this.scrubSource) return;

    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 600;
    bandpass.Q.value = 0.8;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(this.master);

    source.start();

    // Montée rapide du volume.
    gain.gain.linearRampToValueAtTime(
      0.16,
      this.ctx.currentTime + 0.06
    );

    this.scrubSource = source;
    this.scrubBandpass = bandpass;
    this.scrubGain = gain;
  }

  /**
   * Module le frottement selon la vitesse du curseur : plus on
   * va vite, plus le filtre monte (son de brosse plus « aigu »)
   * et plus le volume augmente légèrement.
   */
  updateScrubVelocity(speed: number): void {

    if (!this.ctx || !this.scrubBandpass || !this.scrubGain) return;

    const normalized = Math.min(1, speed / 900);

    const now = this.ctx.currentTime;

    this.scrubBandpass.frequency.setTargetAtTime(
      420 + normalized * 1700,
      now,
      0.05
    );

    this.scrubGain.gain.setTargetAtTime(
      0.05 + normalized * 0.13,
      now,
      0.05
    );
  }

  /**
   * Arrête proprement le frottement (fondu court).
   */
  stopScrub(): void {

    if (!this.ctx || !this.scrubSource || !this.scrubGain) return;

    const source = this.scrubSource;
    const gain = this.scrubGain;
    const end = this.ctx.currentTime + 0.12;

    gain.gain.cancelScheduledValues(this.ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, end);

    try {
      source.stop(end + 0.02);
    } catch {
      // Déjà arrêté : sans gravité.
    }

    this.scrubSource = null;
    this.scrubBandpass = null;
    this.scrubGain = null;
  }

  // --------------------------------
  // Effets ponctuels
  // --------------------------------

  /**
   * Petit « cha-ching » : deux notes dorées quand un palier de
   * gain est atteint ou quand une récompense est versée.
   */
  playMoneyPing(strong = false): void {

    const base = strong ? 880 : 1175;

    this.tone(base, 0, 0.12, strong ? 0.16 : 0.1);
    this.tone(base * 1.5, 0.07, 0.18, strong ? 0.14 : 0.08);
  }

  /**
   * Arpège de victoire (la → mi → la aiguë + accord final).
   */
  playVictory(): void {

    const steps: [number, number][] = [
      [523.25, 0],
      [659.25, 0.12],
      [783.99, 0.24],
      [1046.5, 0.36],
    ];

    for (const [freq, delay] of steps) {
      this.tone(freq, delay, 0.28, 0.12);
    }

    // Accord brillant plaqué à la fin.
    this.tone(659.25, 0.48, 0.5, 0.06);
    this.tone(830.61, 0.48, 0.5, 0.06);
    this.tone(987.77, 0.48, 0.5, 0.06);
  }

  /**
   * Clic doux des boutons d'interface.
   */
  playUiClick(): void {
    this.tone(660, 0, 0.05, 0.05);
  }

  // --------------------------------
  // Ambiances par monde
  // --------------------------------

  /**
   * Lance (ou change) l'ambiance sonore d'un monde. Idempotent :
   * relancer la même ambiance ne recrée rien.
   */
  startAmbience(world: WorldAmbience): void {

    if (!this.ctx || !this.ambienceGain || !this.noiseBuffer) return;

    if (this.currentAmbience === world) return;

    this.stopAmbience();
    this.currentAmbience = world;

    const ctx = this.ctx;
    const nodes: AudioNode[] = [];

    // Souffle/vent commun : bruit blanc très filtré en passe-bas.
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value =
      world === 'outdoor' ? 420 : world === 'night' ? 240 : 320;

    const windGain = ctx.createGain();
    windGain.gain.value = world === 'outdoor' ? 0.05 : 0.03;

    // Lente modulation du souffle (respiration de l'ambiance).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain);
    lfoGain.connect(windGain.gain);

    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.ambienceGain);

    wind.start();
    lfo.start();

    nodes.push(wind, windFilter, windGain, lfo, lfoGain);

    // Drone grave (sous-sol, peinture, nuit).
    if (world !== 'outdoor') {
      const drone = ctx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value =
        world === 'night' ? 55 : world === 'painting' ? 90 : 70;

      const droneGain = ctx.createGain();
      droneGain.gain.value = world === 'night' ? 0.035 : 0.025;

      drone.connect(droneGain);
      droneGain.connect(this.ambienceGain);

      drone.start();
      nodes.push(drone, droneGain);
    }

    // Gouttes occasionnelles (monde maison uniquement).
    if (world === 'home') {
      this.scheduleDrips();
    }

    this.ambienceNodes = nodes;
  }

  /**
   * Programme une série de gouttes aléatoires ; chaque timeout
   * rejoue une nouvelle goutte tant que l'ambiance est active.
   */
  private scheduleDrips(): void {

    const tick = () => {

      // L'ambiance a été coupée entre-temps : on s'arrête net.
      if (this.currentAmbience !== 'home') return;

      if (this.ctx && this.ambienceGain) {
        const freq = 1200 + Math.random() * 900;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;

        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

        osc.connect(gain);
        gain.connect(this.ambienceGain);

        osc.start(now);
        osc.stop(now + 0.2);
      }

      setTimeout(tick, 2500 + Math.random() * 4000);
    };

    setTimeout(tick, 1800);
  }

  /**
   * Coupe l'ambiance en cours (avec fondu).
   */
  stopAmbience(): void {

    this.currentAmbience = null;

    if (!this.ctx) {
      this.ambienceNodes = [];
      return;
    }

    const end = this.ctx.currentTime + 0.3;

    for (const node of this.ambienceNodes) {

      if (node instanceof OscillatorNode ||
          node instanceof AudioBufferSourceNode) {
        try {
          node.stop(end);
        } catch {
          // Déjà arrêté : sans gravité.
        }
      }

      if (node instanceof GainNode) {
        node.gain.linearRampToValueAtTime(0, end);
      }

      node.disconnect(end);
    }

    this.ambienceNodes = [];
  }

  // --------------------------------
  // Interne
  // --------------------------------

  /**
   * Joue une note sinusoïdale simple avec enveloppe exponentielle.
   */
  private tone(
    frequency: number,
    delay: number,
    duration: number,
    volume: number
  ): void {

    if (!this.ctx || !this.master) return;

    const now = this.ctx.currentTime + delay;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.master);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  /**
   * Tampon de bruit blanc (2 s), partagé par toutes les couches
   * filtrées — généré une seule fois.
   */
  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {

    const buffer = ctx.createBuffer(
      1,
      ctx.sampleRate * 2,
      ctx.sampleRate
    );

    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    return buffer;
  }
}
