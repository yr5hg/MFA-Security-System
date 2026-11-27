const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

let request;

const context = vm.createContext({
    fetch: async (url, options) => {
        request = { url, options };
        return { status: 200, ok: true };
    }
});

vm.runInContext(
    fs.readFileSync(
        path.join(__dirname, "../js/api-client.js"),
        "utf8"
    ),
    context
);

test("Correct API endpoint", async () => {
    await context.getCurrentAttempt();
    assert.equal(request.url, "/attempts/current");
});

test("Correct HTTP method", async () => {
    await context.getCurrentAttempt();
    assert.equal(request.options.method, "GET");
});

test("Same-origin credentials", async () => {
    await context.getCurrentAttempt();
    assert.equal(request.options.credentials, "same-origin");
});

test("Response caching disabled", async () => {
    await context.getCurrentAttempt();
    assert.equal(request.options.cache, "no-store");
});

test("Unexpected redirects rejected", async () => {
    await context.getCurrentAttempt();
    assert.equal(request.options.redirect, "error");
});

test("Cancellation signal forwarded", async () => {
    const controller = new AbortController();
    await context.getCurrentAttempt(controller.signal);

    assert.equal(
        request.options.signal,
        controller.signal
    );
});



test("Face verification endpoint", async () => {
    await context.sendFaceCapture("verify");
    assert.equal(request.url, "/face/verify");
    assert.equal(request.options.method, "POST");
});

test("Face enrollment endpoint", async () => {
    await context.sendFaceCapture("enroll");
    assert.equal(request.url, "/face/enroll");
});

test("Face replacement endpoint", async () => {
    await context.sendFaceCapture("replace");
    assert.equal(request.url, "/face/enroll");
});

test("Invalid face operation rejected", async () => {
    request = null;
    await assert.rejects(
        context.sendFaceCapture("unknown"),
        /Invalid face operation/
    );
    assert.equal(request, null);
});

test("Face request options forwarded", async () => {
    const body = "test-data";
    const headers = { "Content-Type": "image/jpeg" };
    const controller = new AbortController();

    await context.sendFaceCapture(
        "verify", body, headers, controller.signal
    );

    assert.equal(request.options.body, body);
    assert.equal(request.options.headers, headers);
    assert.equal(request.options.signal, controller.signal);
    assert.equal(request.options.credentials, "same-origin");
    assert.equal(request.options.cache, "no-store");
    assert.equal(request.options.redirect, "error");
});
