FROM node:22

RUN npm i -g pnpm

RUN curl https://sh.rustup.rs -sSf | sh -s -- -y

ENV PATH="/root/.cargo/bin:$PATH"

WORKDIR /app

COPY . .

RUN pnpm install

EXPOSE 1420

CMD ["pnpm", "run", "dev", "--host"]