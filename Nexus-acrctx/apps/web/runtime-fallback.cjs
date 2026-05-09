const http = require('http');

const port = Number(process.env.PORT || 3000);
const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QuantChat</title><style>body{font-family:Arial,sans-serif;background:#0b0f14;color:#eaf2ff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{max-width:680px;padding:24px;border:1px solid #223247;border-radius:12px;background:#101826}h1{margin:0 0 12px}p{line-height:1.5;color:#c7d5e6}code{background:#0b1220;padding:2px 6px;border-radius:6px}</style></head><body><main><h1>QuantChat Web is live</h1><p>Fallback runtime is active while frontend build issues are being stabilized.</p><p>API endpoint: <code>${apiUrl}</code></p></main></body></html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`QuantChat web fallback listening on ${port}`);
});
