# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar package files e instalar dependências
COPY package.json package-lock.json ./
RUN npm ci

# Copiar todo o código fonte
COPY . .

# Build da aplicação (gera a pasta /app/dist)
RUN npm run build

# ---- Production Stage ----
FROM node:22-alpine AS production

WORKDIR /app

# Copiar package files e instalar apenas dependências de produção
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copiar o servidor Express
COPY server.js ./

# Copiar a pasta dist gerada no build
COPY --from=builder /app/dist ./dist

# Expor a porta do servidor
EXPOSE 3000

# Comando para iniciar o servidor em modo produção
CMD ["node", "server.js"]
