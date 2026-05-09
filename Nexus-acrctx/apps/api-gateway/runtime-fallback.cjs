const express = require('express');

const app = express();
const port = Number(process.env.PORT || 4000);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'quantchat-api-fallback' });
});

app.get('*', (_req, res) => {
  res.status(200).json({
    status: 'running',
    mode: 'fallback',
    message: 'API fallback is active while core modules are being stabilized.'
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`QuantChat API fallback listening on ${port}`);
});
