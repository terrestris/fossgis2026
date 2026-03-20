#!/usr/bin/env node

import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateHtmlDocument } from './build-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Type-asserting helpers — each throws with a precise field path on mismatch
const assertStr  = (v, p) => { if (typeof v !== 'string' || !v) throw new Error(`config.json: "${p}" must be a non-empty string`); };
const assertYear = (v, p) => { if (!Number.isInteger(v) || !/^\d{4}$/.test(String(v))) throw new Error(`config.json: "${p}" must be a 4-digit integer`); };
const assertBool = (v, p) => { if (typeof v !== 'boolean') throw new Error(`config.json: "${p}" must be a boolean`); };
const assertArr  = (v, p) => { if (!Array.isArray(v)) throw new Error(`config.json: "${p}" must be an array`); };

/**
 * Validate loaded configuration has required fields and correct types.
 * @throws {Error} If any field is missing, has the wrong type, or has an invalid value.
 */
function validateConfig(config) {
  assertStr(config.conference?.name, 'conference.name');
  assertStr(config.conference?.location, 'conference.location');
  assertYear(config.conference?.year, 'conference.year');
  assertStr(config.backgroundImage?.url, 'backgroundImage.url');
  assertStr(config.backgroundImage?.source, 'backgroundImage.source');
  assertStr(config.backgroundImage?.sourceLabel, 'backgroundImage.sourceLabel');
  assertArr(config?.talks, 'talks');
  assertArr(config?.workshops, 'workshops');
  assertStr(config?.ogImage, 'ogImage');
  if (config.videoLink != null) assertBool(config.videoLink.enabled, 'videoLink.enabled');

  // Validate the shape of each talk/workshop item
  const validateItemsArray = (items, key) => {
    items.forEach((item, index) => {
      const basePath = `${key}[${index}]`;
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`config.json: "${basePath}" must be a plain object`);
      }
      assertStr(item.link, `${basePath}.link`);
      assertStr(item.title, `${basePath}.title`);
      assertStr(item.authors, `${basePath}.authors`);
      assertStr(item.date, `${basePath}.date`);
      assertStr(item.time, `${basePath}.time`);
      assertStr(item.location, `${basePath}.location`);
    });
  };

  validateItemsArray(config.talks, 'talks');
  validateItemsArray(config.workshops, 'workshops');
}

/**
 * Load and parse configuration file with validation
 * @returns {Object} Parsed config.json
 * @throws {Error} If config is invalid or file missing
 */
function loadConfig() {
  const configPath = join(projectRoot, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  validateConfig(config);
  return config;
}

/**
 * Write HTML file to disk
 * @param {string} html - HTML content
 */
function writeHtml(html) {
  const outputPath = join(projectRoot, 'index.html');
  fs.writeFileSync(outputPath, html);
}

/**
 * Generate and write index.html from config
 */
function buildHtml() {
  const config = loadConfig();
  const html = generateHtmlDocument(config);
  writeHtml(html);
}

console.log('📝 Generating index.html…');
try {
  buildHtml();
  console.log('✓ index.html generated\n');
} catch (error) {
  console.error('✗ Error generating HTML:', error.message);
  process.exit(1);
}

// Watch mode if --watch flag is passed
const watch = process.argv.includes('--watch');

if (watch) {
  // Sentinel line: dev-start.js detects the substring "Watching" to know the initial build succeeded
  console.log('👀 Watching config.json and index.tpl.html for changes…\n');
  let timeout;
  let configWatcher, templateWatcher;

  const triggerRebuild = (fileName) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      console.log(`\n📝 ${fileName} changed, regenerating index.html…`);
      try {
        buildHtml();
        console.log('✓ index.html regenerated\n');
      } catch (error) {
        console.error('✗ Error generating HTML:', error.message);
      }
    }, 100);
  };

  const configPath = join(projectRoot, 'config.json');
  const templatePath = join(projectRoot, 'index.tpl.html');

  // fs.watch may fire multiple times for a single change; for production, consider chokidar for more reliable event handling
  configWatcher = fs.watch(configPath, { persistent: true }, () => {
    triggerRebuild('config.json');
  });

  templateWatcher = fs.watch(templatePath, { persistent: true }, () => {
    triggerRebuild('index.tpl.html');
  });

  configWatcher.on('error', (error) => {
    console.error('✗ Watch error (config.json):', error.message);
  });

  templateWatcher.on('error', (error) => {
    console.error('✗ Watch error (index.tpl.html):', error.message);
  });

  // Clean up watchers on exit for graceful shutdown
  const cleanup = () => {
    // Guards are defensive; watchers are always set above
    if (configWatcher) configWatcher.close();
    if (templateWatcher) templateWatcher.close();
  };

  const terminateGracefully = () => {
    cleanup();
    process.exit(0);
  };

  process.on('SIGINT', terminateGracefully);
  process.on('SIGTERM', terminateGracefully);
  process.on('exit', cleanup);
}
