const readline = require("node:readline");
const path = require("node:path");
const { setupUser } = require("./auth");

const userFilePath = path.join(__dirname, "excel", "user.xlsx");

function ask(question) {
  const interfaceInstance = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    interfaceInstance.question(question, (answer) => {
      interfaceInstance.close();
      resolve(answer);
    });
  });
}

function askHidden(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(new Error("Password input requires an interactive terminal"));
  }

  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const previousRawMode = input.isRaw;
    let password = "";
    process.stdout.write(question);
    input.setRawMode(true);
    input.resume();

    function finish(error) {
      input.removeListener("data", onData);
      input.setRawMode(previousRawMode);
      process.stdout.write("\n");
      if (error) {
        reject(error);
      } else {
        resolve(password);
      }
    }

    function onData(data) {
      for (const character of data.toString("utf8")) {
        if (character === "\u0003") {
          finish(new Error("Setup cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          password = password.slice(0, -1);
        } else if (character >= " ") {
          password += character;
        }
      }
    }

    input.on("data", onData);
  });
}

async function main() {
  const id = await ask("ID: ");
  const name = await ask("Name: ");
  const password = await askHidden("Password (input hidden): ");
  const confirmation = await askHidden("Confirm password (input hidden): ");
  if (password !== confirmation) {
    throw new Error("Passwords do not match");
  }

  await setupUser(userFilePath, id, name, password);
  console.log("Account saved with active status Y.");
}

main().catch((error) => {
  console.error(`Account setup failed: ${error.message}`);
  process.exitCode = 1;
});
