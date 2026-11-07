import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(scriptDir, '../electron/desktop-config.json');
const repository = process.env.GITHUB_REPOSITORY;
let siteUrl = null;

if (repository) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repository);
  if (!match) throw new Error('GITHUB_REPOSITORY must use owner/repository format.');

  const [, owner, repo] = match;
  const isUserPage = repo.toLowerCase() === `${owner}.github.io`.toLowerCase();
  siteUrl = `https://${owner}.github.io/${isUserPage ? '' : `${repo}/`}`;
}

let cognitoOrigin = null;
const cognitoDomain = process.env.VITE_COGNITO_DOMAIN?.trim();
if (cognitoDomain) {
  const domain = new URL(cognitoDomain);
  if (domain.protocol !== 'https:') {
    throw new Error('VITE_COGNITO_DOMAIN must use HTTPS.');
  }
  cognitoOrigin = domain.origin;
}

await mkdir(dirname(configPath), { recursive: true });
await writeFile(
  configPath,
  `${JSON.stringify({ siteUrl, cognitoOrigin }, null, 2)}\n`,
  'utf8',
);
