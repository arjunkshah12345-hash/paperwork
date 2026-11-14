// The ONNX runtime WASM (~26 MB) exceeds Cloudflare Pages' 25 MiB per-file limit, so it is
// fetched from jsDelivr at the exact version transformers.js depends on. Documents never leave the device.
/** Must equal the installed onnxruntime-web version (checked by transformers.test.ts). */
export const ortVersion = '1.31.0-dev.20260914-8d85527a0'

export async function loadTransformers() {
  const transformers = await import('@huggingface/transformers')
  const wasm = transformers.env.backends.onnx.wasm
  if (wasm) wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ortVersion}/dist/`
  return transformers
}
