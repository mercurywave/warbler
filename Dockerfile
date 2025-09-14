# --- Build stage ---
FROM node:lts-alpine AS build
WORKDIR /usr/src/app
COPY ["package.json", "package-lock.json*", "./"]
RUN npm install --silent
COPY . .
RUN npm run build

# --- Production stage ---
FROM node:lts-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/package.json ./
COPY --from=build /usr/src/app/server.js ./
COPY --from=build /usr/src/app/certgen.sh ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
EXPOSE 6464
RUN mkdir -p /certs && chown node:node /certs
USER node
RUN if [ -z "$ENABLE_HTTPS" ]; then \
        sh "certgen.sh"; \ 
    fi
CMD ["node", "server.js"]