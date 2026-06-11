/**
 * Compact sRGB ICC v4 colour profile — 480 bytes.
 *
 * Source: https://github.com/saucecontrol/Compact-ICC-Profiles (Apache-2.0)
 * Profile: sRGB-v4.icc  (ICC.2:2019 v4, LittleCMS-generated)
 *
 * Embedding the profile inline avoids a build-time network dependency and
 * ensures the OutputIntent is always available regardless of the host OS.
 */

// Each line is exactly 64 base64 characters; total 640 chars = 480 bytes.
const SRGB_V4_B64 =
  'AAAB4GxjbXMEIAAAbW50clJHQiBYWVogB+IAAwAUAAkADgAdYWNzcE1TRlQA' +
  'AAAAc2F3c2N0cmwAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1oYW5keem/Vlo+' +
  'AbaDI4VVRvdPqgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKZGVz' +
  'YwAAAPwAAAAkY3BydAAAASAAAAAid3RwdAAAAUQAAAAUY2hhZAAAAVgAAAAs' +
  'clhZWgAAAYQAAAAUZ1hZWgAAAZgAAAAUYlhZWgAAAawAAAAUclRSQwAAAcAA' +
  'AAAgZ1RSQwAAAcAAAAAgYlRSQwAAAcAAAAAgbWx1YwAAAAAAAAABAAAADGVu' +
  'VVMAAAAIAAAAHABzAFIARwBCbWx1YwAAAAAAAAABAAAADGVuVVMAAAAGAAAA' +
  'HABDAEMAMAAAWFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDD8AAAXd' +
  '///zJgAAB5AAAP2S///7of///aIAAAPcAADAcVhZWiAAAAAAAABvoAAAOPIA' +
  'AAOPWFlaIAAAAAAAAGKWAAC3iQAAGNpYWVogAAAAAAAAJKAAAA+FAAC2xHBh' +
  'cmEAAAAAAAMAAAACZmkAAPKnAAANWQAAE9AAAApb';

export function loadSrgbProfile(): Uint8Array {
  return new Uint8Array(Buffer.from(SRGB_V4_B64, 'base64'));
}
