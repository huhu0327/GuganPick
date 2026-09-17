"use strict";

const assert = require("node:assert/strict");
const settings = require("./settings.js");

assert.deepEqual(settings.normalize(), settings.DEFAULTS);
assert.equal(settings.normalize({ scanScope: "invalid" }).scanScope, "both");
assert.equal(settings.endAction({ autoAdvance: false, pauseAtEnd: false }, true), "continue");
assert.equal(settings.endAction({ autoAdvance: false, pauseAtEnd: true }, true), "pause");
assert.equal(settings.endAction({ autoAdvance: true, pauseAtEnd: true }, true), "next");
assert.equal(settings.endAction({ autoAdvance: true, pauseAtEnd: false }, false), "pause");

console.log("settings tests passed");
