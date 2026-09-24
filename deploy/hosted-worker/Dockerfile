# VPJ-07 #195 hosted text worker. Build from the repository root:
#   docker build -f deploy/hosted-worker/Dockerfile --build-arg BUILD_ID=$(git rev-parse --short=12 HEAD) -t vp-hosted-text-worker .
# The runtime needs only Node >= 22.6 (type stripping) and lib/ (no npm packages).
# It contains no secret and starts nothing unless every runtime prerequisite is set;
# the SQL stop switch additionally starts disabled. See docs/runbooks/hosted-text-worker-staging.md.
# Pin the base image by digest at activation time (recorded in the runbook).
FROM node:22-bookworm-slim
ARG BUILD_ID=unversioned
ENV NODE_ENV=production \
    VISEPANDA_HOSTED_WORKER_BUILD=${BUILD_ID} \
    VISEPANDA_HOSTED_WORKER_JOURNAL_DIR=/var/lib/vp-worker/journal
WORKDIR /app
RUN printf '{"type":"module","private":true}\n' > package.json \
 && install -d -o node -g node -m 0700 /var/lib/vp-worker /var/lib/vp-worker/journal /run/vp-worker-secrets
COPY lib ./lib
USER node
# Journals (metadata-only usage/destination receipts) must survive restarts for
# reconciliation of unknown charges: mount a persistent volume here.
VOLUME ["/var/lib/vp-worker/journal"]
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "lib/server/jobs/run-hosted-text-worker.mjs"]
