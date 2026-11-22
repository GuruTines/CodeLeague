FROM rust:1-bookworm AS build
WORKDIR /src
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
# Toolchains must be installed system-wide: sandboxed code runs as an unprivileged uid.
RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc g++ libc6-dev python3 rustc golang-go \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/codeleague-judge /usr/local/bin/
ENV CL_BIND=0.0.0.0:8081 CL_WORK_ROOT=/var/lib/codeleague-judge
EXPOSE 8081
# Runs as root on purpose: needed to create namespaces and drop to per-slot uids.
# Needs CAP_SYS_ADMIN (unshare), CAP_SETUID, CAP_SETGID, CAP_CHOWN; docker's default seccomp
# profile may block unshare (see README).
CMD ["codeleague-judge"]
