import { spawn } from 'node:child_process';
import { createApp } from './index.js';

const port = Number(process.env.PORT || 8787);
const app = createApp();

app.listen(port, '127.0.0.1', () => {
  console.log(`Local Image Console API running at http://127.0.0.1:${port}`);
});

if (process.env.NO_VITE !== '1') {
  const vite = spawn('npx vite --host 127.0.0.1', {
    stdio: 'inherit',
    shell: true
  });

  process.on('SIGINT', () => {
    vite.kill('SIGINT');
    process.exit();
  });
}
