import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const publicFiles = ['index.html', 'README.md', '数据检查与指标口径.md', '经营分析与下周安排.md'];

export async function validate(directory = path.join(root, 'public', 'douyin-daily')) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const actual = entries.map(x => x.name).filter(x => x !== '.nojekyll').sort();
  if (entries.some(x => !x.isFile() || x.isSymbolicLink())) throw new Error('Static output may contain only ordinary allowlisted files.');
  if (JSON.stringify(actual) !== JSON.stringify([...publicFiles].sort())) throw new Error('Unexpected or missing file in static deployment directory.');
  const html = await fs.readFile(path.join(directory, 'index.html'), 'utf8');
  const dataMatch = html.match(/<script id="dashboard-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!dataMatch) throw new Error('Dashboard JSON entry is missing.');
  const data = JSON.parse(dataMatch[1]);
  if (data.sharing_mode !== 'public_aggregates_only') throw new Error('Only the sanitized aggregate dashboard can be deployed.');
  const expectedEvidenceKeys = ['核验说明'];
  for (const record of data.evidence) {
    if (JSON.stringify(Object.keys(record.values).sort()) !== JSON.stringify(expectedEvidenceKeys)) throw new Error('Individual order data found in shared evidence.');
  }
  if (data.quality.repeated_event_groups_weekend.some(x => Object.hasOwn(x, 'order_id'))) throw new Error('Private order identifiers found.');
  const liveIds = new Set(data.sessions.map(x => x.id));
  for (const match of html.matchAll(/(?<![A-Za-z0-9])\d{19,}(?![A-Za-z0-9])/g)) {
    if (!liveIds.has(match[0])) throw new Error('Unexpected long identifier; review for order or customer data.');
  }
  if (/[A-Za-z]:[\\/]/.test(html) || /file:\/\//i.test(html)) throw new Error('Local filesystem path found.');
  if (/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(html)) throw new Error('Possible secret found.');
  if (/<base\b/i.test(html)) throw new Error('A base tag can break repository-subpath hosting.');
  let scripts = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type="application\/json"/.test(match[1])) continue;
    new vm.Script(match[2], { filename: 'dashboard-inline.js' });
    scripts++;
  }
  const base = new URL('https://example.github.io/repository-subpath-check/');
  const resolved = [];
  for (const match of html.matchAll(/\b(?:href|src|poster)\s*=\s*["']([^"']*)["']/g)) {
    const ref = match[1];
    if (!ref || ref.startsWith('#')) continue;
    if (/^(?:https?:|mailto:|tel:|data:|blob:)/i.test(ref)) continue;
    if (ref.startsWith('/') || ref.startsWith('\\')) throw new Error(`Root-relative resource breaks project Pages hosting: ${ref}`);
    const url = new URL(ref, base);
    if (!url.pathname.startsWith(base.pathname)) throw new Error(`Resource leaves the repository subpath: ${ref}`);
    const relative = decodeURIComponent(url.pathname.slice(base.pathname.length));
    if (!publicFiles.includes(relative)) throw new Error(`Referenced file is not in the static artifact: ${ref}`);
    await fs.access(path.join(directory, relative));
    resolved.push({ reference: ref, simulated_url: url.href });
  }
  for (const match of html.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
    if (match[1].startsWith('/')) throw new Error('Root-relative CSS asset found.');
  }
  const sources = [];
  for (const name of publicFiles) {
    const bytes = await fs.readFile(path.join(directory, name));
    if (name !== 'index.html' && (/[A-Za-z]:[\\/]/.test(bytes.toString('utf8')) || /file:\/\//i.test(bytes.toString('utf8')))) throw new Error(`Local path in ${name}`);
    sources.push({ file: name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  return { status: 'passed', framework: 'buildless HTML/CSS/JavaScript', entry: 'index.html', inline_scripts_checked: scripts, repository_subpath: 'passed', privacy: 'passed', resource_links: resolved, files: sources };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await validate(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(JSON.stringify(report, null, 2));
}
