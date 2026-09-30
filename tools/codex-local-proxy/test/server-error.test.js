import test from "node:test";
import assert from "node:assert/strict";

import { handleRequestError } from "../src/server.js";

test("handleRequestError does not write headers again after response has started", () => {
  const response = {
    headersSent: true,
    writableEnded: false,
    destroyed: false,
    writeHeadCalls: 0,
    destroyCalls: 0,
    writeHead() {
      this.writeHeadCalls += 1;
    },
    end() {
      throw new Error("should not end");
    },
    destroy(error) {
      this.destroyed = true;
      this.destroyCalls += 1;
      this.destroyError = error;
    }
  };
  const error = new Error("stream failed");
  error.statusCode = 502;

  handleRequestError(response, error);

  assert.equal(response.writeHeadCalls, 0);
  assert.equal(response.destroyCalls, 1);
  assert.equal(response.destroyError, error);
});
