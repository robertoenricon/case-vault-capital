import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dentro do container, escutar só em localhost tornaria o servidor
    // inacessível pelo mapeamento de porta do Docker.
    host: true,
    port: 5173,
    watch: {
      // Mesmo motivo do watchOptions no tsconfig da API: o bind mount de C:\
      // chega como 9p e não propaga inotify, então sem polling o HMR não
      // percebe um save. node_modules não entra no polling porque o Vite já
      // o exclui do watcher por padrão.
      usePolling: true,
    },
  },
})
