import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// Dev-only endpoints for editor.html: save lots.json, list and upload lot models in public/lots/models.
const LOTS = path.resolve('public/lots');
const lotEditor = {
  name: 'lot-editor',
  configureServer(server) {
    server.middlewares.use('/__lots', (req, res) => {
      const send = (code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
      const body = () => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
      if (req.method === 'GET' && req.url === '/models')
        return send(200, fs.readdirSync(path.join(LOTS, 'models')).filter(f => /\.(glb|gltf)$/i.test(f)).sort());
      if (req.method === 'POST' && req.url === '/save') return body().then(b => {
        const data = JSON.parse(b); if (!Array.isArray(data.lots)) return send(400, { error: 'lots missing' });
        fs.writeFileSync(path.join(LOTS, 'lots.json'), JSON.stringify(data, null, 0).replace(/\{"id"/g, '\n{"id"')); send(200, { ok: true });
      });
      const upload = req.method === 'POST' && req.url.match(/^\/models\/([\w .()%-]+\.glb)$/i);
      if (upload) return body().then(b => { const name = path.basename(decodeURIComponent(upload[1])); if (!/^[\w .()-]+\.glb$/i.test(name)) return send(400, { error: 'bad name' }); fs.writeFileSync(path.join(LOTS, 'models', name), b); send(200, { name }); });
      send(404, { error: 'unknown' });
    });
  },
};

// ponytail: relative base so the build works from any path (GitHub Pages project URL, file server, local folder).
export default defineConfig({
  base: './',
  plugins: [lotEditor],
  build: { rollupOptions: { input: { main: 'index.html', editor: 'editor.html' } } },
});
