"use strict";

const assert = require("node:assert/strict");
const core = require("./core.js");

assert.equal(core.parseTime("03:23"), 203);
assert.equal(core.parseTime("01:03:23"), 3803);
assert.equal(core.parseTime("03:99"), null);
assert.deepEqual(core.parseRange("(추천) [ 03:23 ] ~ [ 04:00 ]"), { title: "추천", start: 203, end: 240 });
assert.deepEqual(core.parseRange("(추천) [03:23] ~ [04:00]"), { title: "추천", start: 203, end: 240 });
assert.deepEqual(core.parseRange("[01:03:23] ~ [01:04:00]"), { title: "", start: 3803, end: 3840 });
assert.equal(core.parseRange("[04:00] ~ [03:23]"), null);
assert.equal(core.parseRange("추천 03:23 ~ 04:00 구간"), null);
assert.deepEqual(core.parseRanges("(테스트1) [ 00:01 ] ~ [ 00:10 ]\n(테스트2) [ 00:11 ] ~ [ 00:20 ]"), [
  { title: "테스트1", start: 1, end: 10 },
  { title: "테스트2", start: 11, end: 20 }
]);
assert.deepEqual(core.parseRanges("(오류) [ 00:20 ] ~ [ 00:10 ] (정상) [ 00:01 ] ~ [ 00:02 ]"), [
  { title: "오류", start: null, end: null, error: "시간 형식 또는 시작·종료 순서가 잘못됐습니다." },
  { title: "정상", start: 1, end: 2 }
]);
assert.equal(core.hasRangeSyntax("[04:00] ~ [03:23]"), true);
assert.equal(core.hasRangeSyntax("시간 없음"), false);

const catchUrl = core.parseSoopUrl("https://vod.sooplive.com/player/207345179/catch");
assert.equal(catchUrl.videoKey, "207345179/catch");
assert.equal(catchUrl.start, null);
assert.equal(core.parseSoopUrl("https://vod.sooplive.com/player/207752565/catch").videoKey, "207752565/catch");

const startUrl = core.parseSoopUrl("https://vod.sooplive.co.kr/player/207332157?change_second=11");
assert.equal(startUrl.videoKey, "207332157");
assert.equal(startUrl.start, 11);
assert.equal(core.parseSoopUrl("https://vod.sooplive.com/player/207332157?start=7").start, 7);
assert.equal(core.parseSoopUrl("https://vod.sooplive.com/player/207332157?start=-1").start, null);
assert.equal(core.parseSoopUrl("https://vod.sooplive.com/player/207332157?start=7&change_second=11").start, 11);
assert.equal(core.parseSoopUrl("https://vod.sooplive.com.evil.test/player/1"), null);
assert.equal(core.parseSoopUrl("https://vod.sooplive.com/not-player/1"), null);

const extracted = core.extractSoopUrls("링크 https://vod.sooplive.com/player/123, 그리고 https://example.com/player/1");
assert.equal(extracted.length, 1);
assert.equal(extracted[0].videoKey, "123");
assert.equal(core.itemKey({ videoKey: "123", start: 10, end: 20 }), "123|10|20");
assert.equal(core.itemKey({ videoKey: "123", start: 20, end: 30 }), "123|20|30");
assert.equal(core.sameSoopAuthor({ id: "ndr0271", name: "a후후" }, "a후후 ( ndr0271 )"), true);
assert.equal(core.sameSoopAuthor({ id: "NDR0271", name: "a후후" }, "a후후 (ndr0271)"), true);
assert.equal(core.sameSoopAuthor({ id: "other", name: "a후후" }, "a후후 (ndr0271)"), false);
assert.equal(core.sameSoopAuthor({ id: "ndr0271", name: " a후후 " }, "a후후"), true);
assert.equal(core.sameSoopAuthor({ id: "ndr0271", name: "a후후" }, ""), false);
assert.equal(core.hasWatchedMarker("(구간) [00:01] ~ [00:10] [봤]"), true);
assert.equal(core.hasWatchedMarker("[봤]"), true);
assert.deepEqual(core.parseRanges("[봤]"), []);
assert.equal(core.hasWatchedMarker("(구간) [00:01] ~ [00:10]"), false);

const playableEntries = [
  { index: 2, item: { start: 1, end: 10, status: "waiting" } },
  { index: 4, item: { start: 11, end: 20, status: "error" } },
  { index: 7, item: { start: 21, end: 30, status: "waiting" } }
];
assert.equal(core.nextPlayableIndex(playableEntries, 2), 7);
assert.equal(core.nextPlayableIndex(playableEntries, 7), -1);

const ranges = [
  { videoKey: "123", start: 1, end: 10, status: "waiting" },
  { videoKey: "123", start: 5, end: 15, status: "waiting" },
  { videoKey: "456", start: 1, end: 10, status: "waiting" }
];
assert.equal(core.activeRangeIndex(ranges, 6, -1, "123"), 0);
assert.equal(core.activeRangeIndex(ranges, 6, 1, "123"), 1);
assert.equal(core.activeRangeIndex(ranges, 10, 0, "123"), 1);
assert.equal(core.activeRangeIndex(ranges, 15, 1, "123"), -1);
assert.equal(core.activeRangeIndex([{ videoKey: "123", start: 1, end: 10, status: "completed" }], 12, 0, "123"), 0);
assert.equal(core.activeRangeIndex([
  { videoKey: "123", start: 7, end: 10, status: "completed" },
  { videoKey: "123", start: 10, end: 15, status: "waiting" }
], 10, 0, "123"), 0);
assert.equal(core.activeRangeIndex([{ videoKey: "123", start: 1, end: 10, status: "error" }], 5, 0, "123"), -1);

console.log("core tests passed");
