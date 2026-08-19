// Reads content/portfolio.json and generates a plain static index.html.
// No dependencies — run with: node build.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/portfolio.json'), 'utf8'));
const head = fs.readFileSync(path.join(ROOT, 'src/head.html'), 'utf8');

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PHOTO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
const VIDEO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>';

const META_ICONS = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
};

const TAB_ORDER = [
  { key: 'teaching', slug: 'teaching' },
  { key: 'internationalEducation', slug: 'intl-education' },
  { key: 'testing', slug: 'testing' },
  { key: 'publications', slug: 'publications' },
  { key: 'talks', slug: 'talks' },
  { key: 'media', slug: 'media' },
];

function renderBullets(bullets) {
  if (!bullets || !bullets.length) return '';
  return `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
}

function renderJobCard(job) {
  return `
        <div class="block-card">
          <div class="block-title-row">
            <h3>${escapeHtml(job.company)}</h3>
            <span class="dates">${escapeHtml(job.dates)}</span>
          </div>
          ${job.role ? `<p class="role">${escapeHtml(job.role)}</p>` : ''}
          ${renderBullets(job.bullets)}
        </div>`;
}

function renderPlaceholderCard(p) {
  return `
        <div class="placeholder card">
          <h3>${escapeHtml(p.company)}</h3>
          <p>${escapeHtml(p.note)}</p>
        </div>`;
}

function renderEducationCard(ed) {
  const bulletItems = (ed.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`);
  if (ed.dissertation) {
    bulletItems.push(`<li>Dissertation: <i>${escapeHtml(ed.dissertation)}</i>.</li>`);
  }
  return `
        <div class="block-card">
          <div class="block-title-row">
            <h3>${escapeHtml(ed.school)}</h3>
            <span class="dates">${escapeHtml(ed.dates)}</span>
          </div>
          <p class="role">${escapeHtml(ed.degree)}</p>
          <ul>${bulletItems.join('')}</ul>
        </div>`;
}

function renderCertTags(certs) {
  return certs
    .map((c) => `<span class="tag${c.accent ? ' accent' : ''}">${escapeHtml(c.text)}</span>`)
    .join('\n            ');
}

function renderGalleryTile(item) {
  if (item.type === 'video') {
    if (item.videoUrl) {
      const thumb = item.image
        ? `<img src="${escapeHtml(item.image)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-md);" />`
        : `${VIDEO_ICON}<span>Watch video</span>`;
      return `<a class="gallery-tile" href="${escapeHtml(item.videoUrl)}" target="_blank" rel="noopener" style="text-decoration:none;">${thumb}</a>`;
    }
    return `<div class="gallery-tile">${VIDEO_ICON}+ Add video</div>`;
  }
  if (item.image) {
    return `<div class="gallery-tile" style="padding:0;overflow:hidden;"><img src="${escapeHtml(item.image)}" alt="" style="width:100%;height:100%;object-fit:cover;" /></div>`;
  }
  return `<div class="gallery-tile">${PHOTO_ICON}+ Add photo</div>`;
}

function renderTabPanel(tabKey, slug, isActive) {
  const tab = data.tabs[tabKey];
  const activeClass = isActive ? ' active' : '';
  let body = '';

  if (tabKey === 'teaching') {
    body = `
        <div class="section-header">
          <p class="eyebrow">${escapeHtml(tab.eyebrow)}</p>
          <h2>${escapeHtml(tab.heading)}</h2>
        </div>
${(tab.jobs || []).map(renderJobCard).join('\n')}
${(tab.placeholders || []).map(renderPlaceholderCard).join('\n')}`;
  } else if (tabKey === 'internationalEducation') {
    body = `
        <div class="section-header">
          <p class="eyebrow">${escapeHtml(tab.eyebrow)}</p>
          <h2>${escapeHtml(tab.heading)}</h2>
        </div>
${(tab.jobs || []).map(renderJobCard).join('\n')}

        <div class="section-header" style="margin-top: var(--spacing-2xl);">
          <p class="eyebrow">${escapeHtml(tab.academicEyebrow)}</p>
          <h2>${escapeHtml(tab.academicHeading)}</h2>
        </div>
${(tab.education || []).map(renderEducationCard).join('\n')}`;
  } else if (tabKey === 'testing') {
    body = `
        <div class="section-header">
          <p class="eyebrow">${escapeHtml(tab.eyebrow)}</p>
          <h2>${escapeHtml(tab.heading)}</h2>
        </div>

        <div class="block-card">
          <h3 style="margin-bottom: var(--spacing-sm);">Certificates</h3>
          <div class="tag-row">
            ${renderCertTags(tab.certificates || [])}
          </div>
        </div>
${(tab.jobs || []).map(renderJobCard).join('\n')}

        <div class="placeholder">${escapeHtml(tab.emptyNote)}</div>`;
  } else if (tabKey === 'publications' || tabKey === 'talks') {
    body = `
        <div class="section-header">
          <p class="eyebrow">${escapeHtml(tab.eyebrow)}</p>
          <h2>${escapeHtml(tab.heading)}</h2>
        </div>
        <div class="placeholder">${escapeHtml(tab.emptyNote)}</div>`;
  } else if (tabKey === 'media') {
    body = `
        <div class="section-header">
          <p class="eyebrow">${escapeHtml(tab.eyebrow)}</p>
          <h2>${escapeHtml(tab.heading)}</h2>
        </div>
        <div class="gallery-grid">
          ${(tab.items || []).map(renderGalleryTile).join('\n          ')}
        </div>`;
  }

  return `      <section class="tab-panel${activeClass}" id="tab-${slug}">${body}
      </section>`;
}

function renderMetaItem(icon, text, href) {
  if (!text) return '';
  const tag = href ? 'a' : 'span';
  const attrs = href
    ? ` href="${escapeHtml(href)}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''}`
    : '';
  return `        <${tag} class="meta-item"${attrs}>
          ${META_ICONS[icon]}
          ${escapeHtml(text)}
        </${tag}>`;
}

function build() {
  const { hero } = data;

  const heroHtml = `  <header class="hero">
    <div class="wrap">
      <div class="hero-top">
        <div class="hero-heading">
          <h1>${escapeHtml(hero.name)}</h1>
          <p class="role">${escapeHtml(hero.role)}</p>
        </div>
        <div class="avatar" aria-hidden="true">${escapeHtml(hero.initials)}</div>
      </div>
      <div class="meta-row">
${[
  renderMetaItem('phone', hero.phone, hero.phone && `tel:${hero.phone.replace(/[^\d+]/g, '')}`),
  renderMetaItem('mail', hero.email, hero.email && `mailto:${hero.email}`),
  renderMetaItem(
    'linkedin',
    hero.linkedin,
    hero.linkedin && (/^https?:\/\//.test(hero.linkedin) ? hero.linkedin : `https://${hero.linkedin}`),
  ),
  renderMetaItem(
    'pin',
    hero.location,
    hero.location && `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hero.location)}`,
  ),
].filter(Boolean).join('\n')}
      </div>
      <p class="profile">${escapeHtml(hero.profile)}</p>
    </div>
  </header>`;

  const navHtml = `  <nav class="tabs">
    <div class="wrap">
${TAB_ORDER.map((t, i) => `      <button class="tab-btn${i === 0 ? ' active' : ''}" data-tab="${t.slug}">${escapeHtml(data.tabs[t.key].label)}</button>`).join('\n')}
    </div>
  </nav>`;

  const panelsHtml = TAB_ORDER.map((t, i) => renderTabPanel(t.key, t.slug, i === 0)).join('\n\n');

  const panelsJsMap = TAB_ORDER.map((t) => `    '${t.slug}': document.getElementById('tab-${t.slug}'),`).join('\n');

  const bodyHtml = `<body>

${heroHtml}

${navHtml}

  <main>
    <div class="wrap">

${panelsHtml}

    </div>
  </main>

  <footer>
    <div class="wrap">${escapeHtml(data.footer)}</div>
  </footer>

<script>
  const buttons = document.querySelectorAll('.tab-btn');
  const panels = {
${panelsJsMap}
  };
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      Object.values(panels).forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      panels[btn.dataset.tab].classList.add('active');
    });
  });
</script>

</body>
</html>
`;

  const html = head + '\n' + bodyHtml;
  fs.writeFileSync(path.join(ROOT, 'index.html'), html);
  console.log('Built index.html from content/portfolio.json');
}

build();
