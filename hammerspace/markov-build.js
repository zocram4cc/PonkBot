/*!
**|   PonkBot Markov Brain Builder
**@
**   Streams a PonkBot chat.log (JSONL) and builds the order-2 word chain
**   consumed by hammerspace/markov.js. Never loads the log into memory:
**   per-line parse, fixed-size batches, merge-upsert into ponkbot.db.
**
**   Usage: node hammerspace/markov-build.js [dbPath] [logPath] [--bots a,b]
*/

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const sqlite3 = require('sqlite3');
const { tokenize, isTrainable, firstBigram, transitions } = require('./markov-brain.js');

const BATCH_LINES = 50000; // ponytail: ~0.5s write txn so readers only wait briefly; raise when 2GB+ RAM
const SELECT_CHUNK = 400;

const args = [];
const flags = {};
for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) flags[arg.slice(2)] = true;
    else args.push(arg);
}

const dbPath = args[0] || './ponkbot.db';
const logPath = args[1] || './chat.log';

let peers = [];
let trigger = /^\.|^\!/;
try {
    const config = require(path.join(process.cwd(), 'config.js'));
    peers = config.peers || [];
    if (config.commands && config.commands.trigger) trigger = config.commands.trigger;
    if (config.user) peers.push(config.user);
} catch (e) {
    console.warn('No readable config.js; skipping default bot filter.');
}
if (flags.bots) peers.push(...flags.bots.split(','));
const skipUsers = new Set(peers.filter(Boolean));

function learn(words, chains, starts) {
    starts.set(firstBigram(words), true);
    for (const [key, next] of transitions(words)) {
        let bag = chains.get(key);
        if (!bag) { bag = new Map(); chains.set(key, bag); }
        bag.set(next, (bag.get(next) || 0) + 1);
    }
}

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, (err) => err ? reject(err) : resolve());
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

async function flush(chains, starts) {
    await dbRun('BEGIN IMMEDIATE');
    try {
        // Merge with rows already in the table so cross-batch keys keep counts.
        const keys = [...chains.keys()];
        for (let i = 0; i < keys.length; i += SELECT_CHUNK) {
            const chunk = keys.slice(i, i + SELECT_CHUNK);
            const rows = await dbAll(
                `SELECT chain, nexts FROM markov WHERE chain IN (${chunk.map(() => '?').join(',')})`,
                chunk
            );
            for (const row of rows) {
                const bag = chains.get(row.chain);
                for (const [word, count] of Object.entries(JSON.parse(row.nexts))) {
                    bag.set(word, (bag.get(word) || 0) + count);
                }
            }
        }
        const upsert = db.prepare(
            'INSERT INTO markov (chain, nexts) VALUES (?, ?) ' +
            'ON CONFLICT(chain) DO UPDATE SET nexts = excluded.nexts'
        );
        for (const [chain, bag] of chains) {
            await new Promise((resolve, reject) => {
                upsert.run(chain, JSON.stringify(Object.fromEntries(bag)),
                    (err) => err ? reject(err) : resolve());
            });
        }
        const insertStart = db.prepare('INSERT OR IGNORE INTO starts (bigram) VALUES (?)');
        for (const bigram of starts.keys()) {
            await new Promise((resolve, reject) => {
                insertStart.run(bigram, (err) => err ? reject(err) : resolve());
            });
        }
        await dbRun('COMMIT');
    } catch (err) {
        await dbRun('ROLLBACK');
        throw err;
    }
    chains.clear();
    starts.clear();
}

async function main() {
    const db = new sqlite3.Database(dbPath);
    await dbRun('PRAGMA busy_timeout = 30000');
    // Any run writes into an existing ponkbot.db: snapshot it first (safe even
    // while the bot is live, unlike a raw file copy under WAL).
    const backupPath = `${dbPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    if (typeof db.backup === 'function') {
        await new Promise((resolve, reject) => db.backup(backupPath, (err) => err ? reject(err) : resolve()));
    } else if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, backupPath);
    }
    console.log(`Backed up ${dbPath} to ${backupPath}`);
    await dbRun('PRAGMA journal_mode = WAL');
    await dbRun('CREATE TABLE IF NOT EXISTS markov (chain TEXT PRIMARY KEY, nexts TEXT NOT NULL)');
    await dbRun('CREATE TABLE IF NOT EXISTS starts (id INTEGER PRIMARY KEY, bigram TEXT NOT NULL UNIQUE)');

    const stream = fs.createReadStream(logPath);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const chains = new Map();
    const starts = new Map();
    const stats = { lines: 0, trained: 0, skipped: { parse: 0, bot: 0, command: 0, short: 0 } };

    const started = Date.now();
    for await (const line of rl) {
        stats.lines++;
        let entry;
        try {
            entry = JSON.parse(line);
        } catch (e) {
            stats.skipped.parse++;
            continue;
        }
        if (!entry.message || skipUsers.has(entry.user)) { stats.skipped.bot++; continue; }
        if (trigger.test(entry.message)) { stats.skipped.command++; continue; }
        const words = tokenize(entry.message);
        if (!isTrainable(words)) { stats.skipped.short++; continue; }
        learn(words, chains, starts);
        stats.trained++;
        if (stats.lines % BATCH_LINES === 0) {
            const staged = chains.size;
            await flush(chains, starts);
            console.log(`[${stats.lines} lines] ${stats.trained} trained, ${staged} new keys, ${((Date.now() - started) / 1000).toFixed(0)}s`);
        }
    }
    if (chains.size || starts.size) await flush(chains, starts);

    const chainCount = (await dbAll('SELECT COUNT(*) AS rows FROM markov'))[0].rows;
    const startCount = (await dbAll('SELECT COUNT(*) AS rows FROM starts'))[0].rows;
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(0)}s. ` +
        `Trained ${stats.trained}/${stats.lines} lines ` +
        `(skipped: ${JSON.stringify(stats.skipped)}). ` +
        `DB: ${chainCount} chain keys, ${startCount} start bigrams.`);
    db.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
