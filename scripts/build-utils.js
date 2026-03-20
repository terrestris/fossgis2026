/**
 * Utility functions for HTML building
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Escapes HTML special characters to prevent XSS
 * @param {string|null|undefined} text - Text to escape (coerced to string)
 * @returns {string} Escaped text with HTML entities
 */
export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return (text ?? '').toString().replace(/[&<>"']/g, char => map[char]);
}

/**
 * Validates that a URL uses HTTP/HTTPS protocol (strict, for HTML links)
 * Only allows http:// and https:// URLs using robust URL parsing
 * @param {string|null|undefined} url - URL to validate
 * @returns {boolean} True if URL uses http/https, false otherwise
 */
function isHttpUrl(url) {
  if (url == null) {
    return false;
  }
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates that a URL is safe for use in CSS url() context
 * Allows http/https URLs, absolute paths (/...), and relative paths (./..., ../..., or simple names)
 * Rejects dangerous protocols like javascript:, data:, file:, etc.
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is safe, false otherwise
 */
function isSafeCssUrl(url) {
  // Reject dangerous protocols
  if (/^(javascript|data|file|vbscript|about):/i.test(url)) {
    return false;
  }
  // Allow http/https URLs
  if (/^https?:\/\//.test(url)) {
    return true;
  }
  // Allow absolute paths (/...)
  if (/^\//.test(url)) {
    return true;
  }
  // Allow relative paths (./, ../, or simple relative paths without colons)
  if (/^[a-zA-Z0-9_\-./~]+$/.test(url)) {
    return true;
  }
  return false;
}

/**
 * Escapes a URL for safe use in CSS url() context
 * Validates the URL is safe (http/https, absolute, or relative paths), strips control characters, and escapes quotes/backslashes
 * @param {string} url - URL to escape for CSS
 * @returns {string} CSS-safe URL string with control characters removed and quotes/backslashes escaped
 * @throws {Error} If URL uses a dangerous protocol or malformed
 */
function escapeCssUrl(url) {
  if (!isSafeCssUrl(url)) {
    throw new Error(`Invalid URL in CSS context: "${url}" (allowed: http/https URLs, absolute paths (/...), or relative paths)`);
  }
  // Strip control characters that can break CSS strings (\n, \r, \f)
  const sanitizedUrl = url.replace(/[\n\r\f]/g, '');
  // Escape backslashes and quotes for CSS string context
  return sanitizedUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Generates a single event list item HTML element
 * @param {Object} item - Event item object with title, link, authors, date, time, location
 * @returns {string} HTML string for the list item
 */
export function generateItem(item) {
  const titleContent = isHttpUrl(item.link)
    ? `<a class="title" href="${escapeHtml(item.link)}">${escapeHtml(item.title)}</a>`
    : `<span class="title">${escapeHtml(item.title)}</span>`;

  return `    <li>
      ${titleContent}
      <span class="authors" title="Autor:in/Autor:innen">
        ${escapeHtml(item.authors)}
      </span>
      <span class="date" title="Datum">
        ${escapeHtml(item.date)}
      </span>
      <span class="time" title="Uhrzeit">
        ${escapeHtml(item.time)}
      </span>
      <span class="location" title="Ort/Hörsaal/Raum">
        ${escapeHtml(item.location)}
      </span>
      <a href="https://www.terrestris.de" title="Zur terrestris Webseite">
        <img src="/img/terrestris.svg" alt="Logo von terrestris">
      </a>
    </li>`;
}

/**
 * Generates complete HTML document from config
 * @param {Object} config - Configuration object with conference, backgroundImage, talks, workshops, videoLink, ogImage
 * @returns {string} Complete HTML document string
 * @throws {Error} If backgroundImage.source uses an invalid URL scheme (must be http/https)
 */
export function generateHtmlDocument(config) {
  const { conference, backgroundImage, talks, workshops, videoLink, ogImage } = config;

  // type (string) validated by validateConfig; URL scheme (http/https) validated here
  if (!isHttpUrl(backgroundImage.source)) {
    throw new Error(`Invalid backgroundImage.source URL (must be http/https): ${backgroundImage.source}`);
  }

  const talksHtml = talks.map(generateItem).join('\n\n');
  const workshopsHtml = workshops.map(generateItem).join('\n\n');

  // Build video link section
  let videoSection = '';
  if (videoLink && videoLink.enabled) {
    videoSection = `  <p>
    <a href="https://media.ccc.de/c/fossgis${conference.year}">Videoseite mit Aufzeichnungen</a> aller Vorträge (thx <a
      href="https://c3voc.de/">C3voc</a> vom <a href="https://ccc.de/">CCC</a>)
  </p>\n`;
  } else if (videoLink) {
    videoSection = `  <!-- <p>
    <a href="https://media.ccc.de/c/fossgis${conference.year}">Videoseite mit Aufzeichnungen</a> aller Vorträge (thx <a
      href="https://c3voc.de/">C3voc</a> vom <a href="https://ccc.de/">CCC</a>)
  </p> -->\n`;
  }

  // Load and render template
  const templatePath = join(__dirname, '..', 'index.tpl.html');
  const template = fs.readFileSync(templatePath, 'utf8');
  const metaDescription = `Auflistung der Veranstaltungen der ${conference.name} ${conference.year} mit Beteiligung von terrestris`;
  // ogImage may contain {{CONFERENCE_YEAR}} as a literal token (e.g. for per-year asset URLs);
  // substitute it here before the main template loop so it resolves correctly.
  const ogImageUrl = ogImage.includes('{{CONFERENCE_YEAR}}')
    ? ogImage.replaceAll('{{CONFERENCE_YEAR}}', conference.year)
    : ogImage;

  const placeholders = {
    '{{CONFERENCE_NAME}}': escapeHtml(conference.name),
    '{{CONFERENCE_NAME_UPPER}}': escapeHtml(conference.name.toUpperCase()),
    '{{CONFERENCE_YEAR}}': conference.year.toString(),
    '{{CONFERENCE_LOCATION}}': escapeHtml(conference.location),
    '{{META_DESCRIPTION}}': escapeHtml(metaDescription),
    '{{OG_IMAGE}}': escapeHtml(ogImageUrl),
    '{{BACKGROUND_IMAGE_URL}}': escapeCssUrl(backgroundImage.url),
    '{{BACKGROUND_SOURCE}}': escapeHtml(backgroundImage.source),
    '{{BACKGROUND_SOURCE_LABEL}}': escapeHtml(backgroundImage.sourceLabel),
    '{{TALKS_HTML}}': talksHtml,
    '{{WORKSHOPS_HTML}}': workshopsHtml,
    '{{VIDEO_SECTION}}': videoSection
  };

  // Replace placeholders in order. Assumption: placeholder values do not contain other placeholders
  // (Safe due to maintainer-controlled config.json, but architectural assumption to document)
  let html = template;
  for (const [placeholder, value] of Object.entries(placeholders)) {
    html = html.replaceAll(placeholder, value);
  }

  return html;
}
