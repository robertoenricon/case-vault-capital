# Imagem de DESENVOLVIMENTO do front (React + Vite).
# Serve o dev server com HMR; não gera build estático nem usa nginx.
#
# Como na API, o código vem por bind mount (docker-compose.yml) e não é copiado.
FROM node:24-alpine

# Roda como root pelo mesmo motivo do Dockerfile da API: no bind mount 9p do
# Windows todo arquivo existente aparece como root:root 0644, e sem privilégio
# o `npm install` não consegue reescrever o package-lock.json. Decisão restrita
# ao ambiente de desenvolvimento.

WORKDIR /app

EXPOSE 5173

CMD ["npm", "run", "dev"]
