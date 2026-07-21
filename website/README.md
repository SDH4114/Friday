# Raya website

The official Raya website is a statically exported Next.js application designed for GitHub Pages. It has no server runtime, database, external content API, or dynamic route dependency.

## Local development

```bash
cd website
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production build

Build for a root domain:

```bash
npm run build
```

Build for the `Raya-APPLE` GitHub Pages project path:

```bash
NEXT_PUBLIC_BASE_PATH=/Raya-APPLE npm run build
```

The static site is written to `website/out/`. Serve that directory as plain files to verify the exported result.

## GitHub Pages

The repository workflow at `.github/workflows/pages.yml` builds `website/` with the `/Raya-APPLE` base path and deploys `website/out/` through GitHub's official Pages actions.

Before the first deployment, enable Pages once in **Settings → Pages → Build and deployment → Source → GitHub Actions**. GitHub does not allow the workflow's built-in `GITHUB_TOKEN` to create the Pages site because that operation requires repository administration permission. After Pages is enabled, pushes to `prime` deploy automatically.

The configuration uses:

- `output: "export"`;
- a build-time `basePath` and `assetPrefix`;
- trailing slashes for directory-style Pages routes;
- only static `generateStaticParams` documentation pages;
- unoptimized local assets, so no Next image server is required.

## Content and links

- Product and documentation content: `content/docs.ts`
- Documentation navigation: `config/navigation.ts`
- Repository, installer, license, and future community links: `config/site.ts`
- Text-mode Raya poses: `config/mascot.ts`

`telegram` and `telegramChannel` intentionally remain `null` in `siteConfig`. Add real URLs there when they are available; the current site does not render fake community links.

## Replacing the text mascot

The current design intentionally uses a terminal-style Raya interface. Keep the `RayaMascot` pose API if the terminal preview is extended so page layouts do not need to change.
