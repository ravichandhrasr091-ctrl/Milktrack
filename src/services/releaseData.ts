export interface AppRelease {
  version: string;
  date?: string;
  notes?: string;
  apk?: string;
  windowsInstaller?: string;
}

export function parseReleaseManifest(
  value: unknown,
  origin: string,
): AppRelease[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('releases' in value) ||
    !Array.isArray(value.releases)
  ) {
    throw new Error('The published release list has an invalid format.');
  }

  return value.releases.map((release) => {
    if (
      typeof release !== 'object' ||
      release === null ||
      !('version' in release) ||
      typeof release.version !== 'string' ||
      !/^[0-9]+(?:\.[0-9]+){0,2}$/.test(release.version) ||
      (!('apk' in release) && !('windowsInstaller' in release)) ||
      ('apk' in release &&
        release.apk !== undefined &&
        (typeof release.apk !== 'string' ||
          !isSafeReleasePath(release.apk, origin, 'apk'))) ||
      ('windowsInstaller' in release &&
        release.windowsInstaller !== undefined &&
        (typeof release.windowsInstaller !== 'string' ||
          !isSafeReleasePath(release.windowsInstaller, origin, 'exe'))) ||
      ('date' in release &&
        release.date !== undefined &&
        typeof release.date !== 'string') ||
      ('notes' in release &&
        release.notes !== undefined &&
        typeof release.notes !== 'string')
    ) {
      throw new Error('The published release list has an invalid format.');
    }

    return {
      version: release.version,
      date: 'date' in release ? release.date : undefined,
      notes: 'notes' in release ? release.notes : undefined,
      apk: 'apk' in release ? release.apk : undefined,
      windowsInstaller:
        'windowsInstaller' in release ? release.windowsInstaller : undefined,
    };
  });
}

export function parseGitHubReleases(
  value: unknown,
  repository: string,
): AppRelease[] {
  if (!isGitHubRepository(repository) || !Array.isArray(value)) {
    throw new Error('The GitHub release configuration is invalid.');
  }

  return value.flatMap((release): AppRelease[] => {
    if (
      typeof release !== 'object' ||
      release === null ||
      !('tag_name' in release) ||
      typeof release.tag_name !== 'string' ||
      !('assets' in release) ||
      !Array.isArray(release.assets)
    ) {
      throw new Error('GitHub returned an invalid release list.');
    }
    const version = release.tag_name.replace(/^v/, '');
    if (!/^[0-9]+(?:\.[0-9]+){0,2}$/.test(version)) return [];

    const assets: Record<string, string> = {};
    for (const asset of release.assets) {
      if (
        typeof asset === 'object' &&
        asset !== null &&
        'name' in asset &&
        typeof asset.name === 'string' &&
        'browser_download_url' in asset &&
        typeof asset.browser_download_url === 'string'
      ) {
        const extension = asset.name.toLowerCase().endsWith('.apk')
          ? 'apk'
          : asset.name.toLowerCase().endsWith('.exe')
            ? 'windowsInstaller'
            : null;
        if (
          extension &&
          isSafeGitHubAsset(asset.browser_download_url, repository)
        ) {
          assets[extension] = asset.browser_download_url;
        }
      }
    }
    if (!assets.apk && !assets.windowsInstaller) return [];

    return [
      {
        version,
        date:
          'published_at' in release && typeof release.published_at === 'string'
            ? release.published_at.slice(0, 10)
            : undefined,
        notes:
          'body' in release && typeof release.body === 'string'
            ? release.body
            : undefined,
        apk: assets.apk,
        windowsInstaller: assets.windowsInstaller,
      },
    ];
  });
}

function isGitHubRepository(value: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function isSafeGitHubAsset(url: string, repository: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'github.com' &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname.startsWith(`/${repository}/releases/download/`)
    );
  } catch {
    return false;
  }
}

function isSafeReleasePath(
  path: string,
  origin: string,
  extension: 'apk' | 'exe',
): boolean {
  if (!path || path.startsWith('//') || path.includes('\\')) return false;
  try {
    const url = new URL(path, origin);
    return (
      url.origin === origin &&
      url.pathname.toLowerCase().endsWith(`.${extension}`)
    );
  } catch {
    return false;
  }
}
