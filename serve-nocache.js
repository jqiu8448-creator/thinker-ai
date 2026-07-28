const handler = require('serve-handler');
const http = require('http');
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return handler(req, res, { public: 'dist', cleanUrls: true });
});
server.listen(8088, () => { console.log('no-cache serve on 8088'); });
