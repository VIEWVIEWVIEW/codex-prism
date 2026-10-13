// React's development profiler enumerates typed-array props byte by byte when
// they change. Keep the PDF opaque at component boundaries with an ArrayBuffer.
const buffers = new WeakMap<Uint8Array, ArrayBuffer>();

export function getPdfArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const cached = buffers.get(bytes);
  if (cached) return cached;

  const buffer =
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.slice().buffer;
  buffers.set(bytes, buffer);
  return buffer;
}
