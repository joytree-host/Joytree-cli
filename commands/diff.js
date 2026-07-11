'use strict';

const { api } = require('../lib/api');
const ui      = require('../lib/ui');
const migrate = require('./migrate');

// Reuses the exact same interactive source-picker and --flags parser the
// `migrate` command already has (JoyTree DB / MongoDB / Firebase / SQL /
// Redis) -- a diff source is described identically to a migration source,
// so there's no reason to have two separate pickers or two separate sets
// of flags for the same five source kinds.

function remapFlags(opts, side) {
  // Turns --a-source-kind/--a-database-id/etc. (or --b-*) into the plain
  // { sourceKind, sourceDatabaseId, ... } shape migrate.buildSourceFromFlags
  // already expects, so that function can be reused as-is for either side.
  const p = side === 'A' ? 'a' : 'b';
  return {
    sourceKind:       opts[`${p}SourceKind`],
    sourceDatabaseId: opts[`${p}DatabaseId`],
    connectionString: opts[`${p}ConnectionString`],
    sqlEngine:        opts[`${p}SqlEngine`],
    firebaseUrl:      opts[`${p}FirebaseUrl`],
    firebaseSecret:   opts[`${p}FirebaseSecret`],
  };
}

async function buildBothSources(opts) {
  if (opts.aSourceKind || opts.bSourceKind) {
    if (!opts.aSourceKind || !opts.bSourceKind) {
      throw new Error('Both --a-source-kind and --b-source-kind are required when using flags instead of the interactive wizard.');
    }
    return [migrate.buildSourceFromFlags(remapFlags(opts, 'A')), migrate.buildSourceFromFlags(remapFlags(opts, 'B'))];
  }
  ui.info('Database A:');
  const sourceA = await migrate.buildSourceInteractive();
  ui.info('Database B:');
  const sourceB = await migrate.buildSourceInteractive();
  return [sourceA, sourceB];
}

function fmtVal(v) {
  if (v === null || v === undefined) return `${ui.c.dim}null${ui.c.reset}`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function printReport(report) {
  const s = report.summary;
  console.log('');
  ui.header('Comparison result');
  console.log(
    `  ${ui.c.green}+${s.rowsAdded} added${ui.c.reset}   ` +
    `${ui.c.red}-${s.rowsRemoved} removed${ui.c.reset}   ` +
    `${ui.c.yellow}~${s.rowsChanged} changed${ui.c.reset}   ` +
    `${ui.c.dim}${s.rowsUnchanged} unchanged${ui.c.reset}`
  );

  if (report.collectionsOnlyInA.length) {
    ui.warn(`Only in Database A: ${report.collectionsOnlyInA.join(', ')}`);
  }
  if (report.collectionsOnlyInB.length) {
    ui.warn(`Only in Database B: ${report.collectionsOnlyInB.join(', ')}`);
  }
  if (!report.collections.length) {
    ui.info('No collections exist on both sides to compare.');
    return;
  }

  for (const col of report.collections) {
    const hasDiff = col.addedCount || col.removedCount || col.changedCount;
    console.log(`\n  ${ui.c.bold}${col.name}${ui.c.reset}${hasDiff ? '' : ` ${ui.c.dim}(identical, ${col.unchangedCount} row(s))${ui.c.reset}`}`);
    for (const c of col.changed) {
      console.log(`    ${ui.c.yellow}~${ui.c.reset} ${c.identity}`);
      for (const fc of c.fieldChanges) {
        console.log(`        ${ui.c.dim}${fc.field}:${ui.c.reset} ${ui.c.red}${fmtVal(fc.before)}${ui.c.reset} -> ${ui.c.green}${fmtVal(fc.after)}${ui.c.reset}`);
      }
    }
    for (const r of col.added) console.log(`    ${ui.c.green}+${ui.c.reset} ${JSON.stringify(r)}`);
    for (const r of col.removed) console.log(`    ${ui.c.red}-${ui.c.reset} ${JSON.stringify(r)}`);
    const shownAdded = col.added.length, shownRemoved = col.removed.length, shownChanged = col.changed.length;
    if (col.addedCount > shownAdded || col.removedCount > shownRemoved || col.changedCount > shownChanged) {
      console.log(`    ${ui.c.dim}... showing up to 200 example rows per bucket; counts above are exact${ui.c.reset}`);
    }
  }
  console.log('');
}

async function run(opts) {
  let sourceA, sourceB;
  try {
    [sourceA, sourceB] = await buildBothSources(opts);
  } catch (err) {
    ui.error(err.message);
    process.exit(1);
  }

  const spin = ui.spinner('Comparing databases');
  try {
    const data = await api.post('/api/databases/diff', { sourceA, sourceB });
    spin.stop('Comparison complete.');
    if (opts.json) {
      console.log(JSON.stringify(data.report, null, 2));
    } else {
      printReport(data.report);
    }
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { run };
