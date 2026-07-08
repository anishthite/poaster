FROM docker.io/cloudflare/sandbox:0.12.1

LABEL org.opencontainers.image.source="https://github.com/anishthite/poaster" \
      org.opencontainers.image.description="Poaster Cloudflare Sandbox runtime with pi dependencies"

WORKDIR /workspace/poaster-sandbox-runtime

COPY VERSION.txt package.json pi-runner.js tweet-guidance.md ./

RUN npm install --silent --ignore-scripts \
 && mkdir -p /root/.pi/agent /root/.pi/sessions
