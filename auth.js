const { randomBytes, scrypt: scryptCallback, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const { access, mkdir, rename, unlink } = require("node:fs/promises");
const path = require("node:path");
const ExcelJS = require("exceljs");

const scrypt = promisify(scryptCallback);
const USER_HEADERS = ["id", "password_hash", "name", "active"];
const PASSWORD_HASH_PATTERN = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/i;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 256;
const ID_MAX_LENGTH = 100;
const NAME_MAX_LENGTH = 100;

function createAuthError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeId(id) {
  return id.trim().toLocaleLowerCase("en-US");
}

function validateUserSheet(sheet) {
  if (!sheet || sheet.rowCount === 0) {
    throw createAuthError("INVALID_USER_FILE", 'Account workbook is missing the "users" sheet');
  }

  const columns = {};
  for (const header of USER_HEADERS) {
    const matches = [];
    for (let column = 1; column <= sheet.getRow(1).cellCount; column += 1) {
      if (sheet.getRow(1).getCell(column).text.trim() === header) {
        matches.push(column);
      }
    }
    if (matches.length !== 1) {
      throw createAuthError(
        "INVALID_USER_FILE",
        `Account workbook must contain exactly one "${header}" column`,
      );
    }
    columns[header] = matches[0];
  }

  return columns;
}

function isEmptyRow(row) {
  return row.values.slice(1).every((value) => value === null || value === undefined || value === "");
}

function readUserRow(row, rowNumber, columns) {
  const user = {};
  for (const header of USER_HEADERS) {
    user[header] = row.getCell(columns[header]).text.trim();
  }

  if (
    !user.id ||
    user.id.length > ID_MAX_LENGTH ||
    !user.password_hash ||
    !PASSWORD_HASH_PATTERN.test(user.password_hash) ||
    !user.name ||
    user.name.length > NAME_MAX_LENGTH ||
    !["Y", "N"].includes(user.active)
  ) {
    throw createAuthError(
      "INVALID_USER_FILE",
      `Account workbook contains an invalid user record at row ${rowNumber}`,
    );
  }

  return user;
}

async function loadUsers(filePath) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (error) {
    throw createAuthError("USER_FILE_READ_FAILED", `Unable to read account workbook: ${error.message}`);
  }

  const sheet = workbook.getWorksheet("users");
  const columns = validateUserSheet(sheet);
  const users = [];
  const seenIds = new Set();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (isEmptyRow(row)) {
      continue;
    }

    const user = readUserRow(row, rowNumber, columns);
    const normalizedId = normalizeId(user.id);
    if (seenIds.has(normalizedId)) {
      throw createAuthError("DUPLICATE_ID", "Account workbook contains duplicate IDs");
    }
    seenIds.add(normalizedId);
    users.push(user);
  }
  return { workbook, sheet, columns, users };
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, passwordHash) {
  const match = PASSWORD_HASH_PATTERN.exec(passwordHash);
  if (!match) {
    throw createAuthError("INVALID_USER_FILE", "Account workbook contains an unsupported password hash");
  }
  const salt = Buffer.from(match[1], "hex");
  const expected = Buffer.from(match[2], "hex");
  const actual = await scrypt(password, salt, expected.length, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(actual, expected);
}

async function authenticateUser(filePath, id, password) {
  const { users } = await loadUsers(filePath);
  const normalizedId = normalizeId(id.trim());
  const user = users.find((entry) => normalizeId(entry.id) === normalizedId);
  if (!user || user.active !== "Y") {
    return null;
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    return null;
  }
  return { id: user.id, name: user.name };
}

function validateNewUser(id, name, password) {
  const cleanId = typeof id === "string" ? id.trim() : "";
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanId || cleanId.length > ID_MAX_LENGTH) {
    throw createAuthError("INVALID_INPUT", `ID must be between 1 and ${ID_MAX_LENGTH} characters`);
  }
  if (!cleanName || cleanName.length > NAME_MAX_LENGTH) {
    throw createAuthError("INVALID_INPUT", `Name must be between 1 and ${NAME_MAX_LENGTH} characters`);
  }
  if (
    typeof password !== "string" ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw createAuthError(
      "INVALID_INPUT",
      `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`,
    );
  }
  return { id: cleanId, name: cleanName };
}

async function setupUser(filePath, id, name, password) {
  const user = validateNewUser(id, name, password);
  let workbook;
  let sheet;
  let columns;

  try {
    await access(filePath);
    ({ workbook, sheet, columns } = await loadUsers(filePath));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    workbook = new ExcelJS.Workbook();
    sheet = workbook.addWorksheet("users");
    sheet.addRow(USER_HEADERS);
    columns = Object.fromEntries(USER_HEADERS.map((header, index) => [header, index + 1]));
  }

  const newId = normalizeId(user.id);
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (!isEmptyRow(row) && normalizeId(row.getCell(columns.id).text.trim()) === newId) {
      throw createAuthError("DUPLICATE_ID", "ID already exists");
    }
  }

  const passwordHash = await hashPassword(password);
  const newRow = sheet.addRow([]);
  newRow.getCell(columns.id).value = user.id;
  newRow.getCell(columns.password_hash).value = passwordHash;
  newRow.getCell(columns.name).value = user.name;
  newRow.getCell(columns.active).value = "Y";

  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.user-${process.pid}-${randomBytes(8).toString("hex")}.tmp`,
  );
  try {
    await workbook.xlsx.writeFile(temporaryPath);
    await rename(temporaryPath, filePath);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") {
        throw cleanupError;
      }
    }
    throw createAuthError("USER_FILE_WRITE_FAILED", `Unable to save account workbook: ${error.message}`);
  }
}

module.exports = {
  authenticateUser,
  hashPassword,
  loadUsers,
  setupUser,
  verifyPassword,
};
