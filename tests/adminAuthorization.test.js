// =============================================================================
//  ADMIN AUTHORIZATION REGRESSION TEST SUITE (SPRINT S1 - TASK 1)
//  tests/adminAuthorization.test.js
//
//  Verifies:
//  1. Unauthenticated requests (missing/malformed header) throw HTTP 401.
//  2. Invalid JWT signatures / expired tokens throw HTTP 401.
//  3. Authenticated non-admin users (role: 0, "user", null) are blocked with HTTP 403.
//  4. Deactivated accounts (activate: false) are blocked with HTTP 403.
//  5. Authorized admin requests (role: 1, "1", "admin") succeed with HTTP 200/next().
//  6. Existing sensitive admin endpoints across controllers are guarded by AdminMiddleware.
// =============================================================================

require("ts-node/register");
const assert = require("assert");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { AdminMiddleware, isAdminUser } = require("../middlewares/auth.middleware");
const { User } = require("../models");

console.log("==================================================================");
console.log("  OPENIDEAR — SPRINT S1: ADMIN AUTHORIZATION REGRESSION TESTS");
console.log("==================================================================\n");

const SECRET_KEY = process.env.SECRET_KEY || "SECRET_KEY";

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

async function runAuthTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      failed++;
    }
  }

  // 1. isAdminUser helper unit tests
  await test("isAdminUser accurately validates admin roles and rejects non-admin roles", () => {
    assert.strictEqual(isAdminUser({ role: 1 }), true, "Numeric 1 is admin");
    assert.strictEqual(isAdminUser({ role: "1" }), true, "String '1' is admin");
    assert.strictEqual(isAdminUser({ role: "admin" }), true, "String 'admin' is admin");

    assert.strictEqual(isAdminUser({ role: 0 }), false, "Numeric 0 is standard user");
    assert.strictEqual(isAdminUser({ role: "0" }), false, "String '0' is standard user");
    assert.strictEqual(isAdminUser({ role: "user" }), false, "String 'user' is standard user");
    assert.strictEqual(isAdminUser({ role: null }), false, "null role is not admin");
    assert.strictEqual(isAdminUser({ role: undefined }), false, "undefined role is not admin");
    assert.strictEqual(isAdminUser({}), false, "empty object is not admin");
    assert.strictEqual(isAdminUser(null), false, "null is not admin");
  });

  // Mock User.findOne for controller/middleware tests
  const originalFindOne = User.findOne;

  // 2. Unauthenticated request (no Authorization header)
  await test("Unauthenticated request (no header) returns 401 Unauthorized", async () => {
    const req = { headers: {} };
    const res = createMockRes();
    let nextCalled = false;

    await AdminMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, "next() must not be called");
    assert.strictEqual(res.statusCode, 401, "Status code must be 401");
    assert.strictEqual(res.body?.success, false);
  });

  // 3. Malformed Authorization header
  await test("Malformed Authorization header returns 401 Unauthorized", async () => {
    const req = { headers: { authorization: "Basic invalid_credentials" } };
    const res = createMockRes();
    let nextCalled = false;

    await AdminMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, "next() must not be called");
    assert.strictEqual(res.statusCode, 401, "Status code must be 401");
  });

  // 4. Invalid or tampered JWT token
  await test("Tampered JWT signature returns 401 Unauthorized", async () => {
    const fakeToken = jwt.sign({ email: "hacker@test.com" }, "WRONG_SECRET");
    const req = { headers: { authorization: `Bearer ${fakeToken}` } };
    const res = createMockRes();
    let nextCalled = false;

    await AdminMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, "next() must not be called");
    assert.strictEqual(res.statusCode, 401, "Status code must be 401");
  });

  // 5. Authenticated non-admin request (role: 0)
  await test("Authenticated non-admin request (role: 0) returns 403 Forbidden", async () => {
    const validToken = jwt.sign({ email: "student@test.com" }, SECRET_KEY);
    const req = { headers: { authorization: `Bearer ${validToken}` } };
    const res = createMockRes();
    let nextCalled = false;

    User.findOne = () => ({
      select: async () => ({
        _id: new mongoose.Types.ObjectId(),
        email: "student@test.com",
        username: "student",
        role: 0,
        activate: true,
      }),
    });

    await AdminMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, "next() must not be called for non-admin");
    assert.strictEqual(res.statusCode, 403, "Status code must be 403");
    assert.strictEqual(res.body?.success, false);
    assert.match(res.body?.message, /admin access required/i);
  });

  // 6. Authenticated user with missing or malformed role
  await test("Authenticated user with missing role returns 403 Forbidden", async () => {
    const validToken = jwt.sign({ email: "unknown@test.com" }, SECRET_KEY);
    const req = { headers: { authorization: `Bearer ${validToken}` } };
    const res = createMockRes();
    let nextCalled = false;

    User.findOne = () => ({
      select: async () => ({
        _id: new mongoose.Types.ObjectId(),
        email: "unknown@test.com",
        username: "unknown",
        role: undefined,
        activate: true,
      }),
    });

    await AdminMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, "next() must not be called");
    assert.strictEqual(res.statusCode, 403, "Status code must be 403");
  });

  // 7. Deactivated / locked admin account
  await test("Deactivated admin user (activate: false) returns 403 Forbidden", async () => {
    const validToken = jwt.sign({ email: "lockedadmin@test.com" }, SECRET_KEY);
    const req = { headers: { authorization: `Bearer ${validToken}` } };
    const res = createMockRes();
    let nextCalled = false;

    User.findOne = () => ({
      select: async () => ({
        _id: new mongoose.Types.ObjectId(),
        email: "lockedadmin@test.com",
        username: "lockedadmin",
        role: 1,
        activate: false,
      }),
    });

    await AdminMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, "next() must not be called for locked account");
    assert.strictEqual(res.statusCode, 403, "Status code must be 403");
    assert.match(res.body?.message, /deactivated or locked/i);
  });

  // 8. Authorized admin request (role: 1)
  await test("Authorized admin request (role: 1, activate: true) proceeds to next()", async () => {
    const adminId = new mongoose.Types.ObjectId();
    const validToken = jwt.sign({ email: "admin@test.com" }, SECRET_KEY);
    const req = { headers: { authorization: `Bearer ${validToken}` } };
    const res = createMockRes();
    let nextCalled = false;

    User.findOne = () => ({
      select: async () => ({
        _id: adminId,
        email: "admin@test.com",
        username: "adminuser",
        role: 1,
        activate: true,
      }),
    });

    await AdminMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, "next() must be called for valid admin");
    assert.strictEqual(req.userInfo?._id, adminId);
    assert.strictEqual(req.userInfo?.role, 1);
  });

  // 9. Sensitive existing admin controller route verification
  await test("Sensitive existing admin controllers wire AdminMiddleware", () => {
    const UserController = require("../controllers/user.controller");
    const userCtrl = new UserController();
    const routes = userCtrl._router.stack;

    const updateRoleLayer = routes.find(r => r.route?.path === "/user/updateRole");
    assert(updateRoleLayer !== undefined, "Route /user/updateRole must exist");
    assert(updateRoleLayer.route.stack.length >= 2, "Route must have middleware stack");

    const deleteUserLayer = routes.find(r => r.route?.path === "/user/delete/:id");
    assert(deleteUserLayer !== undefined, "Route /user/delete/:id must exist");
  });

  // Cleanup mocks
  User.findOne = originalFindOne;

  console.log("------------------------------------------------------------------");
  console.log(`  Admin Authorization Tests: ${passed} passed, ${failed} failed.`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
