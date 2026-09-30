/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Marketing plan PDFs go through a server action as FormData; the
      // 1MB default is too tight for a real deck with images.
      bodySizeLimit: "20mb",
    },
  },
  // puppeteer-core + @sparticuz/chromium (silom-sync cron) ship a native
  // binary -- Next's bundler must not try to trace/optimize it, or the
  // serverless function ends up with a broken or missing executable.
  // pdfjs-dist (bank statement parsing, src/lib/bank-statement.ts) has its
  // own Node/browser environment detection and an optional native canvas
  // dependency we never install -- let it resolve those itself at runtime
  // rather than having the bundler try to trace through them.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "pdfjs-dist"],
  // serverExternalPackages keeps the bundler from touching the package's
  // JS, but Next's own file-tracing step (which decides what actually
  // ships with the deployed function) still doesn't follow the dynamic
  // fs.readFileSync() calls @sparticuz/chromium uses to find its own
  // binary -- so the compressed Chromium build never made it into the
  // deployed function and it failed at runtime with "input directory
  // .../@sparticuz/chromium/bin does not exist". This tells the tracer
  // to include that folder for the cron route explicitly.
  // pdfjs-dist tries to set up a Node "fake worker" by dynamically
  // importing its own pdf.worker.mjs at runtime -- the file tracer never
  // sees that dynamic import statically, so pdf.worker.mjs never made it
  // into the deployed function and every statement upload failed with
  // "Setting up fake worker failed: Cannot find module .../pdf.worker.mjs"
  // regardless of whether the PDF even had a password. Same shape of bug
  // as the chromium binary above, same fix: tell the tracer explicitly.
  outputFileTracingIncludes: {
    "/api/cron/silom-sync": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/reconciliation": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};
export default nextConfig;
