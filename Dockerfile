# One image definition for every backend service — the service to run is
# selected with the SERVICE_DIR build argument (auth, catalog, order,
# notification, gateway).
FROM node:22-alpine

ARG SERVICE_DIR
ENV SERVICE_DIR=${SERVICE_DIR}
WORKDIR /app

# Manifests first so dependency installs stay cached across code edits.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/common/package.json ./packages/common/
COPY services/auth/package.json ./services/auth/
COPY services/catalog/package.json ./services/catalog/
COPY services/order/package.json ./services/order/
COPY services/notification/package.json ./services/notification/
COPY services/gateway/package.json ./services/gateway/
COPY frontend/package.json ./frontend/
RUN npm install --ignore-scripts

COPY packages ./packages
COPY services ./services

RUN npm run build:common && npm run build --workspace ./services/${SERVICE_DIR}

CMD ["sh", "-c", "node services/${SERVICE_DIR}/dist/index.js"]
