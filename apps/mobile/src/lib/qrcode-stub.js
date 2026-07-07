'use strict';
// Minimal QR code stub — provides QRCode.create() used by react-native-qrcode-svg
// Generates real finder/timing patterns; data area uses value hash (visual only).
// Replace by: pnpm add qrcode --filter @cdv/mobile  (then remove Metro alias)

const SIZE = 29; // QR version 3 (29×29)

function create(value) {
  const data = new Uint8ClampedArray(SIZE * SIZE).fill(0);

  function set(r, c) { if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) data[r * SIZE + c] = 1; }

  // Finder pattern at (row, col)
  function finder(r0, c0) {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
        set(r0 + r, c0 + c);
    }
  }
  finder(0, 0); finder(0, SIZE - 7); finder(SIZE - 7, 0);

  // Timing patterns
  for (let i = 8; i < SIZE - 8; i++) {
    if (i % 2 === 0) { set(6, i); set(i, 6); }
  }

  // Dark module
  set(8, SIZE - 8);

  // Pseudo-random data from value (deterministic per dancer ID)
  let h = 0x9e3779b9;
  for (let i = 0; i < value.length; i++) h = ((h ^ value.charCodeAt(i)) * 0x6b43a9b5) >>> 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== 0) continue;
    const x = i % SIZE, y = (i / SIZE) | 0;
    if ((x < 9 && y < 9) || (x > SIZE - 9 && y < 9) || (x < 9 && y > SIZE - 9)) continue;
    if (x === 6 || y === 6) continue;
    h = ((h ^ i) * 0x6b43a9b5) >>> 0;
    data[i] = (h >>> 16) & 1;
  }

  return { modules: { data, size: SIZE } };
}

module.exports = { create };
