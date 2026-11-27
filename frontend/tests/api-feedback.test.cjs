const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const context = vm.createContext({});

vm.runInContext(
    fs.readFileSync(
        path.join(__dirname, "../js/api-feedback.js"),
        "utf8"
    ),
    context
);

const feedback = context.getApiErrorMessage;

const cases = [
    [400, "Invalid request. Please try again."],
    [401, "Authentication required. Please log in again."],
    [403, "Access denied."],
    [409, "Attempt or approval expired or invalid."],
    [413, "Image exceeds the allowed size."],
    [415, "Unsupported image format."],
    [429, "Too many attempts. Please try again later."],
    [503, "Service unavailable. Please try again later."],
    [0, "Unable to connect to the server."],
    [500, "Request failed. Please try again."]
];

for (const [code, expected] of cases) {
    test(`Error handling: ${code}`, () => {
        assert.equal(feedback(code), expected);
    });
}
