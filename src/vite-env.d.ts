/// <reference types="vite/client" />

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const src: string;
  export default src;
}

declare module 'uuid' {
  export function v4(): string;
}
