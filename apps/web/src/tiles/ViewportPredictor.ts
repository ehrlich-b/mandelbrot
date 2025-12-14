/**
 * ViewportPredictor - Tracks viewport velocity and predicts future viewports
 *
 * Enables intelligent prefetching by:
 * 1. Tracking recent viewport positions
 * 2. Calculating pan velocity and zoom rate
 * 3. Predicting viewport 100-500ms into the future
 * 4. Detecting interaction state for prioritization
 */

export interface ViewportState {
  centerX: number;
  centerY: number;
  scale: number;
  timestamp: number;
}

export interface ViewportVelocity {
  panX: number;      // Complex units per millisecond
  panY: number;      // Complex units per millisecond
  zoomRate: number;  // Scale multiplier per millisecond (1.0 = no zoom)
  confidence: number; // 0-1, how reliable is this velocity estimate
}

export interface PredictedViewport {
  centerX: number;
  centerY: number;
  scale: number;
  lookaheadMs: number;
  confidence: number;
}

export interface PrefetchDirection {
  panX: number;  // Normalized -1 to 1
  panY: number;  // Normalized -1 to 1
  zooming: 'in' | 'out' | 'none';
}

/**
 * ViewportPredictor tracks viewport changes and predicts future positions
 */
export class ViewportPredictor {
  // History of recent viewport states
  private history: ViewportState[] = [];
  private maxHistorySize = 20;
  private maxHistoryAge = 1000; // ms

  // Calculated velocity
  private velocity: ViewportVelocity = {
    panX: 0,
    panY: 0,
    zoomRate: 1.0,
    confidence: 0,
  };

  // Interaction state
  private lastInteractionTime = 0;
  private isInteracting = false;
  private interactionTimeout = 200; // ms of no updates = interaction stopped

  // Prefetch configuration
  private minLookaheadMs = 100;
  private maxLookaheadMs = 500;
  private minConfidence = 0.3;

  /**
   * Update with new viewport state
   */
  update(centerX: number, centerY: number, scale: number): void {
    const now = performance.now();

    // Add to history
    this.history.push({
      centerX,
      centerY,
      scale,
      timestamp: now,
    });

    // Prune old history
    this.pruneHistory(now);

    // Update interaction state
    this.lastInteractionTime = now;
    this.isInteracting = true;

    // Recalculate velocity
    this.calculateVelocity();
  }

  /**
   * Remove old entries from history
   */
  private pruneHistory(now: number): void {
    // Remove entries older than maxHistoryAge
    while (
      this.history.length > 0 &&
      now - this.history[0].timestamp > this.maxHistoryAge
    ) {
      this.history.shift();
    }

    // Keep only maxHistorySize entries
    while (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Calculate velocity from recent history
   */
  private calculateVelocity(): void {
    if (this.history.length < 2) {
      this.velocity = { panX: 0, panY: 0, zoomRate: 1.0, confidence: 0 };
      return;
    }

    // Use weighted linear regression for smoother velocity estimation
    // More recent samples have higher weight
    const n = this.history.length;
    const recent = this.history.slice(-Math.min(10, n)); // Last 10 samples max

    if (recent.length < 2) {
      this.velocity = { panX: 0, panY: 0, zoomRate: 1.0, confidence: 0 };
      return;
    }

    // Calculate weighted average velocity
    let totalWeight = 0;
    let weightedPanX = 0;
    let weightedPanY = 0;
    let weightedZoomRate = 0;

    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1];
      const curr = recent[i];
      const dt = curr.timestamp - prev.timestamp;

      if (dt <= 0) continue;

      // Weight: exponentially favor recent samples
      const age = recent[recent.length - 1].timestamp - curr.timestamp;
      const weight = Math.exp(-age / 200); // 200ms half-life

      // Velocity components
      const panX = (curr.centerX - prev.centerX) / dt;
      const panY = (curr.centerY - prev.centerY) / dt;
      const zoomRate = Math.pow(curr.scale / prev.scale, 1 / dt);

      weightedPanX += panX * weight;
      weightedPanY += panY * weight;
      weightedZoomRate += zoomRate * weight;
      totalWeight += weight;
    }

    if (totalWeight > 0) {
      weightedPanX /= totalWeight;
      weightedPanY /= totalWeight;
      weightedZoomRate /= totalWeight;
    } else {
      weightedZoomRate = 1.0;
    }

    // Calculate confidence based on consistency
    const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp;
    const sampleDensity = recent.length / Math.max(1, timeSpan / 50); // Samples per 50ms
    const confidence = Math.min(1, sampleDensity * 0.5) *
                       Math.min(1, timeSpan / 200); // Need at least 200ms of data

    this.velocity = {
      panX: weightedPanX,
      panY: weightedPanY,
      zoomRate: weightedZoomRate,
      confidence,
    };
  }

  /**
   * Get current velocity estimate
   */
  getVelocity(): ViewportVelocity {
    this.checkInteractionTimeout();
    return { ...this.velocity };
  }

  /**
   * Check if interaction has stopped
   */
  private checkInteractionTimeout(): void {
    const now = performance.now();
    if (this.isInteracting && now - this.lastInteractionTime > this.interactionTimeout) {
      this.isInteracting = false;
      // Decay velocity when interaction stops
      this.velocity.confidence *= 0.5;
    }
  }

  /**
   * Predict viewport at a future time
   */
  predict(lookaheadMs: number): PredictedViewport | null {
    this.checkInteractionTimeout();

    if (this.history.length === 0 || this.velocity.confidence < this.minConfidence) {
      return null;
    }

    const current = this.history[this.history.length - 1];
    const effectiveLookahead = Math.min(
      this.maxLookaheadMs,
      Math.max(this.minLookaheadMs, lookaheadMs)
    );

    // Apply velocity to current position
    // For pan: linear extrapolation
    // For zoom: exponential extrapolation
    const predictedCenterX = current.centerX + this.velocity.panX * effectiveLookahead;
    const predictedCenterY = current.centerY + this.velocity.panY * effectiveLookahead;
    const predictedScale = current.scale * Math.pow(this.velocity.zoomRate, effectiveLookahead);

    // Confidence decreases with lookahead time
    const confidenceDecay = Math.exp(-effectiveLookahead / 300);
    const adjustedConfidence = this.velocity.confidence * confidenceDecay;

    return {
      centerX: predictedCenterX,
      centerY: predictedCenterY,
      scale: predictedScale,
      lookaheadMs: effectiveLookahead,
      confidence: adjustedConfidence,
    };
  }

  /**
   * Get the direction of movement for prefetch prioritization
   */
  getPrefetchDirection(): PrefetchDirection | null {
    this.checkInteractionTimeout();

    if (this.velocity.confidence < this.minConfidence) {
      return null;
    }

    // Normalize pan direction
    const panMagnitude = Math.sqrt(
      this.velocity.panX * this.velocity.panX +
      this.velocity.panY * this.velocity.panY
    );

    let normalizedPanX = 0;
    let normalizedPanY = 0;

    if (panMagnitude > 0) {
      // Scale by current viewport scale for normalization
      const current = this.history[this.history.length - 1];
      const relativeSpeed = panMagnitude / current.scale;

      // Only consider significant movement
      if (relativeSpeed > 0.0001) {
        normalizedPanX = this.velocity.panX / panMagnitude;
        normalizedPanY = this.velocity.panY / panMagnitude;
      }
    }

    // Determine zoom direction
    let zooming: 'in' | 'out' | 'none' = 'none';
    if (this.velocity.zoomRate < 0.999) {
      zooming = 'in'; // Scale decreasing = zooming in
    } else if (this.velocity.zoomRate > 1.001) {
      zooming = 'out'; // Scale increasing = zooming out
    }

    return {
      panX: normalizedPanX,
      panY: normalizedPanY,
      zooming,
    };
  }

  /**
   * Check if user is currently interacting
   */
  isUserInteracting(): boolean {
    this.checkInteractionTimeout();
    return this.isInteracting;
  }

  /**
   * Get viewport change since last check (for detecting direction changes)
   */
  getRecentChange(): { deltaX: number; deltaY: number; deltaScale: number } | null {
    if (this.history.length < 2) {
      return null;
    }

    const recent = this.history[this.history.length - 1];
    const previous = this.history[this.history.length - 2];

    return {
      deltaX: recent.centerX - previous.centerX,
      deltaY: recent.centerY - previous.centerY,
      deltaScale: recent.scale / previous.scale,
    };
  }

  /**
   * Check if direction has changed significantly (for cancelling stale prefetch)
   */
  hasDirectionChanged(): boolean {
    if (this.history.length < 5) {
      return false;
    }

    // Compare recent velocity direction with older velocity
    const recentHistory = this.history.slice(-5);
    const olderHistory = this.history.slice(-10, -5);

    if (olderHistory.length < 2) {
      return false;
    }

    // Calculate old velocity
    const oldDx = olderHistory[olderHistory.length - 1].centerX - olderHistory[0].centerX;
    const oldDy = olderHistory[olderHistory.length - 1].centerY - olderHistory[0].centerY;

    // Calculate recent velocity
    const newDx = recentHistory[recentHistory.length - 1].centerX - recentHistory[0].centerX;
    const newDy = recentHistory[recentHistory.length - 1].centerY - recentHistory[0].centerY;

    // Dot product of normalized directions
    const oldMag = Math.sqrt(oldDx * oldDx + oldDy * oldDy);
    const newMag = Math.sqrt(newDx * newDx + newDy * newDy);

    if (oldMag < 1e-10 || newMag < 1e-10) {
      return false;
    }

    const dotProduct = (oldDx * newDx + oldDy * newDy) / (oldMag * newMag);

    // If dot product is negative, direction has reversed
    return dotProduct < 0;
  }

  /**
   * Clear history (call on major state changes)
   */
  clear(): void {
    this.history = [];
    this.velocity = { panX: 0, panY: 0, zoomRate: 1.0, confidence: 0 };
    this.isInteracting = false;
  }

  /**
   * Get diagnostic info
   */
  getDebugInfo(): {
    historySize: number;
    velocity: ViewportVelocity;
    isInteracting: boolean;
    timeSinceLastUpdate: number;
  } {
    this.checkInteractionTimeout();
    return {
      historySize: this.history.length,
      velocity: { ...this.velocity },
      isInteracting: this.isInteracting,
      timeSinceLastUpdate: this.history.length > 0
        ? performance.now() - this.history[this.history.length - 1].timestamp
        : Infinity,
    };
  }
}
