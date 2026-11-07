import { describe, expect, it } from 'vitest';
import { parseGitHubReleases, parseReleaseManifest } from './releaseData';

describe('app release links', () => {
  it('accepts same-site APK and Windows installer paths', () => {
    expect(
      parseReleaseManifest(
        {
          releases: [
            {
              version: '1.0.0',
              apk: '/downloads/MilkTrack.apk',
              windowsInstaller: '/downloads/MilkTrack-Setup.exe',
            },
          ],
        },
        'https://owner.github.io',
      ),
    ).toEqual([
      {
        version: '1.0.0',
        date: undefined,
        notes: undefined,
        apk: '/downloads/MilkTrack.apk',
        windowsInstaller: '/downloads/MilkTrack-Setup.exe',
      },
    ]);
  });

  it('rejects unsafe release paths', () => {
    expect(() =>
      parseReleaseManifest(
        { releases: [{ version: '1.0', apk: 'https://evil.example/app.apk' }] },
        'https://owner.github.io',
      ),
    ).toThrow(/invalid format/i);
    expect(() =>
      parseReleaseManifest(
        { releases: [{ version: '1.0', apk: '/downloads/setup.exe' }] },
        'https://owner.github.io',
      ),
    ).toThrow(/invalid format/i);
  });

  it('maps public GitHub release APK and Windows assets', () => {
    expect(
      parseGitHubReleases(
        [
          {
            tag_name: 'v1.2.0',
            published_at: '2026-11-07T10:00:00Z',
            body: 'Bug fixes',
            assets: [
              {
                name: 'MilkTrack-1.2.0-Android.apk',
                browser_download_url:
                  'https://github.com/milk/example/releases/download/v1.2.0/MilkTrack.apk',
              },
              {
                name: 'MilkTrack-1.2.0-Setup.exe',
                browser_download_url:
                  'https://github.com/milk/example/releases/download/v1.2.0/MilkTrack.exe',
              },
            ],
          },
        ],
        'milk/example',
      ),
    ).toEqual([
      {
        version: '1.2.0',
        date: '2026-11-07',
        notes: 'Bug fixes',
        apk: 'https://github.com/milk/example/releases/download/v1.2.0/MilkTrack.apk',
        windowsInstaller:
          'https://github.com/milk/example/releases/download/v1.2.0/MilkTrack.exe',
      },
    ]);
  });

  it('ignores release assets hosted outside the configured repository', () => {
    expect(
      parseGitHubReleases(
        [
          {
            tag_name: 'v1.0',
            assets: [
              {
                name: 'malicious.apk',
                browser_download_url: 'https://evil.example/app.apk',
              },
            ],
          },
        ],
        'milk/example',
      ),
    ).toEqual([]);
  });
});
