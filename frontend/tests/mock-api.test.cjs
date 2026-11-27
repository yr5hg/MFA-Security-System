const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const context = vm.createContext({ Blob });

vm.runInContext(
    fs.readFileSync(
        path.join(__dirname, "../js/mock-api.js"),
        "utf8"
    ),
    context
);

const submit = context.submitDemoCapture;

function image(size, type = "image/jpeg") {
    return new Blob([new Uint8Array(size)], { type });
}

test("Verification input accepted", () => {
    assert.equal(submit("verify", image(100)).accepted, true);
});

test("Enrollment input accepted", () => {
    assert.equal(submit("enroll", image(100)).accepted, true);
});

test("Replacement input accepted", () => {
    assert.equal(submit("replace", image(100)).accepted, true);
});

test("Invalid operation rejected", () => {
    assert.equal(submit("unknown", image(100)).accepted, false);
});

test("Wrong image format rejected", () => {
    assert.equal(
        submit("verify", image(100, "image/png")).accepted,
        false
    );
});

test("Empty image rejected", () => {
    assert.equal(submit("verify", image(0)).accepted, false);
});

test("Maximum allowed size accepted", () => {
    assert.equal(submit("verify", image(1048576)).accepted, true);
});

test("Oversized image rejected", () => {
    assert.equal(submit("verify", image(1048577)).accepted, false);
});
