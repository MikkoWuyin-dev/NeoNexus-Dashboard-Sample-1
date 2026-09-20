// Minimal static file server for the local clone.
// Serves ./public at http://localhost:4173 with correct MIME types,
// query-string stripping, and SPA-ish fallback of / -> /index.html.
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, 'public')
const envPort = Number(process.env.PORT)
const PORT = Number.isFinite(envPort) && envPort > 0 ? envPort : 4173

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    let filePath = path.normalize(path.join(ROOT, urlPath))

    // Prevent path traversal.
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403)
      return res.end('Forbidden')
    }

    if (urlPath === '/' || urlPath === '') filePath = path.join(ROOT, 'index.html')
    if (urlPath === '/dashboard/project-management') filePath = path.join(ROOT, 'index.html')

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        // Page routes (no file extension) fall back to the app HTML so
        // Next.js client-side routing works. Asset-like paths are genuine 404s
        // (serving HTML there would poison <script> tags and break hydration).
        const ext = path.extname(urlPath)
        if (!ext || ext === '.html') {
          return streamFile(path.join(ROOT, 'index.html'), res)
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end('404 Not Found: ' + urlPath)
      }
      streamFile(filePath, res)
    })
  } catch (e) {
    console.error('HANDLER ERROR:', e)
    try {
      res.writeHead(500)
      res.end('Internal error')
    } catch (_) {}
  }
})

function streamFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase()
  console.log('GET', filePath)
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  fs.createReadStream(filePath)
    .on('error', (err) => {
      console.error('STREAM ERROR:', filePath, err)
      res.destroy()
    })
    .pipe(res)
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Clone server running at http://localhost:${PORT}`)
})
