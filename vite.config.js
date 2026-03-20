import { resolve, join } from 'path';
import { defineConfig } from 'vite';
import { readdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const talksDir = join(__dirname, 'talks');

const input = {
  main: resolve(__dirname, 'index.html')
};

readdirSync(talksDir, {encoding: 'utf8', withFileTypes: true})
  .filter(file => file.isDirectory())
  .forEach((subdir) => {
    readdirSync(resolve(talksDir, subdir.name), {encoding: 'utf8', withFileTypes: true})
      .filter(file => file.name.endsWith('.html'))
      .forEach((file) => {
        input[file.name] = resolve(talksDir, subdir.name, file.name);
      });
  });

export default defineConfig({
  base: '',
  build: {
    rollupOptions: {
      input
    }
  }
});
