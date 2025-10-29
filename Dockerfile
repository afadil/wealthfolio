# Global build args
ARG RUST_IMAGE=rust:1.86-alpine

# Stage 1: build frontend
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .
ENV CI=1
RUN npm install -g pnpm@9.9.0 && pnpm install --frozen-lockfile
# Build only the main app to avoid building workspace addons in this image
RUN pnpm tsc && pnpm vite build && mv dist /web-dist

# Stage 2: build server
FROM ${RUST_IMAGE} AS backend
WORKDIR /app
# Leverage Docker layer caching for dependencies
COPY src-core/Cargo.toml ./src-core/Cargo.toml
COPY src-server/Cargo.toml src-server/Cargo.lock ./src-server/
RUN mkdir -p src-core/src src-server/src && \
    echo "fn main(){}" > src-server/src/main.rs && \
    echo "" > src-core/src/lib.rs && \
    apk add --no-cache \
      build-base \
      musl-dev \
      pkgconfig \
      openssl \
      openssl-dev \
      openssl-libs-static \
      sqlite-dev && \
    cargo fetch --manifest-path src-server/Cargo.toml

# Now copy full sources
COPY src-core ./src-core
COPY src-server ./src-server
ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
RUN cargo build --release --manifest-path src-server/Cargo.toml

# Final stage
FROM alpine:3.19
WORKDIR /app
COPY --from=backend /app/src-server/target/release/wealthfolio-server /usr/local/bin/wealthfolio-server
COPY --from=frontend /web-dist ./dist
ENV WF_DB_PATH=/data/wealthfolio.db
VOLUME ["/data"]
EXPOSE 8080
CMD ["/usr/local/bin/wealthfolio-server"]
