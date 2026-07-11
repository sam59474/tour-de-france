#!/usr/bin/env node
/**
 * parse-stage.mjs
 *
 * Process a single stage:
 *   node scripts/parse-stage.mjs <stage-number> <path-to-results-txt>
 *   node scripts/parse-stage.mjs 3 public/data/stages/stage-03.txt
 *
 * Process all available (non-empty) stage files automatically:
 *   node scripts/parse-stage.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Load shared data ──────────────────────────────────────────────────────────
const stagesPath = resolve(ROOT, 'public/data/stages.json');
const teamsPath  = resolve(ROOT, 'public/data/teams.json');
const stagesData = JSON.parse(readFileSync(stagesPath, 'utf8'));
const teamsData  = JSON.parse(readFileSync(teamsPath, 'utf8'));

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalise(str) {
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s\-]/g, '')
    .trim();
}

function extractLastName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return normalise(parts.slice(1).join(' '));
}

function getEffectiveRoster(team, stageNum) {
  let coequipiers = [...team.coequipiers];
  let elite = team.elite;
  let capitaine = team.capitaine;
  for (const ov of (team.stageOverrides ?? [])) {
    if (ov.stages.includes(stageNum)) {
      if (ov.coequipiers) coequipiers = [...ov.coequipiers];
      if (ov.elite !== undefined) elite = ov.elite;
      if (ov.capitaine !== undefined) capitaine = ov.capitaine;
    }
  }
  // Filter out nulls, undefineds, and empty strings
  return [elite, capitaine, ...coequipiers].filter(c => c != null && c !== '');
}

function parseResultsTxt(txtContent) {
  const positionMap = new Map();
  const rawLines = txtContent.split('\n');
  let idx = 0;

  while (idx < rawLines.length) {
    const line = rawLines[idx].trim();
    const posMatch = line.match(/^(\d+)\t?(.*)/);

    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const nameOnPosLine = posMatch[2].trim();
      let initial = null;
      let lastName = null;

      // Look ahead up to 5 lines for the abbreviated name "I. LASTNAME"
      for (let j = idx + 1; j < Math.min(idx + 6, rawLines.length); j++) {
        const next = rawLines[j].trim();
        if (!next) continue;
        if (/\d+h\s+\d+/.test(next)) break; // time line — stop

        const abbrevMatch = next.match(/^([A-Z])\.(?:[A-Z]\.)?\s+(.+)$/);
        if (abbrevMatch) {
          initial = abbrevMatch[1];
          lastName = abbrevMatch[2].trim();
          break;
        }
      }

      // Fallback: extract ALLCAPS tokens from the position line itself
      if (!lastName && nameOnPosLine) {
        const tokens = nameOnPosLine.split(/\s+/);
        const caps = tokens.filter(t =>
          /^[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜ][A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜ\-]{1,}$/.test(t)
        );
        if (caps.length) lastName = caps.join(' ');
      }

      if (lastName) {
        const key = normalise(lastName);
        const keyWithInitial = initial ? `${initial} ${key}` : null;
        if (!positionMap.has(key)) positionMap.set(key, pos);
        if (keyWithInitial) positionMap.set(keyWithInitial, pos);
      }
    }
    idx++;
  }
  return positionMap;
}

function matchCyclists(allCyclists, positionMap) {
  const results = [];
  const unmatched = [];

  for (const cyclist of allCyclists) {
    // Guard against any null/non-string values that slipped through
    if (!cyclist || typeof cyclist !== 'string') {
      console.warn(`  ⚠️  Skipping invalid cyclist value: ${JSON.stringify(cyclist)}`);
      continue;
    }

    const lastName = extractLastName(cyclist);
    const firstInitial = normalise(cyclist.trim()[0]);
    const keyWithInitial = `${firstInitial} ${lastName}`;

    let pos = positionMap.get(keyWithInitial);
    if (pos === undefined) pos = positionMap.get(lastName);

    if (pos === undefined) {
      const words = lastName.split(/\s+/).filter(w => w.length > 3);
      words.sort((a, b) => b.length - a.length);
      for (const word of words) {
        const initWord = `${firstInitial} ${word}`;
        if (positionMap.has(initWord)) { pos = positionMap.get(initWord); break; }
        for (const [k, v] of positionMap) {
          if (k === word || k.endsWith(` ${word}`) || k.startsWith(`${word} `)) {
            const initK = `${firstInitial} ${k.split(' ').pop()}`;
            pos = positionMap.get(initK) ?? v;
            break;
          }
        }
        if (pos !== undefined) break;
      }
    }

    if (pos !== undefined) {
      results.push({ cyclist, position: pos });
    } else {
      unmatched.push(cyclist);
      results.push({ cyclist, position: 9999 });
    }
  }
  return { results, unmatched };
}

function processStage(stageNumber, txtPath) {
  const stage = stagesData.stages.find(s => s.stageNumber === stageNumber);
  if (!stage) {
    console.error(`  ✗ Stage ${stageNumber} not found in stages.json`);
    return false;
  }

  const txtContent = readFileSync(txtPath, 'utf8');
  const periodTeams = teamsData.periods.find(p => p.periodId === stage.periodId)?.teams ?? [];

  const allCyclists = new Set();
  for (const team of periodTeams) {
    for (const c of getEffectiveRoster(team, stageNumber)) allCyclists.add(c);
  }

  const positionMap = parseResultsTxt(txtContent);
  const { results, unmatched } = matchCyclists(allCyclists, positionMap);

  stage.completed = true;
  stage.results = results;

  const matched = results.filter(r => r.position !== 9999);
  console.log(`  Stage ${String(stageNumber).padStart(2, '0')}: ${matched.length}/${allCyclists.size} matched` +
    (unmatched.length ? `  ⚠️  unmatched: ${unmatched.join(', ')}` : '  ✅'));
  return true;
}

// ── Mode: single stage or all ─────────────────────────────────────────────────
const [,, stageArg, txtArg] = process.argv;

if (stageArg && txtArg) {
  // Single stage mode
  const stageNumber = parseInt(stageArg, 10);
  if (isNaN(stageNumber)) { console.error(`Invalid stage number: ${stageArg}`); process.exit(1); }
  console.log(`\nProcessing Stage ${stageNumber}...`);
  processStage(stageNumber, resolve(process.cwd(), txtArg));
  writeFileSync(stagesPath, JSON.stringify(stagesData, null, 2), 'utf8');
  console.log('\n✅ stages.json updated.');

} else {
  // Batch mode — process all non-empty stage files
  const stagesDir = resolve(ROOT, 'public/data/stages');
  const files = readdirSync(stagesDir)
    .filter(f => f.match(/^stage-(\d+)\.txt$/))
    .sort();

  const toProcess = files.filter(f => {
    const size = statSync(join(stagesDir, f)).size;
    return size > 0;
  });

  if (toProcess.length === 0) {
    console.log('No non-empty stage files found in public/data/stages/');
    process.exit(0);
  }

  console.log(`\nProcessing ${toProcess.length} stage file(s)...\n`);

  let count = 0;
  for (const file of toProcess) {
    const match = file.match(/^stage-(\d+)\.txt$/);
    if (!match) continue;
    const stageNumber = parseInt(match[1], 10);
    const ok = processStage(stageNumber, join(stagesDir, file));
    if (ok) count++;
  }

  writeFileSync(stagesPath, JSON.stringify(stagesData, null, 2), 'utf8');
  console.log(`\n✅ stages.json updated — ${count} stage(s) processed.`);
}
