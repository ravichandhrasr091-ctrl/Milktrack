const releaseList = document.querySelector('#release-list');
const releaseCount = document.querySelector('#release-count');

function createReleaseCard(release, latest) {
  const card = document.createElement('article');
  card.className = 'release-card';

  const heading = document.createElement('div');
  heading.className = 'release-heading';
  const version = document.createElement('h3');
  version.textContent = `Version ${release.version}`;
  heading.append(version);

  if (latest) {
    const badge = document.createElement('span');
    badge.className = 'latest-badge';
    badge.textContent = 'Latest';
    heading.append(badge);
  }

  const date = document.createElement('p');
  date.className = 'release-date';
  date.textContent = release.date ? `Released ${release.date}` : 'Release date not provided';

  const notes = document.createElement('p');
  notes.className = 'release-notes';
  notes.textContent = release.notes || 'No release notes provided.';

  const download = document.createElement('a');
  download.className = 'download-button';
  download.href = release.apk;
  download.download = '';
  download.textContent = 'Download Android APK';
  download.setAttribute('aria-label', `Download MilkTrack version ${release.version} APK`);

  card.append(heading, date, notes, download);
  return card;
}

async function loadReleases() {
  try {
    const response = await fetch('./releases.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Release list request failed (${response.status}).`);

    const data = await response.json();
    if (!Array.isArray(data.releases)) {
      throw new Error('Release list has an invalid format.');
    }

    releaseCount.textContent = `${data.releases.length} ${
      data.releases.length === 1 ? 'version' : 'versions'
    }`;
    releaseList.replaceChildren();

    if (data.releases.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const title = document.createElement('h3');
      title.textContent = 'No app releases published yet';
      const detail = document.createElement('p');
      detail.textContent =
        'When a signed Android APK is ready, its version, notes, and download will appear here.';
      empty.append(title, detail);
      releaseList.append(empty);
      return;
    }

    data.releases.forEach((release, index) => {
      if (
        typeof release.version !== 'string' ||
        typeof release.apk !== 'string' ||
        !release.apk
      ) {
        throw new Error('A published release is missing its version or APK link.');
      }
      releaseList.append(createReleaseCard(release, index === 0));
    });
  } catch (error) {
    releaseCount.textContent = 'Unavailable';
    const message = document.createElement('p');
    message.className = 'error-state';
    message.textContent =
      error instanceof Error
        ? `Could not load releases: ${error.message}`
        : 'Could not load releases. Try again later.';
    releaseList.replaceChildren(message);
  }
}

void loadReleases();
