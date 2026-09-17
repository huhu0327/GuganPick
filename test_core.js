"use strict";

const assert = require("node:assert/strict");
const core = require("./core.js");

assert.equal(core.parseTime("03:23"), 203);
assert.equal(core.parseTime("01:03:23"), 3803);
assert.equal(core.parseTime("03:99"), null);
assert.deepEqual(core.parseRange("추천 03:23 ~ 04:00 구간"), { start: 203, end: 240 });
assert.equal(core.parseRange("04:00 ~ 03:23"), null);
assert.equal(core.hasRangeSyntax("04:00 ~ 03:23"), true);
assert.equal(core.hasRangeSyntax("시간 없음"), false);

const catchUrl = core.parseSoopUrl("https://vod.sooplive.com/player/207345179/catch");
assert.equal(catchUrl.videoKey, "207345179/catch");
assert.equal(catchUrl.start, null);

const startUrl = core.parseSoopUrl("https://vod.sooplive.co.kr/player/207332157?change_second=11");
assert.equal(startUrl.videoKey, "207332157");
assert.equal(startUrl.start, 11);
assert.equal(core.parseSoopUrl("https://vod.sooplive.com.evil.test/player/1"), null);
assert.equal(core.parseSoopUrl("https://vod.sooplive.com/not-player/1"), null);

const extracted = core.extractSoopUrls("링크 https://vod.sooplive.com/player/123, 그리고 https://example.com/player/1");
assert.equal(extracted.length, 1);
assert.equal(extracted[0].videoKey, "123");
assert.equal(core.itemKey({ videoKey: "123", start: 10, end: 20 }), "123|10|20");
assert.equal(core.itemKey({ videoKey: "123", start: 20, end: 30 }), "123|20|30");

console.log("core tests passed");
