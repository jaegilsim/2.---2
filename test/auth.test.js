const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const ExcelJS = require("exceljs");
const { authenticateUser, loadUsers, setupUser } = require("../auth");

async function createTestDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "quote-auth-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("setup saves an active account with a verifiable password hash", async (t) => {
  const directory = await createTestDirectory(t);
  const filePath = path.join(directory, "user.xlsx");

  await setupUser(filePath, "tester", "Test User", "correct-horse");

  const { users } = await loadUsers(filePath);
  assert.equal(users.length, 1);
  assert.equal(users[0].active, "Y");
  assert.match(users[0].password_hash, /^scrypt\$/);
  assert.deepEqual(await authenticateUser(filePath, "tester", "correct-horse"), {
    id: "tester",
    name: "Test User",
  });
  assert.equal(await authenticateUser(filePath, "tester", "wrong-password"), null);
  assert.equal(await authenticateUser(filePath, "missing", "correct-horse"), null);
  await assert.rejects(
    setupUser(filePath, "TESTER", "Other User", "another-password"),
    { code: "DUPLICATE_ID" },
  );
});

test("inactive accounts cannot authenticate", async (t) => {
  const directory = await createTestDirectory(t);
  const filePath = path.join(directory, "user.xlsx");
  await setupUser(filePath, "inactive", "Inactive User", "correct-horse");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  workbook.getWorksheet("users").getCell("D2").value = "N";
  await workbook.xlsx.writeFile(filePath);

  assert.equal(await authenticateUser(filePath, "inactive", "correct-horse"), null);
});

test("duplicate IDs and malformed or missing account files fail explicitly", async (t) => {
  const directory = await createTestDirectory(t);
  const duplicatePath = path.join(directory, "duplicates.xlsx");
  await setupUser(duplicatePath, "same-id", "First", "correct-horse");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(duplicatePath);
  workbook.getWorksheet("users").addRow(workbook.getWorksheet("users").getRow(2).values.slice(1));
  await workbook.xlsx.writeFile(duplicatePath);
  await assert.rejects(
    loadUsers(duplicatePath),
    { code: "DUPLICATE_ID" },
  );
  await assert.rejects(
    authenticateUser(duplicatePath, "same-id", "correct-horse"),
    { code: "DUPLICATE_ID" },
  );

  const malformedPath = path.join(directory, "malformed.xlsx");
  const malformedWorkbook = new ExcelJS.Workbook();
  malformedWorkbook.addWorksheet("accounts");
  await malformedWorkbook.xlsx.writeFile(malformedPath);
  await assert.rejects(
    authenticateUser(malformedPath, "any-id", "any-password"),
    { code: "INVALID_USER_FILE" },
  );
  await assert.rejects(
    authenticateUser(path.join(directory, "missing.xlsx"), "any-id", "any-password"),
    { code: "USER_FILE_READ_FAILED" },
  );
});
