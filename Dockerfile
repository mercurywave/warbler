# --- Build stage ---
FROM node:lts-alpine AS build
WORKDIR /usr/src/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install --silent
COPY . .
RUN npm run build

# --- Production stage ---
FROM node:lts-alpine
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/package.json ./
COPY --from=build /usr/src/app/server.js ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
EXPOSE 6464
USER node
CMD ["npm", "serve"]