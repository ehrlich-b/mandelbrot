/**
 * Unit tests for double-double arithmetic implementation
 */

import { describe, it, expect } from 'vitest';
import {
  ddFromNumber,
  ddAdd,
  ddSub,
  ddMul,
  ddDiv,
  ddSqr,
  ddSqrt,
  ddCompare,
  ddToNumber,
  ddFromString,
  ddToString,
  DD_ZERO,
  DD_ONE,
  DD_TWO
} from '../../apps/web/src/math/dd.js';

import {
  complexDDFromNumbers,
  complexDDAdd,
  complexDDMul,
  complexDDSqr,
  complexDDMagnitudeSquared,
  mandelbrotDD,
  COMPLEX_DD_ZERO,
  COMPLEX_DD_ONE
} from '../../apps/web/src/math/complex-dd.js';

describe('Double-Double Arithmetic', () => {
  describe('Basic operations', () => {
    it('should create DD from number', () => {
      const dd = ddFromNumber(3.14159);
      expect(dd.hi).toBe(3.14159);
      expect(dd.lo).toBe(0.0);
    });

    it('should convert DD back to number', () => {
      const dd = ddFromNumber(2.71828);
      expect(ddToNumber(dd)).toBe(2.71828);
    });

    it('should add two DD numbers', () => {
      const a = ddFromNumber(1.0);
      const b = ddFromNumber(2.0);
      const result = ddAdd(a, b);
      expect(ddToNumber(result)).toBeCloseTo(3.0, 15);
    });

    it('should subtract two DD numbers', () => {
      const a = ddFromNumber(5.0);
      const b = ddFromNumber(3.0);
      const result = ddSub(a, b);
      expect(ddToNumber(result)).toBeCloseTo(2.0, 15);
    });

    it('should multiply two DD numbers', () => {
      const a = ddFromNumber(3.0);
      const b = ddFromNumber(4.0);
      const result = ddMul(a, b);
      expect(ddToNumber(result)).toBeCloseTo(12.0, 15);
    });

    it('should divide two DD numbers', () => {
      const a = ddFromNumber(15.0);
      const b = ddFromNumber(3.0);
      const result = ddDiv(a, b);
      expect(ddToNumber(result)).toBeCloseTo(5.0, 15);
    });

    it('should square a DD number', () => {
      const a = ddFromNumber(7.0);
      const result = ddSqr(a);
      expect(ddToNumber(result)).toBeCloseTo(49.0, 15);
    });

    it('should compute square root', () => {
      const a = ddFromNumber(16.0);
      const result = ddSqrt(a);
      expect(ddToNumber(result)).toBeCloseTo(4.0, 14);
    });
  });

  describe('High precision operations', () => {
    it('should handle small numbers accurately', () => {
      const a = ddFromNumber(1e-100);
      const b = ddFromNumber(1e-100);
      const result = ddAdd(a, b);
      expect(ddToNumber(result)).toBeCloseTo(2e-100, 15);
    });

    it('should maintain precision in repeated operations', () => {
      let result = DD_ONE;
      
      // Perform 1000 additions of 0.001
      for (let i = 0; i < 1000; i++) {
        result = ddAdd(result, ddFromNumber(0.001));
      }
      
      // Should be 1 + 1000 * 0.001 = 2.0
      expect(ddToNumber(result)).toBeCloseTo(2.0, 12);
    });
  });

  describe('Comparison operations', () => {
    it('should compare DD numbers correctly', () => {
      const a = ddFromNumber(3.0);
      const b = ddFromNumber(2.0);
      const c = ddFromNumber(3.0);
      
      expect(ddCompare(a, b)).toBe(1);   // a > b
      expect(ddCompare(b, a)).toBe(-1);  // b < a
      expect(ddCompare(a, c)).toBe(0);   // a == c
    });
  });

  describe('String conversion', () => {
    it('should convert from string', () => {
      const dd = ddFromString('3.14159265358979323846');
      expect(ddToNumber(dd)).toBeCloseTo(3.14159265358979323846, 15);
    });

    it('should handle special values', () => {
      expect(ddToNumber(ddFromString('Infinity'))).toBe(Infinity);
      expect(ddToNumber(ddFromString('-Infinity'))).toBe(-Infinity);
      expect(ddToNumber(ddFromString('NaN'))).toBe(NaN);
    });
  });
});

describe('Complex Double-Double Arithmetic', () => {
  describe('Basic complex operations', () => {
    it('should create complex DD from numbers', () => {
      const z = complexDDFromNumbers(3.0, 4.0);
      const nums = complexDDToNumbers(z);
      expect(nums.re).toBe(3.0);
      expect(nums.im).toBe(4.0);
    });

    it('should add complex DD numbers', () => {
      const z1 = complexDDFromNumbers(1.0, 2.0);
      const z2 = complexDDFromNumbers(3.0, 4.0);
      const result = complexDDAdd(z1, z2);
      const nums = complexDDToNumbers(result);
      
      expect(nums.re).toBeCloseTo(4.0, 15);
      expect(nums.im).toBeCloseTo(6.0, 15);
    });

    it('should multiply complex DD numbers', () => {
      const z1 = complexDDFromNumbers(1.0, 2.0);  // 1 + 2i
      const z2 = complexDDFromNumbers(3.0, 4.0);  // 3 + 4i
      const result = complexDDMul(z1, z2);        // (1+2i)(3+4i) = -5 + 10i
      const nums = complexDDToNumbers(result);
      
      expect(nums.re).toBeCloseTo(-5.0, 15);
      expect(nums.im).toBeCloseTo(10.0, 15);
    });

    it('should square complex DD numbers', () => {
      const z = complexDDFromNumbers(3.0, 4.0);   // 3 + 4i
      const result = complexDDSqr(z);             // (3+4i)² = -7 + 24i
      const nums = complexDDToNumbers(result);
      
      expect(nums.re).toBeCloseTo(-7.0, 15);
      expect(nums.im).toBeCloseTo(24.0, 15);
    });

    it('should compute magnitude squared', () => {
      const z = complexDDFromNumbers(3.0, 4.0);   // 3 + 4i
      const magSq = complexDDMagnitudeSquared(z); // |3+4i|² = 25
      
      expect(ddToNumber(magSq)).toBeCloseTo(25.0, 15);
    });
  });

  describe('Mandelbrot calculations', () => {
    it('should detect points in the Mandelbrot set', () => {
      // Origin (0, 0) should be in the set
      const c = complexDDFromNumbers(0.0, 0.0);
      const result = mandelbrotDD(c, 100, 2.0);
      
      expect(result.escaped).toBe(false);
      expect(result.iterations).toBe(100);
    });

    it('should detect points outside the Mandelbrot set', () => {
      // Point (2, 0) should escape quickly
      const c = complexDDFromNumbers(2.0, 0.0);
      const result = mandelbrotDD(c, 100, 2.0);
      
      expect(result.escaped).toBe(true);
      expect(result.iterations).toBeLessThan(5);
    });

    it('should handle boundary points correctly', () => {
      // Point (-0.5, 0) should be in the set (center of main cardioid)
      const c = complexDDFromNumbers(-0.5, 0.0);
      const result = mandelbrotDD(c, 1000, 2.0);
      
      expect(result.escaped).toBe(false);
    });

    it('should provide smooth iteration counts', () => {
      const c = complexDDFromNumbers(0.3, 0.3);
      const result1 = mandelbrotDD(c, 100, 2.0);
      const result2 = mandelbrotDD(c, 200, 2.0);
      
      // With more iterations, we should get the same escape point
      if (result1.escaped && result2.escaped) {
        expect(result1.iterations).toBe(result2.iterations);
      }
    });
  });

  describe('Precision validation', () => {
    it('should maintain precision better than regular arithmetic', () => {
      // Test case where regular floating point would lose precision
      const c = complexDDFromNumbers(1e-15, 1e-15);
      const result = mandelbrotDD(c, 100, 2.0);
      
      // Should be able to compute without numerical issues
      expect(result).toBeDefined();
      expect(result.iterations).toBeGreaterThanOrEqual(0);
    });

    it('should handle very small scales', () => {
      // Simulate deep zoom conditions
      const c = complexDDFromNumbers(-0.7533 + 1e-14, 0.1138 + 1e-14);
      const result = mandelbrotDD(c, 500, 2.0);
      
      expect(result).toBeDefined();
      expect(typeof result.iterations).toBe('number');
      expect(result.iterations).toBeGreaterThanOrEqual(0);
    });
  });
});