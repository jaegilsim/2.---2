const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { hashPassword } = require("../auth");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("Vercel catch-all handles login, signed sessions, and protected quote routes", async (t) => {
  const previousEnv = {
    VERCEL: process.env.VERCEL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
  const user = {
    id: "vercel-tester",
    id_normalized: "vercel-tester",
    name: "Vercel Test",
    password_hash: await hashPassword("test-password"),
    active: true,
  };
  const supabaseServer = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/rest/v1/app_users" && request.method === "GET") {
      const requestedId = (url.searchParams.get("id_normalized") || "").replace(/^eq\./, "");
      const users = requestedId === user.id_normalized ? [user] : [];
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(users));
      return;
    }
    if (url.pathname === "/rest/v1/quote_orders" && request.method === "GET") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end("[]");
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "Not found" }));
  });

  const supabasePort = await listen(supabaseServer);
  process.env.VERCEL = "1";
  process.env.SUPABASE_URL = `http://127.0.0.1:${supabasePort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";

  const handleRequest = require(path.join(__dirname, "..", "api", "[...route].js"));
  const appServer = http.createServer(handleRequest);
  const appPort = await listen(appServer);
  const baseUrl = `http://127.0.0.1:${appPort}`;

  t.after(async () => {
    await close(appServer);
    await close(supabaseServer);
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  const loginResponse = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "VERCEL-TESTER", password: "test-password" }),
  });
  assert.equal(loginResponse.status, 200);
  assert.deepEqual(await loginResponse.json(), { authenticated: true, name: "Vercel Test" });
  const sessionCookie = loginResponse.headers.get("set-cookie").split(";")[0];
  assert.match(loginResponse.headers.get("set-cookie"), /HttpOnly/);
  assert.match(loginResponse.headers.get("set-cookie"), /Secure/);

  const sessionResponse = await fetch(`${baseUrl}/api/session`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(sessionResponse.status, 200);
  assert.deepEqual(await sessionResponse.json(), { authenticated: true, name: "Vercel Test" });

  const ordersResponse = await fetch(`${baseUrl}/api/orders`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(ordersResponse.status, 200);
  assert.deepEqual(await ordersResponse.json(), { orders: [] });

  const quoteResponse = await fetch(`${baseUrl}/api/quote`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(quoteResponse.status, 200);
  assert.match(await quoteResponse.text(), /중량산출/);
});
