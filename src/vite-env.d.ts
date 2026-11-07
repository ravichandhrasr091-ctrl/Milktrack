interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly VITE_COGNITO_DOMAIN?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  readonly VITE_COGNITO_REDIRECT_URI?: string;
  readonly VITE_COGNITO_LOGOUT_URI?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GITHUB_REPOSITORY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
