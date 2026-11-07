# MilkTrack Android release portal

This folder is a static website for publishing real, signed Android APK
releases. It does not build or sign the Android application. The release
manifest is `public/releases.json`.

The primary MilkTrack website now has its own APK releases page at `/releases`,
which reads the root project's `public/releases.json`. Treat that root manifest
as canonical for the primary website. This folder remains an optional,
standalone release portal; if you publish both sites, keep this folder's
manifest and APK copies in sync with the root website.

## Run locally

From the project root:

```bash
npm install
npm run dev:releases
```

Open the local URL printed by Vite. The page reads its release list from
`public/releases.json`.

## Publish a version

1. Build the Android application with the Android build setup and signing key
   for this product. Keep the signing key private and backed up. Do not publish
   unsigned or test APKs as production releases.
2. Copy the signed APK into this folder, for example
   `release-site/public/downloads/MilkTrack-v1.0.0.apk`.
3. Add a release entry to `release-site/public/releases.json`. Put newest releases first:

   ```json
   {
     "app": "MilkTrack",
     "platform": "Android",
     "releases": [
       {
         "version": "1.0.0",
         "date": "2026-11-05",
         "notes": "Describe only changes included in this release.",
         "apk": "./downloads/MilkTrack-v1.0.0.apk"
       }
     ]
   }
   ```

4. Build the website with `npm run build:releases`.
5. Publish the contents of `release-site-dist` to your chosen static website
   host. The site and APK links use relative paths so the portal can be served
   from a website subdirectory.
6. On an Android device, install the signed APK from the site and verify a
   later APK signed with the same key installs as an update without removing
   app data.

Each release is a separate APK download; the release site itself does not
silently replace or update the installed app. Android may ask the user to
approve installing an APK downloaded by the browser.
