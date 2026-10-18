# Imagem de DESENVOLVIMENTO da API (NestJS).
# Nada de produção aqui: não há multi-stage, build nem usuário enxuto.
#
# O código-fonte NÃO é copiado para dentro da imagem — ele chega por bind mount
# definido no docker-compose.yml. Consequência: a imagem é só "um Node com as
# ferramentas certas", e trocar código não exige rebuild.
#
# Node 24 (LTS) e não 22: o npm 10.9 que vem no Node 22 aborta a resolução das
# dependências deste scaffold com "Cannot read properties of null (reading
# 'edgesOut')". O npm 11 do Node 24 instala sem erro.
FROM node:24-alpine

# Roda como root, de propósito, e isso vale só para desenvolvimento no Windows.
# O bind mount de C:\ chega ao container como 9p e apresenta todo arquivo já
# existente como root:root 0644 (o uid é forçado pelas opções do mount, não dá
# para chown de dentro). Com USER node, o processo cria arquivo novo mas não
# reescreve nenhum dos que já existem: o `npm install` morre com EACCES ao
# gravar /app/package-lock.json. A imagem de produção é outra e aí sim deve
# descartar privilégio — aqui não há o que proteger, é a máquina do dev.

WORKDIR /app

EXPOSE 3000

# O comando real (incluindo o npm install dentro do volume) está no compose,
# para ficar visível na leitura do arquivo em vez de escondido na imagem.
CMD ["npm", "run", "start:dev"]
