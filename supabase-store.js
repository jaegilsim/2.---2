function normalizeId(id) {
  return id.trim().toLocaleLowerCase("en-US");
}

function getConfig() {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    const error = new Error("Supabase URL and service-role key are required");
    error.statusCode = 503;
    throw error;
  }
  return { url, key };
}

function getRequestError(statusCode) {
  const error = new Error(`Supabase request failed (${statusCode})`);
  error.statusCode = statusCode;
  return error;
}

async function request(tablePath, { method = "GET", body, prefer } = {}) {
  const { url, key } = getConfig();
  const headers = {
    Accept: "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (prefer) {
    headers.Prefer = prefer;
  }

  const response = await fetch(`${url}/rest/v1/${tablePath}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const contents = await response.text();
  let data = null;
  if (contents) {
    try {
      data = JSON.parse(contents);
    } catch {
      throw getRequestError(response.status);
    }
  }
  if (!response.ok) {
    throw getRequestError(response.status);
  }
  return data;
}

async function findUserById(id) {
  const query = new URLSearchParams({
    select: "id,name,password_hash,active",
    id_normalized: `eq.${normalizeId(id)}`,
    limit: "2",
  });
  const users = await request(`app_users?${query}`);
  if (users.length > 1) {
    throw new Error("Supabase account IDs are not unique");
  }
  return users[0] || null;
}

async function upsertUsers(users) {
  const records = users.map((user) => ({
    id: user.id,
    id_normalized: normalizeId(user.id),
    name: user.name,
    password_hash: user.password_hash,
    active: user.active === "Y",
  }));
  await request("app_users?on_conflict=id_normalized", {
    method: "POST",
    body: records,
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

async function listOrders() {
  const query = new URLSearchParams({
    select: "record",
    order: "created_at.asc",
  });
  const rows = await request(`quote_orders?${query}`);
  return rows.map((row) => row.record);
}

async function getOrder(requestId) {
  const query = new URLSearchParams({
    select: "record",
    request_id: `eq.${requestId}`,
    limit: "1",
  });
  const rows = await request(`quote_orders?${query}`);
  return rows[0] ? rows[0].record : null;
}

async function createOrder(order) {
  try {
    await request("quote_orders", {
      method: "POST",
      body: { request_id: order.requestId, record: order },
      prefer: "return=minimal",
    });
    return { order, duplicate: false };
  } catch (error) {
    if (error.statusCode !== 409) {
      throw error;
    }
    const existing = await getOrder(order.requestId);
    if (!existing) {
      throw error;
    }
    return { order: existing, duplicate: true };
  }
}

async function deleteOrder(requestId) {
  const query = new URLSearchParams({
    request_id: `eq.${requestId}`,
    select: "record",
  });
  const rows = await request(`quote_orders?${query}`, {
    method: "DELETE",
    prefer: "return=representation",
  });
  return rows[0] ? rows[0].record : null;
}

async function readMailPreview(requestId) {
  const query = new URLSearchParams({
    select: "content",
    request_id: `eq.${requestId}`,
    limit: "1",
  });
  const rows = await request(`quote_mail_previews?${query}`);
  return rows[0] ? rows[0].content : null;
}

async function writeMailPreview(requestId, content) {
  try {
    await request("quote_mail_previews", {
      method: "POST",
      body: { request_id: requestId, content },
      prefer: "return=minimal",
    });
    return { duplicate: false };
  } catch (error) {
    if (error.statusCode !== 409) {
      throw error;
    }
    const existing = await readMailPreview(requestId);
    if (existing === content) {
      return { duplicate: true };
    }
    const conflict = new Error("A mail preview already exists for this request ID");
    conflict.statusCode = 409;
    throw conflict;
  }
}

function mapMailDelivery(row) {
  if (!row) {
    return null;
  }
  return {
    requestId: row.request_id,
    recipient: row.recipient,
    fingerprint: row.fingerprint,
    status: row.status,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.sent_at ? { sentAt: row.sent_at } : {}),
    ...(row.message_id ? { messageId: row.message_id } : {}),
    ...(typeof row.retryable === "boolean" ? { retryable: row.retryable } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.error_command ? { errorCommand: row.error_command } : {}),
  };
}

async function getMailDelivery(requestId) {
  const query = new URLSearchParams({
    select: "*",
    request_id: `eq.${requestId}`,
    limit: "1",
  });
  const rows = await request(`quote_mail_deliveries?${query}`);
  return mapMailDelivery(rows[0]);
}

async function listMailDeliveries() {
  const query = new URLSearchParams({
    select: "*",
    order: "created_at.asc",
  });
  const rows = await request(`quote_mail_deliveries?${query}`);
  return rows.map(mapMailDelivery);
}

function deliveryToRecord(delivery) {
  return {
    request_id: delivery.requestId,
    recipient: delivery.recipient,
    fingerprint: delivery.fingerprint,
    status: delivery.status,
    attempts: delivery.attempts,
    created_at: delivery.createdAt,
    updated_at: delivery.updatedAt,
    sent_at: delivery.sentAt || null,
    message_id: delivery.messageId || null,
    retryable: delivery.retryable === true,
    error_code: delivery.errorCode || null,
    error_command: delivery.errorCommand || null,
  };
}

function createConflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

async function claimMailDelivery(delivery) {
  try {
    await request("quote_mail_deliveries", {
      method: "POST",
      body: deliveryToRecord(delivery),
      prefer: "return=minimal",
    });
    return { delivery, duplicate: false };
  } catch (error) {
    if (error.statusCode !== 409) {
      throw error;
    }
  }

  const existing = await getMailDelivery(delivery.requestId);
  if (!existing) {
    throw new Error("Mail delivery record could not be read");
  }
  if (existing.fingerprint !== delivery.fingerprint) {
    throw createConflict("This request ID already has a mail delivery record");
  }
  if (existing.status === "sent") {
    return { delivery: existing, duplicate: true };
  }
  if (existing.status === "sending" || existing.status === "uncertain") {
    throw createConflict(
      "The SMTP result is pending or uncertain; automatic resend is blocked to prevent duplicates",
    );
  }
  if (existing.status !== "failed" || existing.retryable !== true) {
    throw createConflict("This request ID cannot be sent again");
  }

  const nextDelivery = {
    ...existing,
    status: "sending",
    retryable: false,
    attempts: existing.attempts + 1,
    updatedAt: new Date().toISOString(),
  };
  const query = new URLSearchParams({
    request_id: `eq.${delivery.requestId}`,
    status: "eq.failed",
    retryable: "eq.true",
    select: "*",
  });
  const updatedRows = await request(`quote_mail_deliveries?${query}`, {
    method: "PATCH",
    body: deliveryToRecord(nextDelivery),
    prefer: "return=representation",
  });
  if (!updatedRows.length) {
    throw createConflict(
      "The SMTP result is pending or uncertain; automatic resend is blocked to prevent duplicates",
    );
  }
  return { delivery: mapMailDelivery(updatedRows[0]), duplicate: false };
}

async function updateMailDelivery(requestId, delivery) {
  const record = deliveryToRecord(delivery);
  delete record.request_id;
  delete record.created_at;
  const query = new URLSearchParams({
    request_id: `eq.${requestId}`,
    status: "eq.sending",
    select: "*",
  });
  const rows = await request(`quote_mail_deliveries?${query}`, {
    method: "PATCH",
    body: record,
    prefer: "return=representation",
  });
  if (!rows.length) {
    throw new Error("Mail delivery state could not be updated");
  }
  return mapMailDelivery(rows[0]);
}

module.exports = {
  claimMailDelivery,
  createOrder,
  deleteOrder,
  findUserById,
  getMailDelivery,
  getOrder,
  listMailDeliveries,
  listOrders,
  readMailPreview,
  updateMailDelivery,
  upsertUsers,
  writeMailPreview,
};
