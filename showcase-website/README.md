# Assistive Control showcase

A standalone Next.js App Router website for Assistive Control. It contains the
product showcase, three actual app screenshots, a keyboard-accessible screenshot
gallery, an interactive movement-pattern example, the Windows downloads, FAQs,
and a detailed `/guide` page.

## Run locally

Use Node.js 24 LTS. From this folder:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

For production verification:

```bash
npm run build
npm run typecheck
npm start
```

The site has its own package manifest and lockfile. It does not import Electron,
native input modules, or files from the parent application.

## Deploy to Vercel

1. Push this folder and its contents to your GitHub repository.
2. Import the repository in Vercel, or open the existing project's settings.
3. Set **Root Directory** to **`showcase-website`** (with a hyphen).
4. Select the **Next.js** framework preset and **Node.js 24.x**.
5. Use **`npm ci`** for the install command and **`npm run build`** for the build
   command. Leave **Output Directory** at the Next.js default; do not set it to
   `out`, `dist`, or the Electron project's `release` directory.
6. Deploy.

No database, API key, or required environment variable is needed. The root
directory setting is important: the repository root is an Electron app with a
different build command.

Keep the folder name free of spaces. Vercel includes the folder path in generated
serverless function names, which reject spaces. If your Vercel project still
points to the former `showcase website` folder, update its **Root Directory** to
**`showcase-website`** after pushing the rename, then deploy the new commit.

Social sharing URLs use Vercel's production URL automatically. If you attach a
custom domain, optionally set `NEXT_PUBLIC_SITE_URL` to its full HTTPS URL, such
as `https://your-domain.com`, and redeploy. This is optional and not needed for
the website or downloads to work.

## Downloads

The two buttons link directly to the supplied GitHub release files. No EXEs are
copied into the website or served through a Vercel function.

- Installer: `https://github.com/mriganka528/Assistive-control/releases/download/assistive-control-1.0.1/Assistive-Control-Setup-x64.exe`
- Portable: `https://github.com/mriganka528/Assistive-control/releases/download/assistive-control-1.0.1/Assistive-Control-Portable-x64.exe`

Update the version and URLs in `lib/site.ts` for future releases. GitHub controls
the availability of these files; the website makes no remote fetch at build
time. Keep the release and its assets publicly downloadable.

## Screenshots and branding

`public/screenshots/` contains captures of the actual application's Home,
Settings, and Control Mapping screens. They were captured from an isolated
example profile; movement names and scores are illustrative, and no personal
webcam footage is included. The screenshots are labeled accordingly on the site.

The logo matches the desktop app. All screenshots, icons, and the social preview
are local assets. The site uses system fonts, so builds do not depend on Google
Fonts or another asset host.

The guide reflects the current source: Live Control arms automatically when the
camera is ready. It explains Pause and Ctrl+Shift+X before that step. It does not
advertise the unused virtual keyboard or launcher components as available UI.

## Verification

- A clean `npm ci` and production build passed using Node.js 24.18.0 and
  Next.js 16.3.4, with only this site's source files and dependencies.
- The homepage and guide are prerendered as static pages. The lockfile includes
  Linux build dependencies and has no dependency links to the Electron app.
- Browser checks covered desktop, 390px and 320px layouts, both exact download
  URLs, screenshot selection and zoom, keyboard navigation and focus return,
  the mobile menu, FAQs, image loading, and the 404 page.
- No browser console errors or failed page loads were observed. External GitHub
  asset availability is controlled by the release, not by this site's build.
