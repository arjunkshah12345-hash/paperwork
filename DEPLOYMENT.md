# Deployment

Paperwork builds to static files in `dist/`. It needs no backend, database, or application secrets. Hosting does not receive the documents users process.

```sh
npm ci
npm test
npm run build
```

## GitHub Pages

Publish this repository publicly under your GitHub account. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.

The included `.github/workflows/deploy.yml` validates and deploys each push to `main`. It can also be started manually from the Actions tab. Vite uses relative asset paths, so the app works under a repository subpath without changing its configuration.

## Cloudflare Pages

Cloudflare is the primary hosting target. No Vercel configuration is required.

The Cloudflare Pages Direct Upload workflow uses Wrangler. Version `4.156.0` was used for the initial deployment. Authenticate with an account that has Cloudflare Pages permissions, or provide `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` through your shell's secret environment. Never commit credentials.

```sh
npx --yes wrangler@4.156.0 login
npx --yes wrangler@4.156.0 pages project create paperwork-pdf --production-branch main --force
npx --yes wrangler@4.156.0 pages deploy dist --project-name paperwork-pdf --branch main
```

Project creation is a one-time step. Reuse the existing project for later deployments. Use the production URL returned by Cloudflare. The creation-only `--force` flag selects the existing Pages platform rather than Wrangler's automatic Workers delegation; omit it on subsequent commands for the existing project. Direct Upload projects use external CI rather than Cloudflare's built-in Git integration.

### Deploy from GitHub Actions

The manual `.github/workflows/cloudflare.yml` workflow builds, tests, and deploys the app. Configure these repository Actions secrets first:

- `CLOUDFLARE_API_TOKEN`: an API token with Account → Cloudflare Pages → Edit on the target account.
- `CLOUDFLARE_ACCOUNT_ID`: the target account ID.

Create the Cloudflare Pages project once, then run **Deploy Cloudflare Pages** from the Actions tab. This workflow is manual so forks do not attempt deployments without credentials. GitHub Pages deployments remain automatic on `main`.

## Verify a deployment

- Open the site at its production URL, including a direct tool URL such as `/#rotate`.
- Upload a generated test PDF and confirm the preview loads.
- Process and download a PDF; also test PDF-to-images to verify the bundled PDF.js worker.
- Download the source archive from **About Paperwork**.
- Check narrow mobile layouts and dark mode.

## Site URL, file limits and search engines

- Set `SITE_URL` when building for a domain other than `https://pdfeditor.tech`, for example `SITE_URL=https://paperwork-pdf-emx.pages.dev npm run build`. Canonicals, the sitemap and structured data use it.
- The ONNX runtime WASM (about 26 MB) is over Cloudflare Pages' 25 MiB per-file limit. `scripts/seo.mjs` removes it from `dist/`, and `src/lib/transformers.ts` loads the same version from jsDelivr. When you upgrade `@huggingface/transformers`, update `ortVersion`; a test fails if they differ.
- `public/87fa24a165d71b80c72ab509fd5d1eed.txt` is the IndexNow key. After a deploy, POST the sitemap URLs to `https://api.indexnow.org/indexnow` with that key.
