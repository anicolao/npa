import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * This script parses DOCUMENTATION_PLAN.md and files GitHub issues for
 * sections 005 through 016.
 * 
 * Usage: npx tsx scripts/file-doc-issues.ts [--confirm]
 */

const PLAN_FILE = "DOCUMENTATION_PLAN.md";

function main() {
  let plan: string;
  try {
    plan = readFileSync(PLAN_FILE, "utf-8");
  } catch (err) {
    console.error(`Error reading ${PLAN_FILE}: ${err}`);
    process.exit(1);
  }

  const confirm = process.argv.includes("--confirm");
  
  // Regex to match table rows: | ID | Section | Coverage | Status |
  const rowRegex = /\| (\d{3}) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/g;
  let match;
  const issuesToCreate = [];

  while ((match = rowRegex.exec(plan)) !== null) {
    const id = match[1];
    const section = match[2].trim();
    
    const idNum = parseInt(id, 10);
    if (idNum >= 5 && idNum <= 16) {
      issuesToCreate.push({ id, section });
    }
  }

  if (issuesToCreate.length === 0) {
    console.log("No matching sections found in DOCUMENTATION_PLAN.md (expected 005-016).");
    return;
  }

  console.log(`Found ${issuesToCreate.length} sections to file issues for.\n`);

  for (const issue of issuesToCreate) {
    const title = `Write E2E Test and Docs for ${issue.id}- ${issue.section}`;
    const body = `Read the E2E_GUIDE.md, DOCUMENTATION_PLAN.md, and DOCUMENTATION_GUIDE.md, and then implement section ${issue.id}- and put up a PR for review.`;

    const args = [
      "issue",
      "create",
      "--title",
      title,
      "--body",
      body,
    ];

    if (confirm) {
      console.log(`Filing issue: ${title}...`);
      const result = spawnSync("gh", args, { encoding: "utf-8" });
      if (result.status !== 0) {
        console.error(`Error creating issue for ${issue.id}: ${result.stderr}`);
      } else {
        console.log(`Success: ${result.stdout.trim()}`);
      }
    } else {
      console.log(`[DRY RUN] gh issue create --title "${title}" --body "..."`);
    }
  }

  if (!confirm) {
    console.log("\nDry run complete. Use --confirm to actually file the issues.");
  }
}

main();
