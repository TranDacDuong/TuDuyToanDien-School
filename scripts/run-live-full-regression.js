const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoDir = path.resolve(__dirname, "..");
function runNpmScript(scriptName, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  const result = process.platform === "win32"
    ? spawnSync(`"C:\\Program Files\\nodejs\\npm.cmd" run ${scriptName}`, [], {
        cwd: repoDir,
        env,
        encoding: "utf8",
        stdio: ["inherit", "pipe", "pipe"],
        shell: true,
      })
    : spawnSync("npm", ["run", scriptName], {
        cwd: repoDir,
        env,
        encoding: "utf8",
        stdio: ["inherit", "pipe", "pipe"],
        shell: false,
      });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm run ${scriptName} failed with exit code ${result.status}`);
  }

  return result.stdout || "";
}

function extractJsonBlock(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not find JSON output in script result");
  }
  return text.slice(start, end + 1);
}

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

async function main() {
  requireEnv("PLAYWRIGHT_BASE_URL");
  requireEnv("PLAYWRIGHT_ADMIN_EMAIL");
  requireEnv("PLAYWRIGHT_ADMIN_PASSWORD");

  let cleanupPrefixes = process.env.CLEANUP_PREFIXES || "PW-ROLE-";

  try {
    const setupOutput = runNpmScript("setup:e2e:roles");
    const setupData = JSON.parse(extractJsonBlock(setupOutput));

    const roleEnv = {
      PLAYWRIGHT_TEACHER_EMAIL: setupData.teacher.email,
      PLAYWRIGHT_TEACHER_PASSWORD: setupData.teacher.password,
      PLAYWRIGHT_STUDENT_EMAIL: setupData.student.email,
      PLAYWRIGHT_STUDENT_PASSWORD: setupData.student.password,
    };

    runNpmScript("test:e2e:admin", roleEnv);
    runNpmScript("test:e2e:roles", roleEnv);
  } finally {
    runNpmScript("cleanup:e2e", { CLEANUP_PREFIXES: cleanupPrefixes });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
