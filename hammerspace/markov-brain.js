/*!
**|   PonkBot Markov Brain
**|   Shared by hammerspace/markov-build.js (bulk training) and
**|   hammerspace/markov.js (live learning + replies) so training, seeding
**|   and live growth all see identical raw words: no tags, no team color
**|   spans, no image/URL junk — but board tags like /sp/ or [r9k], which
**|   this channel treats as team names, are kept.
**@
*/

'use strict';

const CHAIN_LENGTH = 2;
const STOP = '\u2403'; // ␃ end-of-message marker, as dagbot
const START = '\u2402'; // ␂ pads one-word team tag messages into bigrams
const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const URL_TOKEN = /^(?:https?:\/\/|www\.)\S*$|\.(?:png|jpe?g|gif|webm|mp4)$/i;
// Team names: board tags (/sp/, /g/, /k/, /@/, /mlp/, /kirara/) incl. japanese,
// and bracket tags ([r9k], [s4s]).
const TEAM_TOKEN = /^\/[\w@ぁ-ゖァ-ヺ一-龯]+\/$|^\[[\w@ぁ-ゖァ-ヺ一-龯]+\]$/;

// Order matters: markdown images first, hidden spans with content, then
// remaining tags, then entity decode, then leftover team color markers.
function cleanMessage(raw) {
    return raw
        .replace(MARKDOWN_IMAGE, '')
        .replace(/<span[^>]*display:\s*none[^>]*>[\s\S]*?<\/span>/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/-team[a-zA-Z0-9]*-/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(raw) {
    return cleanMessage(raw)
        .split(' ')
        .filter((word) => word && !URL_TOKEN.test(word));
}

// A lone team tag ("/sp/") is a full message in this channel: keep it by
// padding with START/STOP into a one-entry bigram.
function isTrainable(words) {
    return words.length >= CHAIN_LENGTH ||
        (words.length === 1 && TEAM_TOKEN.test(words[0]));
}

function firstBigram(words) {
    return words.length === 1 ? START + ' ' + words[0] : words[0] + ' ' + words[1];
}

// Yields [key, next word] pairs. Bigram keys use the full "w1 w2" context;
// single-word keys carry the same trailing transition as an order-1 backoff,
// marked with '\u0001' so the walk can fall back when the bigram is missing.
const UNIGRAM_MARK = '\u0001';

function* transitions(words) {
    if (words.length === 1) {
        yield [START + ' ' + words[0], STOP];
        return;
    }
    for (let i = 0; i + 1 < words.length; i++) {
        const key = words[i] + ' ' + words[i + 1];
        const next = i + 2 < words.length ? words[i + 2] : STOP;
        yield [key, next];
        yield [UNIGRAM_MARK + words[i + 1], next];
    }
}

// Sentinels are chain plumbing, never chat text.
function stripSentinels(text) {
    return text.replace(/[␂␃]/g, '').trim();
}

module.exports = {
    CHAIN_LENGTH, STOP, START, UNIGRAM_MARK, TEAM_TOKEN,
    cleanMessage, tokenize, isTrainable, firstBigram, transitions, stripSentinels
};
