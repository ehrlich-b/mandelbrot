/**
 * PrecisionManager - Unified precision mode selection and management
 *
 * Automatically selects the optimal precision mode based on zoom scale:
 *
 * Scale > 5e-6:       GPU Standard (float32)      - fastest, ~60 FPS
 * Scale 5e-6 → 1e-10: GPU Double-Double           - fast, ~45 FPS
 * Scale 1e-10 → 1e-14: GPU Perturbation (float64) - medium, ~30 FPS
 * Scale < 1e-14:      CPU Arbitrary Precision     - slow but unlimited
 *
 * Also handles seamless transitions and provides status for HUD display.
 */

import { getReferenceOrbit } from '../wasm/ReferenceOrbit';

/**
 * Precision modes in order of increasing precision/cost
 */
export type PrecisionMode = 'standard' | 'dd' | 'perturbation' | 'arbitrary';

/**
 * Precision mode metadata
 */
export interface PrecisionModeInfo {
  mode: PrecisionMode;
  name: string;
  shortName: string;
  description: string;
  minScale: number;
  maxScale: number;
  estimatedFps: number;
  color: string; // For HUD display
}

/**
 * Precision thresholds
 * These can be tuned per-device based on benchmarks
 */
export interface PrecisionThresholds {
  ddThreshold: number;           // Switch to DD below this scale
  perturbationThreshold: number; // Switch to perturbation below this scale
  arbitraryThreshold: number;    // Switch to arbitrary precision below this scale
}

/**
 * Default thresholds (can be overridden per-device)
 */
const DEFAULT_THRESHOLDS: PrecisionThresholds = {
  ddThreshold: 5e-6,
  perturbationThreshold: 1e-10,
  arbitraryThreshold: 1e-14,
};

/**
 * Mode information for each precision level
 */
const MODE_INFO: Record<PrecisionMode, PrecisionModeInfo> = {
  standard: {
    mode: 'standard',
    name: 'Standard Precision',
    shortName: 'STD',
    description: 'GPU float32 - fastest rendering',
    minScale: 5e-6,
    maxScale: Infinity,
    estimatedFps: 60,
    color: '#4ade80', // green
  },
  dd: {
    mode: 'dd',
    name: 'Double-Double Precision',
    shortName: 'DD',
    description: 'GPU double-double (~30 decimal digits)',
    minScale: 1e-10,
    maxScale: 5e-6,
    estimatedFps: 45,
    color: '#60a5fa', // blue
  },
  perturbation: {
    mode: 'perturbation',
    name: 'Perturbation Theory',
    shortName: 'PERTURB',
    description: 'GPU with reference orbit - enables deep zoom',
    minScale: 1e-14,
    maxScale: 1e-10,
    estimatedFps: 30,
    color: '#c084fc', // purple
  },
  arbitrary: {
    mode: 'arbitrary',
    name: 'Arbitrary Precision',
    shortName: 'ARBI',
    description: 'CPU WASM - unlimited precision, slowest',
    minScale: 0,
    maxScale: 1e-14,
    estimatedFps: 5,
    color: '#f97316', // orange
  },
};

/**
 * Event emitted when precision mode changes
 */
export interface PrecisionModeChangeEvent {
  previousMode: PrecisionMode;
  newMode: PrecisionMode;
  scale: number;
  reason: 'scale_change' | 'manual_override' | 'fallback';
}

/**
 * PrecisionManager class
 */
export class PrecisionManager {
  private thresholds: PrecisionThresholds;
  private currentMode: PrecisionMode = 'standard';
  private manualOverride: PrecisionMode | null = null;
  private listeners: Set<(event: PrecisionModeChangeEvent) => void> = new Set();

  // Reference orbit availability
  private perturbationAvailable = false;
  private arbitraryAvailable = false;

  // Hysteresis to prevent mode flickering
  private lastModeChangeTime = 0;
  private readonly MODE_CHANGE_COOLDOWN = 100; // ms

  constructor(thresholds: Partial<PrecisionThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Initialize precision capabilities
   */
  async init(): Promise<void> {
    // Check if perturbation (reference orbit) is available
    const refOrbit = getReferenceOrbit();
    this.perturbationAvailable = await refOrbit.init();

    // Arbitrary precision uses the same WASM module
    this.arbitraryAvailable = this.perturbationAvailable;

    console.log('PrecisionManager initialized:', {
      perturbationAvailable: this.perturbationAvailable,
      arbitraryAvailable: this.arbitraryAvailable,
    });
  }

  /**
   * Select optimal precision mode for given scale
   */
  selectMode(scale: number): PrecisionMode {
    // If manual override is set, use it
    if (this.manualOverride !== null) {
      return this.manualOverride;
    }

    let newMode: PrecisionMode;

    if (scale >= this.thresholds.ddThreshold) {
      newMode = 'standard';
    } else if (scale >= this.thresholds.perturbationThreshold) {
      newMode = 'dd';
    } else if (scale >= this.thresholds.arbitraryThreshold) {
      // Use perturbation if available, otherwise fall back to DD
      newMode = this.perturbationAvailable ? 'perturbation' : 'dd';
    } else {
      // Use arbitrary if available, otherwise fall back to perturbation or DD
      if (this.arbitraryAvailable) {
        newMode = 'arbitrary';
      } else if (this.perturbationAvailable) {
        newMode = 'perturbation';
      } else {
        newMode = 'dd';
      }
    }

    // Apply hysteresis to prevent mode flickering
    const now = performance.now();
    if (newMode !== this.currentMode) {
      if (now - this.lastModeChangeTime < this.MODE_CHANGE_COOLDOWN) {
        return this.currentMode; // Don't change yet
      }

      const event: PrecisionModeChangeEvent = {
        previousMode: this.currentMode,
        newMode,
        scale,
        reason: 'scale_change',
      };

      this.currentMode = newMode;
      this.lastModeChangeTime = now;
      this.notifyListeners(event);
    }

    return this.currentMode;
  }

  /**
   * Get current precision mode
   */
  getCurrentMode(): PrecisionMode {
    return this.currentMode;
  }

  /**
   * Get info about current mode
   */
  getCurrentModeInfo(): PrecisionModeInfo {
    return MODE_INFO[this.currentMode];
  }

  /**
   * Get info about a specific mode
   */
  getModeInfo(mode: PrecisionMode): PrecisionModeInfo {
    return MODE_INFO[mode];
  }

  /**
   * Get all available modes
   */
  getAvailableModes(): PrecisionMode[] {
    const modes: PrecisionMode[] = ['standard', 'dd'];

    if (this.perturbationAvailable) {
      modes.push('perturbation');
    }
    if (this.arbitraryAvailable) {
      modes.push('arbitrary');
    }

    return modes;
  }

  /**
   * Set manual override (for testing/debugging)
   */
  setManualOverride(mode: PrecisionMode | null): void {
    const previousMode = this.currentMode;
    this.manualOverride = mode;

    if (mode !== null && mode !== previousMode) {
      const event: PrecisionModeChangeEvent = {
        previousMode,
        newMode: mode,
        scale: 0,
        reason: 'manual_override',
      };

      this.currentMode = mode;
      this.notifyListeners(event);
    }
  }

  /**
   * Get manual override status
   */
  getManualOverride(): PrecisionMode | null {
    return this.manualOverride;
  }

  /**
   * Clear manual override
   */
  clearManualOverride(): void {
    this.manualOverride = null;
  }

  /**
   * Add listener for mode changes
   */
  addModeChangeListener(callback: (event: PrecisionModeChangeEvent) => void): void {
    this.listeners.add(callback);
  }

  /**
   * Remove mode change listener
   */
  removeModeChangeListener(callback: (event: PrecisionModeChangeEvent) => void): void {
    this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of mode change
   */
  private notifyListeners(event: PrecisionModeChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in precision mode change listener:', error);
      }
    }
  }

  /**
   * Get thresholds (for tuning UI)
   */
  getThresholds(): PrecisionThresholds {
    return { ...this.thresholds };
  }

  /**
   * Update thresholds (for per-device tuning)
   */
  setThresholds(thresholds: Partial<PrecisionThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Calculate required precision limbs for arbitrary precision mode
   */
  getPrecisionLimbs(scale: number): number {
    // Each limb gives ~9.6 decimal digits of precision
    const logScale = -Math.log10(Math.max(scale, 1e-300));
    const limbs = Math.ceil(logScale / 9.6) + 2; // +2 for safety margin
    return Math.max(4, Math.min(64, limbs));
  }

  /**
   * Check if perturbation theory is available
   */
  isPerturbationAvailable(): boolean {
    return this.perturbationAvailable;
  }

  /**
   * Check if arbitrary precision is available
   */
  isArbitraryPrecisionAvailable(): boolean {
    return this.arbitraryAvailable;
  }

  /**
   * Get formatted status string for HUD display
   */
  getStatusString(scale: number): string {
    const mode = this.getCurrentModeInfo();
    const logScale = Math.floor(Math.log10(scale));
    return `${mode.shortName} | 10^${logScale}`;
  }

  /**
   * Get detailed status for HUD tooltip
   */
  getDetailedStatus(scale: number): {
    mode: string;
    precision: string;
    scale: string;
    estimatedFps: number;
  } {
    const mode = this.getCurrentModeInfo();
    const logScale = Math.log10(scale);

    let precision: string;
    if (this.currentMode === 'standard') {
      precision = '~7 decimal digits';
    } else if (this.currentMode === 'dd') {
      precision = '~30 decimal digits';
    } else if (this.currentMode === 'perturbation') {
      precision = '~15 decimal digits (delta)';
    } else {
      const limbs = this.getPrecisionLimbs(scale);
      precision = `~${Math.floor(limbs * 9.6)} decimal digits`;
    }

    return {
      mode: mode.name,
      precision,
      scale: `10^${logScale.toFixed(1)}`,
      estimatedFps: mode.estimatedFps,
    };
  }

  /**
   * Get recommended max iterations based on mode and scale
   */
  getRecommendedMaxIterations(scale: number): number {
    // More iterations needed at deeper zoom
    const logScale = -Math.log10(Math.max(scale, 1e-300));

    // Base iterations increase with zoom depth
    const baseIterations = Math.min(10000, 100 + Math.floor(logScale * 50));

    // Adjust based on mode performance
    switch (this.currentMode) {
      case 'standard':
        return baseIterations;
      case 'dd':
        return Math.min(baseIterations, 5000); // DD is slower
      case 'perturbation':
        return Math.min(baseIterations, 8000); // Perturbation is medium
      case 'arbitrary':
        return Math.min(baseIterations, 2000); // Arbitrary is slowest
      default:
        return baseIterations;
    }
  }
}

// Singleton instance
let instance: PrecisionManager | null = null;

/**
 * Get the shared PrecisionManager instance
 */
export function getPrecisionManager(): PrecisionManager {
  if (!instance) {
    instance = new PrecisionManager();
  }
  return instance;
}

/**
 * Initialize the shared instance
 */
export async function initPrecisionManager(): Promise<void> {
  await getPrecisionManager().init();
}
