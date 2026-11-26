const http = require("node:http");
const { createHash, randomUUID } = require("node:crypto");
const { mkdir, readFile, rename, unlink, writeFile } = require("node:fs/promises");
const path = require("node:path");
const ExcelJS = require("exceljs");
const nodemailer = require("nodemailer");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const port = Number(process.env.PORT || 3000);
const host = "127.0.0.1";
const excelDirectory = path.join(__dirname, "excel");
const customersPath = path.join(excelDirectory, "거래처내역.xlsx");
const itemsPath = path.join(excelDirectory, "품목내역.xlsx");
const materialsPath = path.join(excelDirectory, "재질정보.xlsx");
const ordersStorePath = path.join(__dirname, "storage", "orders.json");
const mailPreviewsDirectory = path.join(__dirname, "storage", "mail-previews");
const mailDeliveriesPath = path.join(__dirname, "storage", "mail-deliveries.json");
const loginPagePath = path.join(__dirname, "public", "index.html");
const quotePagePath = path.join(__dirname, "views", "quote.html");
const publicAssets = new Map([
  ["/materials.css", {
    path: path.join(__dirname, "public", "materials.css"),
    contentType: "text/css; charset=utf-8",
  }],
  ["/materials.js", {
    path: path.join(__dirname, "public", "materials.js"),
    contentType: "text/javascript; charset=utf-8",
  }],
  ["/login.js", {
    path: path.join(__dirname, "public", "login.js"),
    contentType: "text/javascript; charset=utf-8",
  }],
]);
const workbookSheets = {
  customers: ["거래처내역.xlsx", "거래처"],
  items: ["품목내역.xlsx", "품목"],
  materials: ["재질정보.xlsx", "재질"],
  orders: ["주문내역.xlsx", "주문"],
};
let ordersStoreQueue = Promise.resolve();
let mailDeliveryQueue = Promise.resolve();

async function countDataRows(filename, sheetName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(excelDirectory, filename));
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet || sheet.rowCount === 0) {
    throw new Error(`Workbook "${filename}" is missing the "${sheetName}" sheet`);
  }
  const firstHeader = sheet.getRow(1).getCell(1).value;
  if (firstHeader === null || firstHeader === undefined || firstHeader === "") {
    throw new Error(`Workbook "${filename}" is missing its first-column header`);
  }

  let count = 0;
  sheet.eachRow((row, rowNumber) => {
    const key = row.getCell(1).value;
    if (rowNumber > 1 && key !== null && key !== undefined && key !== "") {
      count += 1;
    }
  });
  return count;
}

async function loadHealth() {
  const entries = Object.entries(workbookSheets);
  const rowCounts = await Promise.all(
    entries.map(([, [filename, sheetName]]) => countDataRows(filename, sheetName)),
  );
  const counts = Object.fromEntries(
    entries.map(([key], index) => [key, rowCounts[index]]),
  );
  return {
    status: "ok",
    storage: "Excel 4 files",
    counts,
  };
}

function getColumnIndexes(sheet, requiredHeaders, sheetDescription) {
  const columns = {};
  for (const [key, header] of Object.entries(requiredHeaders)) {
    const matches = [];
    for (let column = 1; column <= sheet.getRow(1).cellCount; column += 1) {
      if (sheet.getRow(1).getCell(column).value === header) {
        matches.push(column);
      }
    }
    if (matches.length !== 1) {
      throw new Error(`${sheetDescription} must contain exactly one "${header}" column`);
    }
    columns[key] = matches[0];
  }
  return columns;
}

async function loadMaterials() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(materialsPath);
  const sheet = workbook.getWorksheet("재질");
  if (!sheet) {
    throw new Error('Workbook is missing the "재질" sheet');
  }

  const columns = getColumnIndexes(sheet, {
    code: "재질코드",
    name: "재질명",
    density: "계산용밀도_g_cm3",
    active: "사용여부",
  }, "Material sheet");

  const materials = [];
  const seenCodes = new Set();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (
      Object.values(row.values).every(
        (value) => value === null || value === undefined || value === "",
      )
    ) {
      continue;
    }

    const code = row.getCell(columns.code).value;
    const name = row.getCell(columns.name).value;
    const density = row.getCell(columns.density).value;
    const active = row.getCell(columns.active).value;

    if (typeof code !== "string" || code.trim() === "") {
      throw new Error(`Invalid material code at row ${rowNumber}`);
    }
    if (seenCodes.has(code)) {
      throw new Error(`Duplicate material code "${code}"`);
    }
    seenCodes.add(code);

    if (active !== "Y" && active !== "N") {
      throw new Error(`Invalid usage flag for material "${code}"`);
    }
    if (active === "N") {
      continue;
    }
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(`Invalid material name for "${code}"`);
    }
    if (typeof density !== "number" || !Number.isFinite(density) || density <= 0) {
      throw new Error(`Invalid calculation density for material "${code}"`);
    }

    materials.push({
      materialCode: code,
      materialName: name,
      calculationDensityGPerCm3: density,
    });
  }

  return materials;
}

async function loadItems(searchTerm) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(itemsPath);
  const sheet = workbook.getWorksheet("품목");
  if (!sheet) {
    throw new Error('Workbook is missing the "품목" sheet');
  }

  const columns = getColumnIndexes(sheet, {
    code: "품목코드",
    name: "품목명",
    spec: "규격",
    active: "사용여부",
  }, "Item sheet");
  const query = searchTerm.trim().toLocaleLowerCase("ko-KR");
  const items = [];
  const seenCodes = new Set();

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (
      Object.values(row.values).every(
        (value) => value === null || value === undefined || value === "",
      )
    ) {
      continue;
    }

    const code = row.getCell(columns.code).value;
    const name = row.getCell(columns.name).value;
    const spec = row.getCell(columns.spec).value;
    const active = row.getCell(columns.active).value;

    if (typeof code !== "string" || code.trim() === "") {
      throw new Error(`Invalid item code at row ${rowNumber}`);
    }
    if (seenCodes.has(code)) {
      throw new Error(`Duplicate item code "${code}"`);
    }
    seenCodes.add(code);

    if (active !== "Y" && active !== "N") {
      throw new Error(`Invalid usage flag for item "${code}"`);
    }
    if (active === "N") {
      continue;
    }
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(`Invalid item name for "${code}"`);
    }
    if (typeof spec !== "string" || spec.trim() === "") {
      throw new Error(`Invalid specification for "${code}"`);
    }

    const searchableText = `${code} ${name} ${spec}`.toLocaleLowerCase("ko-KR");
    if (!query || searchableText.includes(query)) {
      items.push({
        itemCode: code,
        itemName: name,
        spec,
      });
    }
  }

  return items;
}

async function loadCustomers(searchTerm) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(customersPath);
  const sheet = workbook.getWorksheet("거래처");
  if (!sheet) {
    throw new Error('Workbook is missing the "거래처" sheet');
  }

  const columns = getColumnIndexes(sheet, {
    code: "거래처코드",
    name: "거래처명",
    contact: "담당자",
    active: "사용여부",
  }, "Customer sheet");
  const query = searchTerm.trim().toLocaleLowerCase("ko-KR");
  const customers = [];
  const seenCodes = new Set();

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (
      Object.values(row.values).every(
        (value) => value === null || value === undefined || value === "",
      )
    ) {
      continue;
    }

    const code = row.getCell(columns.code).value;
    const name = row.getCell(columns.name).value;
    const contact = row.getCell(columns.contact).value;
    const active = row.getCell(columns.active).value;

    if (typeof code !== "string" || code.trim() === "") {
      throw new Error(`Invalid customer code at row ${rowNumber}`);
    }
    if (seenCodes.has(code)) {
      throw new Error(`Duplicate customer code "${code}"`);
    }
    seenCodes.add(code);

    if (active !== "Y" && active !== "N") {
      throw new Error(`Invalid usage flag for customer "${code}"`);
    }
    if (active === "N") {
      continue;
    }
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(`Invalid customer name for "${code}"`);
    }
    if (typeof contact !== "string" || contact.trim() === "") {
      throw new Error(`Invalid contact person for "${code}"`);
    }

    const searchableText = `${code} ${name} ${contact}`.toLocaleLowerCase("ko-KR");
    if (!query || searchableText.includes(query)) {
      customers.push({
        customerCode: code,
        customerName: name,
        contactPerson: contact,
      });
    }
  }

  return customers;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function readJsonBody(request) {
  const contentType = request.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw createHttpError(415, "Content-Type must be application/json");
  }

  const chunks = [];
  let byteLength = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    byteLength += chunk.length;
    if (byteLength > 16 * 1024) {
      tooLarge = true;
      chunks.length = 0;
      continue;
    }
    if (!tooLarge) {
      chunks.push(chunk);
    }
  }
  if (tooLarge) {
    throw createHttpError(413, "Request body is too large");
  }

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw createHttpError(400, "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createHttpError(400, "Request body must be a JSON object");
  }
  return body;
}

function validateOrderRequest(body) {
  if (
    typeof body.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)
  ) {
    throw createHttpError(400, "requestId must be a UUID");
  }

  const codeFields = ["customerCode", "itemCode", "materialCode"];
  for (const field of codeFields) {
    if (typeof body[field] !== "string" || body[field].trim() === "" || body[field].length > 100) {
      throw createHttpError(400, `${field} must be a non-empty code`);
    }
  }
  if (typeof body.volumeCm3 !== "number" || !Number.isFinite(body.volumeCm3) || body.volumeCm3 <= 0) {
    throw createHttpError(400, "volumeCm3 must be a positive number");
  }
  if (!Number.isSafeInteger(body.quantity) || body.quantity <= 0) {
    throw createHttpError(400, "quantity must be a positive integer");
  }

  return {
    requestId: body.requestId,
    customerCode: body.customerCode.trim(),
    itemCode: body.itemCode.trim(),
    materialCode: body.materialCode.trim(),
    volumeCm3: body.volumeCm3,
    quantity: body.quantity,
  };
}

async function readJsonRows(filePath, description) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  let rows;
  try {
    rows = JSON.parse(contents);
  } catch {
    throw new Error(`${description} contains invalid JSON`);
  }
  if (!Array.isArray(rows)) {
    throw new Error(`${description} must contain a JSON array`);
  }
  return rows;
}

async function readOrderRows() {
  return readJsonRows(ordersStorePath, "Order storage");
}

async function readMailDeliveryRows() {
  return readJsonRows(mailDeliveriesPath, "Mail delivery storage");
}

async function writeJsonRows(filePath, rows, temporaryPrefix) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${temporaryPrefix}-${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(rows, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") {
        console.error("Failed to clean up temporary JSON storage:", cleanupError);
      }
    }
    throw error;
  }
}

async function writeOrderRows(orders) {
  await writeJsonRows(ordersStorePath, orders, "orders");
}

async function writeMailDeliveryRows(deliveries) {
  await writeJsonRows(mailDeliveriesPath, deliveries, "mail-deliveries");
}

function serializeOrderStore(operation) {
  const result = ordersStoreQueue.then(operation);
  ordersStoreQueue = result.then(() => undefined, () => undefined);
  return result;
}

function serializeMailDelivery(operation) {
  const result = mailDeliveryQueue.then(operation);
  mailDeliveryQueue = result.then(() => undefined, () => undefined);
  return result;
}

function matchesOrderRequest(order, request) {
  return (
    order.customerCode === request.customerCode &&
    order.itemCode === request.itemCode &&
    order.materialCode === request.materialCode &&
    order.volumeCm3 === request.volumeCm3 &&
    order.quantity === request.quantity
  );
}

function buildMailPreview(order) {
  const formatter = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 });
  const subject = `[견적 요청] ${order.customerName} - ${order.itemName} (${order.requestId})`;
  const body = [
    "견적 요청 내용을 확인해 주세요.",
    "",
    `요청 ID: ${order.requestId}`,
    `접수 일시: ${new Date(order.receivedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
    `거래처: ${order.customerCode} · ${order.customerName}`,
    `담당자: ${order.contactPerson}`,
    `품목: ${order.itemCode} · ${order.itemName}`,
    `규격: ${order.specification}`,
    `재질: ${order.materialCode} · ${order.materialName}`,
    `적용 밀도: ${formatter.format(order.appliedDensityGPerCm3)} g/cm³`,
    `부피: ${formatter.format(order.volumeCm3)} cm³`,
    `수량: ${formatter.format(order.quantity)}`,
    `개당 중량: ${formatter.format(order.unitWeightKg)} kg`,
    `총 중량: ${formatter.format(order.totalWeightKg)} kg`,
    "",
    "저장된 견적 기록을 바탕으로 생성한 견적 안내입니다.",
  ].join("\n");
  return { subject, body };
}

function createEmlContent(requestId, recipient, subject, body) {
  const encodedSubject = Buffer.from(subject, "utf8").toString("base64");
  const normalizedBody = body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  const encodedBody = Buffer.from(normalizedBody, "utf8")
    .toString("base64")
    .match(/.{1,76}/g)
    .join("\r\n");
  return [
    `To: ${recipient}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    `Message-ID: <quote-${requestId}@local-preview>`,
    `X-Quote-Request-ID: ${requestId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodedBody,
    "",
  ].join("\r\n");
}

function validateMailPreviewRequest(body) {
  if (
    typeof body.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)
  ) {
    throw createHttpError(400, "requestId must be a UUID");
  }
  if (
    typeof body.recipient !== "string" ||
    body.recipient.length > 254 ||
    !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(body.recipient.trim())
  ) {
    throw createHttpError(400, "recipient must be exactly one valid email address");
  }
  if (
    typeof body.subject !== "string" ||
    typeof body.body !== "string" ||
    body.subject.length > 1000 ||
    body.body.length > 12000
  ) {
    throw createHttpError(400, "subject and body are required");
  }
  return {
    requestId: body.requestId,
    recipient: body.recipient.trim(),
    subject: body.subject,
    body: body.body,
  };
}

function isValidEmailAddress(address) {
  return (
    typeof address === "string" &&
    address.length <= 254 &&
    /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(address)
  );
}

function getSmtpConfig() {
  if ((process.env.MAIL_MODE || "").trim().toLowerCase() !== "smtp") {
    throw createHttpError(503, "MAIL_MODE must be smtp before sending mail");
  }

  const host = (process.env.SMTP_HOST || "").trim();
  if (!host || /\.(?:example|invalid|test)$/i.test(host)) {
    throw createHttpError(503, "Set SMTP_HOST to a real SMTP server in the project root .env");
  }

  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw createHttpError(503, "SMTP_PORT must be a valid TCP port");
  }

  const secureSetting = (process.env.SMTP_SECURE || "").trim().toLowerCase();
  if (secureSetting !== "true" && secureSetting !== "false") {
    throw createHttpError(503, "SMTP_SECURE must be true or false");
  }
  const user = (process.env.SMTP_USER || "").trim();
  const pass = process.env.SMTP_PASS || "";
  if (
    !user.trim() ||
    user.trim().toLowerCase() === "your_account" ||
    !pass ||
    pass === "your_local_secret"
  ) {
    throw createHttpError(503, "Set SMTP_USER and SMTP_PASS in the project root .env");
  }

  const from = (process.env.MAIL_FROM || "").trim();
  if (!isValidEmailAddress(from)) {
    throw createHttpError(503, "MAIL_FROM must be a valid sender email address");
  }

  const secure = secureSetting === "true";
  return {
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    from,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  };
}

function getMailFingerprint(mailRequest) {
  return createHash("sha256")
    .update(mailRequest.recipient.toLowerCase())
    .update("\0")
    .update(mailRequest.subject)
    .update("\0")
    .update(mailRequest.body)
    .digest("hex");
}

function classifySmtpFailure(error) {
  const command = typeof error.command === "string" ? error.command : "";
  const retryable = Boolean(command) && !/^DATA\b/i.test(command);
  return {
    status: retryable ? "failed" : "uncertain",
    retryable,
    errorCode:
      typeof error.code === "string" && /^[A-Z0-9_-]{1,40}$/i.test(error.code)
        ? error.code
        : "SMTP_ERROR",
    errorCommand:
      command && /^[A-Z0-9 _-]{1,80}$/i.test(command)
        ? command
        : "",
  };
}

function getPublicMailDelivery(delivery) {
  if (!delivery) {
    return null;
  }
  return {
    status: delivery.status,
    recipient: delivery.recipient,
    sentAt: delivery.sentAt || "",
    messageId: delivery.messageId || "",
    retryable: delivery.retryable === true,
  };
}

function createSmtpTransport(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: config.auth,
    connectionTimeout: config.connectionTimeout,
    greetingTimeout: config.greetingTimeout,
    socketTimeout: config.socketTimeout,
  });
}

function getMailPreviewPath(requestId) {
  return path.join(mailPreviewsDirectory, `quote-${requestId}.eml`);
}

async function readMailPreviewFile(requestId) {
  try {
    return await readFile(getMailPreviewPath(requestId), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeMailPreviewFile(requestId, content) {
  await mkdir(mailPreviewsDirectory, { recursive: true });
  const filePath = getMailPreviewPath(requestId);
  const temporaryPath = path.join(
    mailPreviewsDirectory,
    `.quote-${requestId}-${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, filePath);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") {
        console.error("Failed to clean up temporary mail preview:", cleanupError);
      }
    }
    throw error;
  }
}

async function buildOrderRow(request) {
  const [customers, items, materials] = await Promise.all([
    loadCustomers(""),
    loadItems(""),
    loadMaterials(),
  ]);
  const customer = customers.find((entry) => entry.customerCode === request.customerCode);
  const item = items.find((entry) => entry.itemCode === request.itemCode);
  const material = materials.find((entry) => entry.materialCode === request.materialCode);

  if (!customer) {
    throw createHttpError(422, "Customer code is missing or inactive");
  }
  if (!item) {
    throw createHttpError(422, "Item code is missing or inactive");
  }
  if (!material) {
    throw createHttpError(422, "Material code is missing or inactive");
  }

  const appliedDensityGPerCm3 = material.calculationDensityGPerCm3;
  const unitWeightKg = request.volumeCm3 * appliedDensityGPerCm3 / 1000;
  const totalWeightKg = unitWeightKg * request.quantity;
  if (!Number.isFinite(unitWeightKg) || !Number.isFinite(totalWeightKg)) {
    throw createHttpError(422, "The supplied values are too large to calculate");
  }

  return {
    requestId: request.requestId,
    receivedAt: new Date().toISOString(),
    customerCode: customer.customerCode,
    customerName: customer.customerName,
    contactPerson: customer.contactPerson,
    itemCode: item.itemCode,
    itemName: item.itemName,
    specification: item.spec,
    materialCode: material.materialCode,
    materialName: material.materialName,
    appliedDensityGPerCm3,
    volumeCm3: request.volumeCm3,
    quantity: request.quantity,
    unitWeightKg,
    totalWeightKg,
  };
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${host}`);
  const pathname = requestUrl.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && pathname === "/api/health") {
    try {
      sendJson(response, 200, await loadHealth());
    } catch (error) {
      console.error("Failed to count Excel workbook records:", error);
      sendJson(response, 500, { error: "Failed to read Excel data" });
    }
    return;
  }

  if (request.method === "GET" && pathname === "/api/items") {
    try {
      sendJson(response, 200, { items: await loadItems(requestUrl.searchParams.get("q") || "") });
    } catch (error) {
      console.error("Failed to load items workbook:", error);
      sendJson(response, 500, { error: "Failed to load item data" });
    }
    return;
  }

  if (request.method === "GET" && pathname === "/api/customers") {
    try {
      sendJson(response, 200, {
        customers: await loadCustomers(requestUrl.searchParams.get("q") || ""),
      });
    } catch (error) {
      console.error("Failed to load customers workbook:", error);
      sendJson(response, 500, { error: "Failed to load customer data" });
    }
    return;
  }

  if (request.method === "GET" && pathname === "/api/materials") {
    try {
      sendJson(response, 200, { materials: await loadMaterials() });
    } catch (error) {
      console.error("Failed to load materials workbook:", error);
      sendJson(response, 500, { error: "Failed to load material data" });
    }
    return;
  }

  if (request.method === "GET" && pathname === "/api/orders") {
    try {
      sendJson(response, 200, {
        orders: await serializeOrderStore(readOrderRows),
      });
    } catch (error) {
      console.error("Failed to load saved orders:", error);
      sendJson(response, 500, { error: "Failed to load saved orders" });
    }
    return;
  }

  const mailPreviewMatch = request.method === "GET"
    ? pathname.match(/^\/api\/orders\/([^/]+)\/mail-preview$/)
    : null;
  if (mailPreviewMatch) {
    let requestId;
    try {
      requestId = decodeURIComponent(mailPreviewMatch[1]);
    } catch {
      sendJson(response, 400, { error: "Order request ID is malformed" });
      return;
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
    ) {
      sendJson(response, 400, { error: "Order request ID must be a UUID" });
      return;
    }

    try {
      const preview = await serializeOrderStore(async () => {
        const orders = await readOrderRows();
        const order = orders.find((entry) => entry.requestId === requestId);
        if (!order) {
          throw createHttpError(404, "Saved order was not found");
        }

        const content = buildMailPreview(order);
        const existingFile = await readMailPreviewFile(requestId);
        const deliveries = await readMailDeliveryRows();
        const delivery = deliveries.find((entry) => entry.requestId === requestId);
        let recipient = "";
        if (existingFile !== null) {
          const recipientMatch = existingFile.match(/^To: ([^\r\n]+)\r?$/m);
          recipient = recipientMatch ? recipientMatch[1] : "";
          if (!recipient || createEmlContent(
            requestId,
            recipient,
            content.subject,
            content.body,
          ) !== existingFile) {
            throw new Error("Stored mail preview is invalid");
          }
        }
        return {
          requestId,
          ...content,
          existing: existingFile !== null,
          recipient,
          fileName: `quote-${requestId}.eml`,
          downloadUrl: existingFile === null ? "" : `/api/mail-previews/quote-${requestId}.eml`,
          delivery: getPublicMailDelivery(delivery),
        };
      });
      sendJson(response, 200, { preview });
    } catch (error) {
      if (Number.isInteger(error.statusCode)) {
        sendJson(response, error.statusCode, { error: error.message });
      } else {
        console.error("Failed to build mail preview:", error);
        sendJson(response, 500, { error: "Failed to build mail preview" });
      }
    }
    return;
  }

  if (request.method === "POST" && pathname === "/api/orders") {
    try {
      const orderRequest = validateOrderRequest(await readJsonBody(request));
      const result = await serializeOrderStore(async () => {
        const orders = await readOrderRows();
        const existing = orders.find((order) => order.requestId === orderRequest.requestId);
        if (existing) {
          if (!matchesOrderRequest(existing, orderRequest)) {
            throw createHttpError(409, "requestId was already used with different values");
          }
          return { order: existing, duplicate: true };
        }

        const order = await buildOrderRow(orderRequest);
        orders.push(order);
        await writeOrderRows(orders);
        return { order, duplicate: false };
      });
      sendJson(response, result.duplicate ? 200 : 201, result);
    } catch (error) {
      if (Number.isInteger(error.statusCode)) {
        sendJson(response, error.statusCode, { error: error.message });
      } else {
        console.error("Failed to save order:", error);
        sendJson(response, 500, { error: "Failed to save order" });
      }
    }
    return;
  }

  if (request.method === "POST" && pathname === "/api/mail-previews") {
    try {
      const mailRequest = validateMailPreviewRequest(await readJsonBody(request));
      const result = await serializeOrderStore(async () => {
        const orders = await readOrderRows();
        const order = orders.find((entry) => entry.requestId === mailRequest.requestId);
        if (!order) {
          throw createHttpError(404, "Saved order was not found");
        }

        const preview = buildMailPreview(order);
        if (mailRequest.subject !== preview.subject || mailRequest.body !== preview.body) {
          throw createHttpError(409, "Mail content no longer matches the saved order preview");
        }
        const emlContent = createEmlContent(
          mailRequest.requestId,
          mailRequest.recipient,
          preview.subject,
          preview.body,
        );
        const existingFile = await readMailPreviewFile(mailRequest.requestId);
        if (existingFile !== null) {
          if (existingFile !== emlContent) {
            throw createHttpError(409, "A mail preview already exists for this request ID");
          }
          return { duplicate: true };
        }

        await writeMailPreviewFile(mailRequest.requestId, emlContent);
        return { duplicate: false };
      });
      sendJson(response, result.duplicate ? 200 : 201, {
        requestId: mailRequest.requestId,
        duplicate: result.duplicate,
        sent: false,
        previewOnly: true,
        fileName: `quote-${mailRequest.requestId}.eml`,
        downloadUrl: `/api/mail-previews/quote-${mailRequest.requestId}.eml`,
      });
    } catch (error) {
      if (Number.isInteger(error.statusCode)) {
        sendJson(response, error.statusCode, { error: error.message });
      } else {
        console.error("Failed to create mail preview:", error);
        sendJson(response, 500, { error: "Failed to create mail preview" });
      }
    }
    return;
  }

  if (request.method === "POST" && pathname === "/api/mail") {
    try {
      const mailRequest = validateMailPreviewRequest(await readJsonBody(request));
      const result = await serializeMailDelivery(async () => {
        const order = await serializeOrderStore(async () => {
          const orders = await readOrderRows();
          return orders.find((entry) => entry.requestId === mailRequest.requestId);
        });
        if (!order) {
          throw createHttpError(404, "Saved order was not found");
        }

        const preview = buildMailPreview(order);
        if (mailRequest.subject !== preview.subject || mailRequest.body !== preview.body) {
          throw createHttpError(409, "Mail content no longer matches the saved order preview");
        }

        const fingerprint = getMailFingerprint(mailRequest);
        const deliveries = await readMailDeliveryRows();
        let delivery = deliveries.find((entry) => entry.requestId === mailRequest.requestId);
        if (delivery) {
          if (delivery.fingerprint !== fingerprint) {
            throw createHttpError(409, "This request ID already has a mail delivery record");
          }
          if (delivery.status === "sent") {
            return {
              requestId: mailRequest.requestId,
              recipient: delivery.recipient,
              sent: true,
              duplicate: true,
              messageId: delivery.messageId,
              sentAt: delivery.sentAt,
            };
          }
          if (delivery.status === "sending" || delivery.status === "uncertain") {
            const error = createHttpError(
              409,
              "The SMTP result is pending or uncertain; automatic resend is blocked to prevent duplicates",
            );
            error.retryable = false;
            throw error;
          }
          if (delivery.status !== "failed" || delivery.retryable !== true) {
            throw createHttpError(409, "This request ID cannot be sent again");
          }
        }

        const smtpConfig = getSmtpConfig();
        if (!delivery) {
          delivery = {
            requestId: mailRequest.requestId,
            recipient: mailRequest.recipient,
            fingerprint,
            status: "sending",
            attempts: 1,
            createdAt: new Date().toISOString(),
          };
          deliveries.push(delivery);
        } else {
          delivery.status = "sending";
          delivery.retryable = false;
          delivery.attempts += 1;
        }
        delivery.updatedAt = new Date().toISOString();
        await writeMailDeliveryRows(deliveries);

        const transport = createSmtpTransport(smtpConfig);
        let info;
        try {
          info = await transport.sendMail({
            from: smtpConfig.from,
            to: mailRequest.recipient,
            subject: preview.subject,
            text: preview.body,
            headers: { "X-Quote-Request-ID": mailRequest.requestId },
          });
        } catch (error) {
          const failure = classifySmtpFailure(error);
          Object.assign(delivery, failure, { updatedAt: new Date().toISOString() });
          await writeMailDeliveryRows(deliveries);
          console.error("SMTP mail delivery failed:", {
            requestId: mailRequest.requestId,
            errorCode: failure.errorCode,
            errorCommand: failure.errorCommand,
          });
          const deliveryError = createHttpError(
            502,
            failure.retryable
              ? "SMTP rejected the message before delivery; check settings and retry"
              : "SMTP outcome is uncertain; resend is blocked to prevent a duplicate",
          );
          deliveryError.retryable = failure.retryable;
          throw deliveryError;
        } finally {
          transport.close();
        }

        const accepted = Array.isArray(info.accepted) && info.accepted.some((entry) => {
          const address = typeof entry === "string"
            ? entry
            : entry && typeof entry === "object"
              ? entry.address
              : "";
          return typeof address === "string" &&
            address.toLowerCase() === mailRequest.recipient.toLowerCase();
        });
        if (!accepted) {
          delivery.status = "failed";
          delivery.retryable = true;
          delivery.errorCode = "RECIPIENT_REJECTED";
          delivery.updatedAt = new Date().toISOString();
          await writeMailDeliveryRows(deliveries);
          const deliveryError = createHttpError(502, "SMTP server did not accept the recipient");
          deliveryError.retryable = true;
          throw deliveryError;
        }

        delivery.status = "sent";
        delivery.retryable = false;
        delivery.sentAt = new Date().toISOString();
        delivery.messageId = info.messageId;
        delivery.updatedAt = delivery.sentAt;
        delete delivery.errorCode;
        delete delivery.errorCommand;
        await writeMailDeliveryRows(deliveries);
        return {
          requestId: mailRequest.requestId,
          recipient: mailRequest.recipient,
          sent: true,
          duplicate: false,
          messageId: delivery.messageId,
          sentAt: delivery.sentAt,
        };
      });
      sendJson(response, result.duplicate ? 200 : 202, {
        ...result,
        smtpAccepted: true,
      });
    } catch (error) {
      if (Number.isInteger(error.statusCode)) {
        sendJson(response, error.statusCode, {
          error: error.message,
          ...(typeof error.retryable === "boolean" ? { retryable: error.retryable } : {}),
        });
      } else {
        console.error("Failed to process SMTP mail delivery:", error);
        sendJson(response, 500, { error: "Failed to process SMTP mail delivery" });
      }
    }
    return;
  }

  const emlMatch = request.method === "GET"
    ? pathname.match(/^\/api\/mail-previews\/quote-([^/]+)\.eml$/)
    : null;
  if (emlMatch) {
    const requestId = emlMatch[1];
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
    ) {
      sendJson(response, 400, { error: "Order request ID must be a UUID" });
      return;
    }
    try {
      const content = await readMailPreviewFile(requestId);
      if (content === null) {
        sendJson(response, 404, { error: "Mail preview was not found" });
        return;
      }
      response.writeHead(200, {
        "Content-Type": "message/rfc822; charset=utf-8",
        "Content-Disposition": `attachment; filename="quote-${requestId}.eml"`,
        "Cache-Control": "no-store",
      });
      response.end(content);
    } catch (error) {
      console.error("Failed to read mail preview file:", error);
      sendJson(response, 500, { error: "Failed to read mail preview file" });
    }
    return;
  }

  const deleteOrderMatch = request.method === "DELETE"
    ? pathname.match(/^\/api\/orders\/([^/]+)$/)
    : null;
  if (deleteOrderMatch) {
    let requestId;
    try {
      requestId = decodeURIComponent(deleteOrderMatch[1]);
    } catch {
      sendJson(response, 400, { error: "Order request ID is malformed" });
      return;
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
    ) {
      sendJson(response, 400, { error: "Order request ID must be a UUID" });
      return;
    }

    try {
      const deletedOrder = await serializeOrderStore(async () => {
        const orders = await readOrderRows();
        const orderIndex = orders.findIndex((order) => order.requestId === requestId);
        if (orderIndex === -1) {
          throw createHttpError(404, "Saved order was not found");
        }
        const [order] = orders.splice(orderIndex, 1);
        await writeOrderRows(orders);
        return order;
      });
      sendJson(response, 200, { deleted: true, order: deletedOrder });
    } catch (error) {
      if (Number.isInteger(error.statusCode)) {
        sendJson(response, error.statusCode, { error: error.message });
      } else {
        console.error("Failed to delete saved order:", error);
        sendJson(response, 500, { error: "Failed to delete saved order" });
      }
    }
    return;
  }

  const asset = request.method === "GET" ? publicAssets.get(pathname) : null;
  if (asset) {
    try {
      const content = await readFile(asset.path);
      response.writeHead(200, {
        "Content-Type": asset.contentType,
        "Cache-Control": "no-store",
      });
      response.end(content);
    } catch (error) {
      console.error(`Failed to load public asset "${pathname}":`, error);
      sendJson(response, 500, { error: "Failed to load page asset" });
    }
    return;
  }

  if (request.method === "GET" && pathname === "/") {
    try {
      const page = await readFile(loginPagePath);
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(page);
    } catch (error) {
      console.error("Failed to load login page:", error);
      sendJson(response, 500, { error: "Failed to load login page" });
    }
    return;
  }

  if (request.method === "GET" && (pathname === "/quote.html" || pathname === "/materials")) {
    try {
      const page = await readFile(quotePagePath);
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(page);
    } catch (error) {
      console.error("Failed to load quote page:", error);
      sendJson(response, 500, { error: "Failed to load quote page" });
    }
    return;
  }

  sendJson(response, 404, { error: "Not Found" });
});

server.on("error", (error) => {
  console.error("Server failed to start:", error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Health server listening at http://${host}:${port}`);
});
