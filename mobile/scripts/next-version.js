/**
 * Picks the version for an automatic Android release and writes it into app.json (CI only, not committed).
 * - If app.json already has a version newer than every vX.Y.Z tag, that version is used (you bumped it by hand).
 * - Otherwise the newest tag's patch number goes up by one (2.0.2 → 2.0.3).
 * Prints the version; also writes version=… to $GITHUB_OUTPUT when run in GitHub Actions.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const parse = (v) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null);
const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

const appJsonPath = path.join(__dirname, '..', 'app.json');
const app = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const current = parse(app.expo.version) || [1, 0, 0];

let tags = [];
try { tags = execSync('git tag -l "v*"', { encoding: 'utf8' }).split('\n').map((t) => parse(t.trim().replace(/^v/, ''))).filter(Boolean); } catch { /* no git */ }
const newestTag = tags.sort(cmp).at(-1);

let next = current;
if (newestTag && cmp(current, newestTag) <= 0) next = [newestTag[0], newestTag[1], newestTag[2] + 1];
const version = next.join('.');

app.expo.version = version;
fs.writeFileSync(appJsonPath, JSON.stringify(app, null, 2) + '\n');
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
console.log(version);
