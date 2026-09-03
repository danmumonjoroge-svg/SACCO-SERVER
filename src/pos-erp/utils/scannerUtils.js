// Universal Scanning Engine — Scanner UX Utilities
import { SCANNER_PREFERENCE_KEY } from '../constants/scannerModes';

/**
 * Small helper class for de-duplicating rapid repeat scans of the same
 * barcode (e.g. a camera seeing the same label for 2 seconds shouldn't add
 * 20 units). Consumers call `shouldAccept(barcode)` before processing a scan.
 */
export class ScanCooldown {
  constructor(cooldownMs = 1200) {
    this.cooldownMs = cooldownMs;
    this.lastSeen = new Map();
  }
  shouldAccept(barcode) {
    const now = Date.now();
    const last = this.lastSeen.get(barcode);
    if (last && now - last < this.cooldownMs) {
      return false;
    }
    this.lastSeen.set(barcode, now);
    return true;
  }
  reset(barcode) {
    if (barcode) this.lastSeen.delete(barcode);
    else this.lastSeen.clear();
  }
}

/** Short success beep using the Web Audio API — no asset files required. */
export function playScanBeep(success = true) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = success ? 1200 : 300;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => ctx.close();
  } catch (e) {
    // Audio isn't essential — never let it break a scan.
  }
}

/** Vibrate briefly on supported mobile devices. */
export function vibrateOnScan(success = true) {
  try {
    if (navigator.vibrate) navigator.vibrate(success ? 40 : [40, 60, 40]);
  } catch (e) {
    // ignore
  }
}

export function getPreferredScannerMode() {
  try {
    return localStorage.getItem(SCANNER_PREFERENCE_KEY) || null;
  } catch (e) {
    return null;
  }
}

export function setPreferredScannerMode(mode) {
  try {
    localStorage.setItem(SCANNER_PREFERENCE_KEY, mode);
  } catch (e) {
    // ignore (e.g. private browsing)
  }
}
