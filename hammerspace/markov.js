/*!
**|   PonkBot Markov Replier
**|   Randomly replies with a sentence walked from the order-2 chain built
**|   by hammerspace/markov-build.js. Deliberately less likely than buttbot
**|   (half its base probability) with its own cooldown. Seeded by words
**|   from the message that triggered it, falling back to a random start,
**|   the same way dagbot picks its seed.
**|
**|   Every chat line the bot sees also teaches the chain live, so replies
**|   reference new topics, not just the trained backlog.
**@
*/

'use strict';

const { CHAIN_LENGTH, STOP, START, tokenize, isTrainable, firstBigram, transitions, stripSentinels } = require('./markov-brain.js');

module.exports = {
    name: 'markov',
    init: (ponk) => {
        const knex = ponk.db.knex;
        const BASE_PROBABILITY = 0.0075; // buttbot is 0.015; this fires about half as often
        const TARGET_USERS = 55;
        const COOLDOWN = 90 * 1000;
        const COMMAND_COOLDOWN = 5 * 1000;
        const MAX_WORDS = 40;
        const MIN_WORDS = 6; // chains dead-end often; retry until worth reading
        const MAX_ATTEMPTS = 4;

        const countWords = (text) => text ? text.split(' ').filter(Boolean).length : 0;

        // Walks from sparse order-2 chains die fast; try a few seeds and
        // keep the best reply instead of shipping the first 2-word corpse.
        async function replyFrom(words) {
            let best = '';
            for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                const seed = await seedFrom(words);
                if (!seed) break;
                const reply = await generate(seed);
                if (countWords(reply) > countWords(best)) best = reply;
                if (countWords(reply) >= MIN_WORDS) return reply;
            }
            return best;
        }

        let ready = false;
        let maxStartId = 0;
        let lastReplyTime = 0;
        let lastCommandTime = 0;
        let learning = Promise.resolve(); // serializes writes so counts never lose updates

        function pickWeighted(counts) {
            let roll = Math.random() * Object.values(counts).reduce((a, b) => a + b, 0);
            for (const [word, count] of Object.entries(counts)) {
                roll -= count;
                if (roll <= 0) return word;
            }
            return Object.keys(counts).pop(); // float epsilon escape hatch
        }

        async function getChain(key) {
            const row = await knex('markov').where('chain', key).select('nexts').first();
            return row && JSON.parse(row.nexts);
        }

        async function generate(seedWords) {
            const out = seedWords.slice();
            for (let words = 0; words < MAX_WORDS; words++) {
                const counts = await getChain(out.slice(-CHAIN_LENGTH).join(' '));
                if (!counts) break;
                const next = pickWeighted(counts);
                if (next === STOP) break;
                out.push(next);
            }
            return stripSentinels(out.join(' '));
        }

        async function randomStart() {
            for (let attempt = 0; attempt < 3 && maxStartId; attempt++) {
                const row = await knex('starts')
                    .where('id', 1 + Math.floor(Math.random() * maxStartId))
                    .select('bigram').first();
                if (row) return row.bigram.split(' ');
            }
            return null;
        }

        async function seedFrom(words) {
            if (words.length === 1) {
                const solo = START + ' ' + words[0]; // lone team tag like /mlp/
                if (await getChain(solo)) return solo.split(' ');
            }
            for (let tries = Math.min(5, words.length - 1); tries > 0; tries--) {
                const idx = Math.floor(Math.random() * (words.length - 1));
                const key = words[idx] + ' ' + words[idx + 1];
                if (await getChain(key)) return key.split(' ');
            }
            return randomStart();
        }

        function learn(words) {
            learning = learning.then(async () => {
                const [startId] = await knex('starts')
                    .insert({ bigram: firstBigram(words) })
                    .onConflict('bigram').ignore();
                if (startId > maxStartId) maxStartId = startId;

                for (const [key, next] of transitions(words)) {
                    const counts = (await getChain(key)) || {};
                    counts[next] = (counts[next] || 0) + 1;
                    await knex('markov')
                        .insert({ chain: key, nexts: JSON.stringify(counts) })
                        .onConflict('chain').merge();
                }
            }).catch((error) => ponk.logger.error('[Markov] Learn failed:', error));
        }

        knex.schema.hasTable('markov').then((hasTable) => {
            if (!hasTable) {
                return ponk.logger.error('[Markov] No markov table; run node hammerspace/markov-build.js');
            }
            return knex('starts').max('id as max').first().then((row) => {
                maxStartId = (row && row.max) || 0;
                ready = true;
                ponk.logger.log('[Markov] Brain ready.');
            });
        }).catch((error) => ponk.logger.error('[Markov] Load failed:', error));

        ponk.on('message', async ({ user, message }) => {
            if (!ready || ponk.bots.includes(user)) return;
            if (ponk.commands.trigger.test(ponk.filterChat(message))) return; // commands dispatch elsewhere

            const words = tokenize(message);
            if (isTrainable(words)) learn(words);

            if (Date.now() - lastReplyTime < COOLDOWN) return;

            const actualUsers = ponk.userlist.length || 1;
            if (Math.random() >= BASE_PROBABILITY * (TARGET_USERS / actualUsers)) return;

            const reply = await replyFrom(words);
            if (!reply.trim()) return;

            lastReplyTime = Date.now();
            ponk.sendMessage(reply);
        });

        ponk.registerCommands({
            handlers: {
                markov: async function (user, params) {
                    if (!ready) {
                        return this.sendMessage('[Markov] Brain not built yet.');
                    }
                    this.checkPermission({ user, rank: 3 }).then(async () => {
                        if (Date.now() - lastCommandTime < COMMAND_COOLDOWN) return;
                        lastCommandTime = Date.now();

                        const words = tokenize(params);
                        const reply = await replyFrom(words);
                        if (!reply.trim()) {
                            return this.sendMessage('[Markov] Nothing to walk from.');
                        }
                        this.sendMessage(reply);
                    }).catch((error) => this.sendPrivate(error, user));
                }
            },
            helpdata: {
                markov: {
                    synop: 'Says something Markov-generated from the chat history. ' +
                        'Admins only; optional words steer the seed.'
                }
            }
        });
    }
};
