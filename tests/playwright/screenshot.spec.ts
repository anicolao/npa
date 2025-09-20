import { test, expect } from '@playwright/test';
import { chromium, type BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Screenshot functionality tests
 * Tests the extension's ability to capture and handle screenshots
 * of the game map, which is a core feature for sharing intel.
 */

test.describe('Screenshot Functionality', () => {
  let context: BrowserContext;
  let extensionPath: string;

  test.beforeAll(async () => {
    extensionPath = path.join(__dirname, '../../dist');
    
    if (!fs.existsSync(extensionPath)) {
      console.warn(`Extension not found at ${extensionPath}. Some tests may fail.`);
    }
  });

  test.beforeEach(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
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

  test('should display screenshot test button', async () => {
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check that screenshot test button exists
    const screenshotButton = page.locator('button:has-text("Test Screenshot")');
    await expect(screenshotButton).toBeVisible();
    
    // Take screenshot showing the test interface
    await page.screenshot({ path: 'test-results/screenshot-interface.png' });
  });

  test('should handle screenshot button click', async () => {
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Monitor console logs for screenshot activity
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });
    
    // Click screenshot test button
    await page.click('button:has-text("Test Screenshot")');
    await page.waitForTimeout(500);
    
    // Verify that screenshot function was called
    expect(consoleLogs.some(log => 
      log.includes('Testing screenshot') || 
      log.includes('screenshot')
    )).toBe(true);
    
    // Check if extension status changed
    const extensionStatus = await page.locator('#extension-status').textContent();
    // Should either show "Testing screenshot..." or remain as previous status
    expect(extensionStatus).toBeTruthy();
  });

  test('should verify canvas exists for screenshot capture', async () => {
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Verify the map canvas exists and has content
    const canvasInfo = await page.evaluate(() => {
      const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
      if (!canvas) return { exists: false };
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return { exists: true, hasContext: false };
      
      // Check if canvas has any content (not just transparent pixels)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const hasContent = imageData.data.some((value, index) => {
        // Check alpha channel (every 4th value) or RGB values
        return index % 4 === 3 ? value > 0 : value > 0;
      });
      
      return {
        exists: true,
        hasContext: true,
        width: canvas.width,
        height: canvas.height,
        hasContent,
        canvasType: canvas.tagName,
        contextType: ctx.constructor.name
      };
    });
    
    expect(canvasInfo.exists).toBe(true);
    expect(canvasInfo.hasContext).toBe(true);
    expect(canvasInfo.width).toBeGreaterThan(0);
    expect(canvasInfo.height).toBeGreaterThan(0);
    expect(canvasInfo.hasContent).toBe(true);
    
    // Take screenshot of the canvas area
    const canvas = page.locator('#map-canvas');
    await canvas.screenshot({ path: 'test-results/game-canvas.png' });
  });

  test('should test canvas to dataURL functionality', async () => {
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500); // Wait for canvas to be drawn
    
    // Test canvas.toDataURL which is used by the extension's screenshot function
    const dataUrlTest = await page.evaluate(() => {
      const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
      if (!canvas) return { success: false, error: 'Canvas not found' };
      
      try {
        const dataUrl = canvas.toDataURL('image/webp', 0.45);
        return {
          success: true,
          hasDataUrl: dataUrl.startsWith('data:image/'),
          dataUrlLength: dataUrl.length,
          format: dataUrl.substring(0, 30) + '...'
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });
    
    expect(dataUrlTest.success).toBe(true);
    expect(dataUrlTest.hasDataUrl).toBe(true);
    expect(dataUrlTest.dataUrlLength).toBeGreaterThan(100); // Should have substantial content
    
    console.log('Canvas dataURL test:', dataUrlTest);
  });

  test('should verify Neptune\'s Pride map structure for screenshot', async () => {
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Check the specific structure the extension expects for screenshots
    const mapStructure = await page.evaluate(() => {
      const np = (window as any).NeptunesPride;
      if (!np) return { hasNeptunesPride: false };
      
      return {
        hasNeptunesPride: true,
        hasNpui: !!np.npui,
        hasMap: !!(np.npui && np.npui.map),
        hasCanvas: !!(np.npui && np.npui.map && np.npui.map.canvas),
        canvasArray: !!(np.npui && np.npui.map && np.npui.map.canvas && Array.isArray(np.npui.map.canvas)),
        canvasCount: np.npui && np.npui.map && np.npui.map.canvas ? np.npui.map.canvas.length : 0,
        firstCanvasExists: !!(np.npui && np.npui.map && np.npui.map.canvas && np.npui.map.canvas[0])
      };
    });
    
    expect(mapStructure.hasNeptunesPride).toBe(true);
    expect(mapStructure.hasNpui).toBe(true);
    expect(mapStructure.hasMap).toBe(true);
    expect(mapStructure.hasCanvas).toBe(true);
    expect(mapStructure.canvasArray).toBe(true);
    expect(mapStructure.canvasCount).toBeGreaterThan(0);
    expect(mapStructure.firstCanvasExists).toBe(true);
    
    console.log('Map structure for screenshot:', mapStructure);
  });

  test('should capture baseline screenshots for visual regression', async () => {
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Extra time for extension injection
    
    // Create test-results directory if it doesn't exist
    const testResultsDir = 'test-results';
    if (!fs.existsSync(testResultsDir)) {
      fs.mkdirSync(testResultsDir, { recursive: true });
    }
    
    // Take various baseline screenshots
    await page.screenshot({ 
      path: 'test-results/baseline-full-page.png',
      fullPage: true 
    });
    
    await page.screenshot({ 
      path: 'test-results/baseline-viewport.png' 
    });
    
    // Screenshot just the game area
    const gameContainer = page.locator('#game-container');
    await gameContainer.screenshot({ 
      path: 'test-results/baseline-game-container.png' 
    });
    
    // Screenshot just the UI overlay
    const uiOverlay = page.locator('.ui-overlay');
    await uiOverlay.screenshot({ 
      path: 'test-results/baseline-ui-overlay.png' 
    });
    
    console.log('Baseline screenshots captured for visual regression testing');
  });
});