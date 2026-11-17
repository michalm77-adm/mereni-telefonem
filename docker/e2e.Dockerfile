# Playwright runner for E2E tests (browsers included in the base image).
FROM mcr.microsoft.com/playwright:v1.65.1-noble

COPY docker/certs/ /usr/local/share/ca-certificates/extra/
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

WORKDIR /tests
RUN npm init -y >/dev/null && npm install --no-audit --no-fund @playwright/test@1.65.1

CMD ["npx", "playwright", "test"]
