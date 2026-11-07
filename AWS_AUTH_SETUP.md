# AWS and Google sign-in setup

The website includes the Google sign-in flow, but it is disabled until you
create and configure an Amazon Cognito user pool. The repository now includes
an AWS serverless sync template and Amplify build configuration; neither
creates resources until you deploy them.

## What you need

- An AWS account and a Cognito user pool in your chosen AWS Region.
- A Google OAuth **Web application** client ID and client secret from Google
  Cloud Console. These are OAuth credentials, not an AWS API key.
- The Cognito app client ID and Cognito hosted UI domain.

Do not put the Google client secret in this project's `.env.local`, any
`VITE_` variable, or browser code. Enter it only in the Cognito Google identity
provider settings. The Cognito app client used by this browser flow must not
have a client secret.

## Configure Cognito

1. In AWS Console, create a Cognito user pool and choose email as a sign-in
   option.
2. Under **Sign-in experience / Social and external providers**, add Google.
   Enter the Google OAuth client ID and secret there. In Google Cloud Console,
   authorize Cognito's identity-provider callback URL:
   `https://<your-cognito-domain>/oauth2/idpresponse`.
3. Create a public app client for a single-page application. Enable the
   authorization-code grant and the `openid`, `email`, and `profile` scopes.
   Do not generate a client secret for this app client.
4. Configure the app client's callback URL as
   `http://localhost:5173/auth/callback` and its sign-out URL as
   `http://localhost:5173/` for local development.
5. Add Google as an allowed identity provider for the app client. Set the
   Cognito hosted UI domain.
6. In Google Cloud Console, add Cognito's hosted UI callback URL to the Google
   OAuth client's authorized redirect URIs.

## Configure this project

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_COGNITO_DOMAIN` to the Cognito domain, including `https://` and
   without a trailing slash.
3. Set `VITE_COGNITO_CLIENT_ID` to the public Cognito app client ID.
4. Set the callback and logout URLs to match the Cognito app client's allow
   lists exactly.
5. Restart the Vite server and open `/login` to test Google sign-in.

For production, deploy the website to an HTTPS domain and replace the local
callback/logout URLs with that domain in both Cognito and the build environment.
The Google OAuth client must also allow Cognito's hosted UI callback URL.

## Production sync and hosting

The production backend is defined in `backend/template.yaml`. It creates:

- An API Gateway HTTP API that validates Cognito JWTs.
- A Lambda API that derives the data owner from the verified token, rather
  than trusting an owner ID sent by the browser.
- A pay-per-request DynamoDB table with point-in-time recovery and retained
  data on stack deletion/replacement.
- A private, encrypted S3 bucket with public access blocked, TLS required,
  versioning enabled, and short-lived presigned photo forms/URLs.

AWS charges can apply for storage, requests, backups, logs, Lambda, API
Gateway, and Amplify Hosting. The stack has not been deployed. Before a
production deploy, choose the AWS account/Region, review the template and
expected charges, and configure an AWS budget/alert.

### Deploy the backend (only after approving AWS charges)

Use a Region that contains the Cognito user pool and its public app client.
Set `AppOrigin` to the exact HTTPS Amplify origin, for example
`https://main.<app-id>.amplifyapp.com`.

From the project root, build and deploy the SAM template:

```powershell
sam build --template-file backend/template.yaml
sam deploy --guided --template-file .aws-sam/build/template.yaml
```

Provide `CognitoUserPoolId`, `CognitoAppClientId`, and `AppOrigin` when
prompted. Save the `ApiBaseUrl` stack output for the frontend configuration.
Do not put AWS credentials, Google client secrets, or Cognito secrets in
frontend variables.

### Deploy the frontend with Amplify Hosting

1. Connect the project repository and branch in Amplify Hosting. The build
   uses `amplify.yml` (`npm ci`, `npm run build`, and the `dist` artifact).
2. Set these Amplify build environment variables:
   - `VITE_COGNITO_DOMAIN`
   - `VITE_COGNITO_CLIENT_ID`
   - `VITE_COGNITO_REDIRECT_URI=https://<app-domain>/auth/callback`
   - `VITE_COGNITO_LOGOUT_URI=https://<app-domain>/`
   - `VITE_API_BASE_URL=<ApiBaseUrl stack output>`
3. In Amplify Hosting's **Rewrites and redirects** settings, add the SPA
   rewrite `/<*>` to `/index.html` with status `200`.
4. Add the production callback and sign-out URLs to the Cognito app client.
   The Google OAuth client continues to use Cognito's
   `https://<your-cognito-domain>/oauth2/idpresponse` callback.
5. If the Amplify domain changes, update the API/S3 `AppOrigin` CORS setting
   and redeploy the backend stack.

### GitHub Pages and versioned app downloads

The GitHub Actions workflow deploys the **website only** to GitHub Pages. Build
Android APKs in Android Studio, then attach each signed APK to a published
GitHub Release. The website's `/releases` page reads those public releases and
shows each version's APK download. No workflow builds or publishes the Android
app. GitHub Pages does not create the AWS API, Cognito pool, or private storage.

1. Create a **public** GitHub repository on the free GitHub plan. The source
   can be public; `.env` files and Android signing keys are excluded from Git.
2. Push this project to the repository's `main` branch.
3. In repository **Settings → Pages**, choose **GitHub Actions** as the build
   and deployment source.
4. In **Settings → Secrets and variables → Actions → Variables**, add the
   public build values `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_CLIENT_ID`, and,
   after the backend is deployed, `VITE_API_BASE_URL`. The callback and
   sign-out URLs default to the repository's GitHub Pages URL; allow those
   exact URLs in Cognito. The GitHub Actions workflow deploys on each push to
   `main`.
5. In Android Studio, open the repository's `android` project. For each new
   version, increment `versionCode` and update `versionName` in
   `android/app/build.gradle`. Choose **Build → Generate Signed Bundle / APK**,
   select **APK**, and create or select your Android signing key. Keep the key
   and passwords private and make a secure backup; every update must use the
   same signing key.
6. Test the generated signed APK on an Android device. On GitHub, create a
   Release with a version tag such as `v1.0.0` and attach the APK. Publish the
   Release; the website's `/releases` page will list its version and download.
   Repeat these steps for each version, increasing the version code and using
   the original signing key.
7. (Optional) Build the Windows `.exe` locally with `npm run desktop:build`
   and attach it to the same GitHub Release. It is not built by the website
   deployment workflow and is not code-signed, so Windows may show an
   unknown-publisher warning.

The GitHub Pages workflow deploys only the website on pushes to `main`.
GitHub Pages and public GitHub Release assets are public; do not put receipt
data, credentials, or signing secrets in the repository.

### Receipt data behavior

- On the first sign-in after the local schema upgrade, existing unowned
  IndexedDB receipts are associated with that account on this browser only.
  Their records and photos are not uploaded.
- New verified receipts are saved locally first and then synced to the
  signed-in account. If network sync fails, they stay on-device and retry
  automatically when the app is online/open.
- Cloud receipts are downloaded only for the authenticated account. Their
  original photos are fetched through short-lived signed URLs.
- Clearing browser storage still removes the local offline copy. Cloud sync
  is not a substitute for an independent backup/export.

No AWS resources are created automatically. The local `.env` file is ignored
by Git; use `.env.example` as a template and never put a Google client secret
in a `VITE_` variable.
