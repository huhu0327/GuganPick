"use strict";

const assert = require("node:assert/strict");
const settings = require("./settings.js");

assert.deepEqual(settings.normalize(), settings.DEFAULTS);
assert.equal(settings.normalize().autoPlayFirst, true);
assert.equal(settings.normalize({ autoPlayFirst: true }).autoPlayFirst, true);
assert.equal(settings.normalize({ scanScope: "invalid" }).scanScope, "both");
assert.equal(settings.normalize().pauseAtEnd, true);
assert.equal(settings.normalize({ pauseAtEnd: true }).pauseAtEnd, true);
assert.equal(settings.normalize({ pauseAtLast: false }).pauseAtLast, false);
assert.equal(settings.stopAt({ pauseAtEnd: true, pauseAtLast: false }, 10, 15), 10);
assert.equal(settings.stopAt({ pauseAtEnd: false, pauseAtLast: true }, 10, 15), 15);
assert.equal(settings.stopAt({ pauseAtEnd: false, pauseAtLast: false }, 10, 15), null);
assert.equal(settings.stopAt({ autoAdvance: true, pauseAtEnd: false, pauseAtLast: false }, 10, 15), null);

console.log("settings tests passed");
