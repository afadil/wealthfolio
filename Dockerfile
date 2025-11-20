# Global build args
ARG RUST_IMAGE=rust:1.86-alpine

# Stage 1: build frontend
# Use --platform=$BUILDPLATFORM to run on the native runner (fast)
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .
ENV CI=1
RUN npm install -g pnpm@9.9.0 && pnpm install --frozen-lockfile
# Build only the main app to avoid building workspace addons in this image
RUN pnpm tsc && pnpm vite build && mv dist /web-dist

# Stage 2: build server with cross-compilation
FROM --platform=$BUILDPLATFORM tonistiigi/xx AS xx

FROM --platform=$BUILDPLATFORM ${RUST_IMAGE} AS backend
# Copy xx scripts to handle cross-compilation
COPY --from=xx / /
ARG TARGETPLATFORM
WORKDIR /app

# Install build tools for the HOST (to run cargo, build scripts)
# clang/lld are needed for cross-linking
RUN apk add --no-cache clang lld build-base git file

# Install TARGET dependencies
# xx-apk installs into /$(xx-info triple)/...
RUN xx-apk add --no-cache musl-dev gcc openssl-dev openssl-libs-static sqlite-dev

# Install rust target
RUN rustup target add $(xx-cargo --print-target-triple)

# Leverage Docker layer caching for dependencies
COPY src-core/Cargo.toml ./src-core/Cargo.toml
COPY src-server/Cargo.toml src-server/Cargo.lock ./src-server/
RUN mkdir -p src-core/src src-server/src && \
    echo "fn main(){}" > src-server/src/main.rs && \
    echo "" > src-core/src/lib.rs && \
    xx-cargo fetch --manifest-path src-server/Cargo.toml

# Now copy full sources
COPY src-core ./src-core
COPY src-server ./src-server
ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
ENV OPENSSL_STATIC=1
# Build using xx-cargo which handles target flags
RUN xx-cargo build --release --manifest-path src-server/Cargo.toml && \
    # Move the binary to a predictable location because the target dir changes with --target
    cp src-server/target/$(xx-cargo --print-target-triple)/release/wealthfolio-server /wealthfolio-server

# Final stage
FROM alpine:3.19
WORKDIR /app
# Copy from backend (which is now build platform, but binary is target platform)
COPY --from=backend /wealthfolio-server /usr/local/bin/wealthfolio-server
COPY --from=frontend /web-dist ./dist
ENV WF_DB_PATH=/data/wealthfolio.db
VOLUME ["/data"]
EXPOSE 8080
CMD ["/usr/local/bin/wealthfolio-server"]
