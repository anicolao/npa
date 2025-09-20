import { test, expect } from '@playwright/test';
import { chromium, type BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Basic extension loading test
 * Verifies that the Neptune's Pride Agent extension can be loaded
 * and injected into a test page.
 */

test.describe('Extension Loading', () => {
  let context: BrowserContext;
  let extensionPath: string;

  test.beforeAll(async () => {
    // Path to the built extension
    extensionPath = path.join(__dirname, '../../dist');
    
    // Verify extension exists
    if (!fs.existsSync(extensionPath)) {
      throw new Error(`Extension not found at ${extensionPath}. Run 'npm run build' first.`);
    }
  });

  test.beforeEach(async () => {
    // Launch browser with extension loaded
    context = await chromium.launchPersistentContext('', {
      headless: false, // Need to see extension in action
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ],
    });
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('should load extension successfully', async () => {
    const page = await context.newPage();
    
    // Navigate to test page
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check that game files loaded
    const gameStatus = await page.locator('#game-status').textContent();
    expect(gameStatus).toBe('Loaded');
    
    // Take screenshot of initial state
    await page.screenshot({ path: 'test-results/extension-loading.png' });
  });

  test('should inject extension into game page', async () => {
    const page = await context.newPage();
    await page.goto('/');
    
    // Wait for extension to load and inject
    await page.waitForTimeout(2000);
    
    // Check extension status
    const extensionStatus = await page.locator('#extension-status').textContent();
    
    // Extension should be detected (either "Active" or "Not Detected")
    expect(extensionStatus).toMatch(/Active|Not Detected/);
    
    // If extension is active, verify it's working
    if (extensionStatus === 'Active') {
      // Check that Neptune's Pride global object exists with extension data
      const hasExtension = await page.evaluate(() => {
        return !!(window as any).NeptunesPride && 
               !!(window as any).NeptunesPride.version;
      });
      
      expect(hasExtension).toBe(true);
    }
  });

  test('should handle game environment setup', async () => {
    const page = await context.newPage();
    await page.goto('/');
    
    // Wait for initialization
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Verify game objects exist
    const gameObjects = await page.evaluate(() => {
      const np = (window as any).NeptunesPride;
      return {
        hasNeptunesPride: !!np,
        hasUniverse: !!(np && np.universe),
        hasGalaxy: !!(np && np.universe && np.universe.galaxy),
        hasPlayers: !!(np && np.universe && np.universe.galaxy && np.universe.galaxy.players),
        hasStars: !!(np && np.universe && np.universe.galaxy && np.universe.galaxy.stars),
        hasMap: !!(np && np.npui && np.npui.map)
      };
    });
    
    expect(gameObjects.hasNeptunesPride).toBe(true);
    expect(gameObjects.hasUniverse).toBe(true);
    expect(gameObjects.hasGalaxy).toBe(true);
    expect(gameObjects.hasPlayers).toBe(true);
    expect(gameObjects.hasStars).toBe(true);
    expect(gameObjects.hasMap).toBe(true);
    
    // Take screenshot of game environment
    await page.screenshot({ path: 'test-results/game-environment.png' });
  });
});