const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { loadUsers } = require("../auth");
const { upsertUsers } = require("../supabase-store");

async function main() {
  const { users } = await loadUsers(path.join(__dirname, "..", "excel", "user.xlsx"));
  await upsertUsers(users);
  console.log(`Synchronized ${users.length} account(s) to Supabase.`);
}

main().catch((error) => {
  console.error("Could not synchronize accounts to Supabase:", error.message);
  process.exitCode = 1;
});
