import test from "node:test";
import assert from "node:assert/strict";

import { createRequestLog } from "../src/request-log.js";

test("request log keeps newest entries within max size", () => {
  const requestLog = createRequestLog({ maxEntries: 2 });

  requestLog.add({ id: "1", platform: "cdapi" });
  requestLog.add({ id: "2", platform: "ttapi" });
  requestLog.add({ id: "3", platform: "openapi" });

  assert.deepEqual(
    requestLog.list().map((item) => item.id),
    ["3", "2"]
  );
});

test("request log defaults to ten entries", () => {
  const requestLog = createRequestLog();

  for (let index = 1; index <= 12; index += 1) {
    requestLog.add({ id: String(index), platform: "cdapi" });
  }

  assert.equal(requestLog.list().length, 10);
  assert.deepEqual(
    requestLog.list().map((item) => item.id),
    ["12", "11", "10", "9", "8", "7", "6", "5", "4", "3"]
  );
});
