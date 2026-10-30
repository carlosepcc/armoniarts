/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class HarmonicAudioEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private pitchJitter(baseFreq: number, variance: number = 0.08): number {
    const delta = (Math.random() * 2 - 1) * variance;
    return baseFreq * (1 + delta);
  }

  public playCardSelect(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.06);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.075);
    } catch {}
  }

  public playDeploy(): void {
    this.playStructureDeploy();
  }

  public playStructureDeploy(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.18);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    } catch {}
  }

  public playSpell(spellType: string = 'orbital_strike'): void {
    this.playSpellCast(spellType);
  }

  public playSpellCast(spellType: string = 'orbital_strike'): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = spellType === 'orbital_strike' ? 'sawtooth' : 'sine';
      const startFreq = spellType === 'orbital_strike' ? 580 : 340;
      const endFreq = spellType === 'orbital_strike' ? 160 : 720;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.32);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    } catch {}
  }

  public playHarvestDeposit(): void {
    this.playEssenceDeposit();
  }

  public playEssenceDeposit(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(this.pitchJitter(freq, 0.03), now + idx * 0.035);
        gain.gain.setValueAtTime(0.055, now + idx * 0.035);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.035 + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.035);
        osc.stop(now + idx * 0.035 + 0.15);
      });
    } catch {}
  }

  public playAttackHit(isHeavy: boolean = false): void {
    this.playHit(isHeavy);
  }

  public playHit(isHeavy: boolean = false): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isHeavy ? 'sawtooth' : 'triangle';
      const base = isHeavy ? 145 : 290;
      osc.frequency.setValueAtTime(this.pitchJitter(base, 0.08), now);
      osc.frequency.exponentialRampToValueAtTime(55, now + (isHeavy ? 0.14 : 0.07));
      gain.gain.setValueAtTime(isHeavy ? 0.12 : 0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.15 : 0.08));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + (isHeavy ? 0.16 : 0.09));
    } catch {}
  }

  public playVictory(): void {
    this.playFanfare(true);
  }

  public playDefeat(): void {
    this.playFanfare(false);
  }

  public playFanfare(victory: boolean): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const chord = victory ? [392.0, 493.88, 587.33, 783.99] : [349.23, 311.13, 261.63, 196.0];
      chord.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.11);
        gain.gain.setValueAtTime(0.1, now + i * 0.11);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.11 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.11);
        osc.stop(now + i * 0.11 + 0.48);
      });
    } catch {}
  }
}

export const soundEngine = new HarmonicAudioEngine();
