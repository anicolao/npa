import * as fs from "node:fs";
import * as path from "node:path";
import type { Page, PageScreenshotOptions, TestInfo } from "@playwright/test";

export interface Verification {
  spec: string;
  check: () => Promise<void>;
}

export interface StepDocumentation {
  summary: string;
  howToUse: string[];
  expectedResult: string[];
  caveats?: string[];
}

export interface StepOptions {
  description: string;
  verifications: Verification[];
  documentation: StepDocumentation;
  screenshot?: Omit<PageScreenshotOptions, "path">;
  beforeScreenshot?: () => Promise<void>;
}

export interface ScenarioMetadata {
  title: string;
  validationGoal: string;
  docsTitle: string;
  docsSummary: string;
  bookSection: string;
}

interface ArtifactStep {
  title: string;
  image: string;
  specs: string[];
  documentation: StepDocumentation;
}

export async function waitForAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    );
  });
}

export class TestStepHelper {
  private stepCount = 0;
  private steps: ArtifactStep[] = [];
  private metadata?: ScenarioMetadata;

  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
  ) {
    const screenshotDir = path.join(this.getScenarioDir(), "screenshots");
    if (fs.existsSync(screenshotDir)) {
      const files = fs.readdirSync(screenshotDir);
      for (const file of files) {
        if (file.endsWith(".png")) {
          fs.unlinkSync(path.join(screenshotDir, file));
        }
      }
    }
  }

  setMetadata(metadata: ScenarioMetadata): void {
    this.metadata = metadata;
  }

  async step(id: string, options: StepOptions): Promise<void> {
    for (const verification of options.verifications) {
      await verification.check();
    }

    const filename = `${String(this.stepCount).padStart(3, "0")}-${slugify(id)}.png`;
    this.stepCount += 1;

    const screenshotDir = path.join(this.getScenarioDir(), "screenshots");
    fs.mkdirSync(screenshotDir, { recursive: true });

    await waitForAnimations(this.page);

    // Hide Playwright's own actionability/recording overlays if present
    await this.page.addStyleTag({
      content: `
        #pw-recorder-root, 
        .playwright-highlight,
        [data-pw-highlight],
        .ui-overlay {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `,
    });

    await options.beforeScreenshot?.();

    await this.page.screenshot({
      path: path.join(screenshotDir, filename),
      ...options.screenshot,
    });

    this.steps.push({
      title: options.description,
      image: filename,
      specs: options.verifications.map((verification) => verification.spec),
      documentation: options.documentation,
    });
  }

  generateArtifacts(): void {
    const metadata = this.requireMetadata();
    const scenarioDir = this.getScenarioDir();

    fs.writeFileSync(
      path.join(scenarioDir, "README.md"),
      this.buildReadme(metadata),
      "utf8",
    );
    fs.writeFileSync(
      path.join(scenarioDir, "DOCS.md"),
      this.buildDocs(metadata),
      "utf8",
    );
  }

  generateDocs(): void {
    this.generateArtifacts();
  }

  private buildReadme(metadata: ScenarioMetadata): string {
    const lines: string[] = [
      `# ${metadata.title}`,
      "",
      metadata.validationGoal,
      "",
      `Documentation target: \`${metadata.bookSection}\``,
      "",
      `Companion user documentation: [DOCS.md](./DOCS.md)`,
      "",
    ];

    for (const step of this.steps) {
      lines.push(`## ${step.title}`);
      lines.push("");
      lines.push(`![${step.title}](./screenshots/${step.image})`);
      lines.push("");
      lines.push("### Verifications");
      for (const spec of step.specs) {
        lines.push(`- [x] ${spec}`);
      }
      lines.push("");
    }

    return `${lines.join("\n")}\n`;
  }

  private buildDocs(metadata: ScenarioMetadata): string {
    const lines: string[] = [
      `# ${metadata.docsTitle}`,
      "",
      metadata.docsSummary,
      "",
      `Book section: \`${metadata.bookSection}\``,
      "",
    ];

    for (const step of this.steps) {
      lines.push(`## ${step.title}`);
      lines.push("");
      lines.push(step.documentation.summary);
      lines.push("");
      lines.push(`![${step.title}](./screenshots/${step.image})`);
      lines.push("");
      lines.push("### How to use it");
      for (const item of step.documentation.howToUse) {
        lines.push(`- ${item}`);
      }
      lines.push("");
      lines.push("### What to expect");
      for (const item of step.documentation.expectedResult) {
        lines.push(`- ${item}`);
      }
      if (step.documentation.caveats?.length) {
        lines.push("");
        lines.push("### Caveats");
        for (const item of step.documentation.caveats) {
          lines.push(`- ${item}`);
        }
      }
      lines.push("");
    }

    return `${lines.join("\n")}\n`;
  }

  private getScenarioDir(): string {
    const testFile = this.testInfo.file;
    const absoluteTestFile = path.isAbsolute(testFile)
      ? testFile
      : path.join(process.cwd(), testFile);
    return path.dirname(absoluteTestFile);
  }

  private requireMetadata(): ScenarioMetadata {
    if (!this.metadata) {
      throw new Error(
        "TestStepHelper metadata must be set before generating artifacts.",
      );
    }

    return this.metadata;
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
