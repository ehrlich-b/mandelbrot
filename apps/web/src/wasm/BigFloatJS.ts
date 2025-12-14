/**
 * BigFloatJS - Pure JavaScript arbitrary precision fallback
 *
 * Used when WASM is unavailable. Slower but portable.
 * Uses string-based decimal arithmetic for simplicity.
 */

/**
 * Simple arbitrary precision decimal class
 * Not optimized, but correct for fallback use
 */
class Decimal {
  private digits: number[];  // Array of digits, most significant first
  private exp: number;       // Exponent (decimal point position)
  private sign: number;      // 1 or -1

  static PRECISION = 100;    // Decimal digits of precision

  constructor(value: string | number = 0) {
    if (typeof value === 'number') {
      value = value.toString();
    }

    this.digits = [];
    this.exp = 0;
    this.sign = 1;

    this.parse(value);
  }

  private parse(str: string): void {
    str = str.trim();

    // Handle sign
    if (str[0] === '-') {
      this.sign = -1;
      str = str.slice(1);
    } else if (str[0] === '+') {
      str = str.slice(1);
    }

    // Find decimal point
    const dotIndex = str.indexOf('.');
    let intPart: string;
    let fracPart: string;

    if (dotIndex === -1) {
      intPart = str;
      fracPart = '';
    } else {
      intPart = str.slice(0, dotIndex);
      fracPart = str.slice(dotIndex + 1);
    }

    // Remove leading zeros from integer part
    intPart = intPart.replace(/^0+/, '') || '0';

    // Store all digits
    const allDigits = intPart + fracPart;
    this.digits = [];
    for (const c of allDigits) {
      if (c >= '0' && c <= '9') {
        this.digits.push(parseInt(c));
      }
    }

    // Exponent: position of decimal point from the right
    this.exp = intPart === '0' ? -fracPart.replace(/^0+/, '').length + 1 : intPart.length;

    // Handle zero
    if (this.digits.every(d => d === 0)) {
      this.sign = 1;
      this.digits = [0];
      this.exp = 1;
    }

    // Trim to precision
    if (this.digits.length > Decimal.PRECISION) {
      this.digits = this.digits.slice(0, Decimal.PRECISION);
    }
  }

  static fromNumber(n: number): Decimal {
    return new Decimal(n.toString());
  }

  toNumber(): number {
    let result = 0;
    let scale = Math.pow(10, this.exp - 1);

    for (const digit of this.digits) {
      result += digit * scale;
      scale /= 10;
    }

    return this.sign * result;
  }

  isZero(): boolean {
    return this.digits.every(d => d === 0);
  }

  abs(): Decimal {
    const result = this.clone();
    result.sign = 1;
    return result;
  }

  clone(): Decimal {
    const result = new Decimal();
    result.digits = [...this.digits];
    result.exp = this.exp;
    result.sign = this.sign;
    return result;
  }

  neg(): Decimal {
    const result = this.clone();
    result.sign = -result.sign;
    return result;
  }

  // Compare absolute values
  private cmpAbs(other: Decimal): number {
    // Compare exponents first
    if (this.exp !== other.exp) {
      return this.exp > other.exp ? 1 : -1;
    }

    // Compare digit by digit
    const maxLen = Math.max(this.digits.length, other.digits.length);
    for (let i = 0; i < maxLen; i++) {
      const a = this.digits[i] || 0;
      const b = other.digits[i] || 0;
      if (a !== b) return a > b ? 1 : -1;
    }

    return 0;
  }

  add(other: Decimal): Decimal {
    if (this.sign !== other.sign) {
      // a + (-b) = a - b
      return this.sub(other.neg());
    }

    // Same sign - add magnitudes
    const result = new Decimal();
    result.sign = this.sign;

    // Align decimal points
    const maxExp = Math.max(this.exp, other.exp);
    const aShift = maxExp - this.exp;
    const bShift = maxExp - other.exp;

    // Pad digits
    const aDigits = new Array(aShift).fill(0).concat(this.digits);
    const bDigits = new Array(bShift).fill(0).concat(other.digits);

    // Make same length
    const maxLen = Math.max(aDigits.length, bDigits.length);
    while (aDigits.length < maxLen) aDigits.push(0);
    while (bDigits.length < maxLen) bDigits.push(0);

    // Add with carry
    result.digits = new Array(maxLen).fill(0);
    let carry = 0;
    for (let i = maxLen - 1; i >= 0; i--) {
      const sum = aDigits[i] + bDigits[i] + carry;
      result.digits[i] = sum % 10;
      carry = Math.floor(sum / 10);
    }
    if (carry) {
      result.digits.unshift(carry);
      maxExp + 1;
    }

    result.exp = maxExp + (carry ? 1 : 0);

    // Normalize
    while (result.digits.length > 1 && result.digits[0] === 0) {
      result.digits.shift();
      result.exp--;
    }

    // Trim precision
    if (result.digits.length > Decimal.PRECISION) {
      result.digits = result.digits.slice(0, Decimal.PRECISION);
    }

    return result;
  }

  sub(other: Decimal): Decimal {
    if (this.sign !== other.sign) {
      // a - (-b) = a + b
      return this.add(other.neg());
    }

    // Same sign - subtract magnitudes
    const cmp = this.cmpAbs(other);
    if (cmp === 0) return new Decimal(0);

    const [larger, smaller] = cmp > 0 ? [this, other] : [other, this];
    const result = new Decimal();
    result.sign = cmp > 0 ? this.sign : -this.sign;

    // Align decimal points
    const maxExp = Math.max(larger.exp, smaller.exp);
    const aShift = maxExp - larger.exp;
    const bShift = maxExp - smaller.exp;

    const aDigits = new Array(aShift).fill(0).concat([...larger.digits]);
    const bDigits = new Array(bShift).fill(0).concat([...smaller.digits]);

    const maxLen = Math.max(aDigits.length, bDigits.length);
    while (aDigits.length < maxLen) aDigits.push(0);
    while (bDigits.length < maxLen) bDigits.push(0);

    // Subtract with borrow
    result.digits = new Array(maxLen).fill(0);
    let borrow = 0;
    for (let i = maxLen - 1; i >= 0; i--) {
      let diff = aDigits[i] - bDigits[i] - borrow;
      if (diff < 0) {
        diff += 10;
        borrow = 1;
      } else {
        borrow = 0;
      }
      result.digits[i] = diff;
    }

    result.exp = maxExp;

    // Normalize
    while (result.digits.length > 1 && result.digits[0] === 0) {
      result.digits.shift();
      result.exp--;
    }

    if (result.digits.length > Decimal.PRECISION) {
      result.digits = result.digits.slice(0, Decimal.PRECISION);
    }

    return result;
  }

  mul(other: Decimal): Decimal {
    if (this.isZero() || other.isZero()) {
      return new Decimal(0);
    }

    const result = new Decimal();
    result.sign = this.sign === other.sign ? 1 : -1;

    // School multiplication
    const prodLen = this.digits.length + other.digits.length;
    const product = new Array(prodLen).fill(0);

    for (let i = this.digits.length - 1; i >= 0; i--) {
      for (let j = other.digits.length - 1; j >= 0; j--) {
        const pos = i + j + 1;
        const mul = this.digits[i] * other.digits[j] + product[pos];
        product[pos] = mul % 10;
        product[pos - 1] += Math.floor(mul / 10);
      }
    }

    // Propagate carries
    for (let i = prodLen - 1; i > 0; i--) {
      if (product[i] >= 10) {
        product[i - 1] += Math.floor(product[i] / 10);
        product[i] %= 10;
      }
    }

    result.digits = product;
    result.exp = this.exp + other.exp;

    // Normalize
    while (result.digits.length > 1 && result.digits[0] === 0) {
      result.digits.shift();
      result.exp--;
    }

    if (result.digits.length > Decimal.PRECISION) {
      result.digits = result.digits.slice(0, Decimal.PRECISION);
    }

    return result;
  }

  sqr(): Decimal {
    return this.mul(this);
  }

  gt(threshold: number): boolean {
    return this.toNumber() > threshold;
  }
}

/**
 * BigFloatJS - JavaScript fallback for arbitrary precision
 */
export class BigFloatJS {
  /**
   * Compute Mandelbrot iteration for a single point
   */
  mandelbrotIterate(
    crStr: string,
    ciStr: string,
    maxIter: number,
    _precisionLimbs: number = 8
  ): number {
    const cr = new Decimal(crStr);
    const ci = new Decimal(ciStr);
    let zr = new Decimal(0);
    let zi = new Decimal(0);

    for (let i = 0; i < maxIter; i++) {
      // Check escape: |z|^2 > 4
      const zrSq = zr.sqr();
      const ziSq = zi.sqr();
      const magSq = zrSq.add(ziSq);

      if (magSq.gt(4.0)) {
        return i;
      }

      // z = z^2 + c
      // zr_new = zr^2 - zi^2 + cr
      // zi_new = 2*zr*zi + ci
      const newZr = zrSq.sub(ziSq).add(cr);
      const newZi = zr.mul(zi).mul(new Decimal(2)).add(ci);

      zr = newZr;
      zi = newZi;
    }

    return maxIter;
  }

  /**
   * Render a tile (slow but works)
   */
  renderTile(
    centerR: string,
    centerI: string,
    scaleStr: string,
    tileSize: number,
    maxIter: number,
    precisionLimbs: number = 8
  ): Float32Array {
    const result = new Float32Array(tileSize * tileSize);
    const scale = parseFloat(scaleStr);
    const centerRNum = parseFloat(centerR);
    const centerINum = parseFloat(centerI);

    for (let py = 0; py < tileSize; py++) {
      for (let px = 0; px < tileSize; px++) {
        const pxNorm = (px - tileSize * 0.5) / tileSize;
        const pyNorm = (py - tileSize * 0.5) / tileSize;

        const cr = centerRNum + pxNorm * scale;
        const ci = centerINum + pyNorm * scale;

        const iter = this.mandelbrotIterate(
          cr.toString(),
          ci.toString(),
          maxIter,
          precisionLimbs
        );

        // Simple smooth coloring approximation
        result[py * tileSize + px] = iter;
      }
    }

    return result;
  }
}

// Singleton
let jsInstance: BigFloatJS | null = null;

export function getBigFloatJS(): BigFloatJS {
  if (!jsInstance) {
    jsInstance = new BigFloatJS();
  }
  return jsInstance;
}
