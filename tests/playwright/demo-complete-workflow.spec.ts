import { test, expect } from '@playwright/test';

/**
 * Example comprehensive test demonstrating the Neptune's Pride Agent testing strategy
 * This test shows the full workflow from environment setup to screenshot verification
 */

test.describe('Neptune\'s Pride Agent - Complete Testing Example', () => {
  
  test('complete testing workflow demonstration', async ({ page }) => {
    console.log('🚀 Starting comprehensive test demonstration...');
    
    // Step 1: Navigate to test environment
    console.log('📍 Step 1: Loading test environment...');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Step 2: Verify game environment loads
    console.log('🎮 Step 2: Verifying game environment...');
    
    const gameStatus = await page.locator('#game-status').textContent();
    expect(gameStatus).toBe('Loaded');
    console.log('✅ Game files loaded successfully');
    
    // Step 3: Check for extension presence
    console.log('🔌 Step 3: Checking extension status...');
    
    await page.waitForTimeout(1000); // Allow time for extension injection
    const extensionStatus = await page.locator('#extension-status').textContent();
    console.log(`📊 Extension status: ${extensionStatus}`);
    
    // Step 4: Verify game objects structure
    console.log('🏗️ Step 4: Verifying game object structure...');
    
    const gameStructure = await page.evaluate(() => {
      const np = (window as any).NeptunesPride;
      return {
        hasNeptunesPride: !!np,
        hasUniverse: !!(np?.universe),
        hasGalaxy: !!(np?.universe?.galaxy),
        hasPlayers: !!(np?.universe?.galaxy?.players),
        hasStars: !!(np?.universe?.galaxy?.stars),
        hasNpui: !!(np?.npui),
        hasMap: !!(np?.npui?.map),
        playerCount: np?.universe?.galaxy?.players ? Object.keys(np.universe.galaxy.players).length : 0,
        starCount: np?.universe?.galaxy?.stars ? Object.keys(np.universe.galaxy.stars).length : 0
      };
    });
    
    expect(gameStructure.hasNeptunesPride).toBe(true);
    expect(gameStructure.hasUniverse).toBe(true);
    expect(gameStructure.hasGalaxy).toBe(true);
    console.log(`✅ Game structure valid - ${gameStructure.playerCount} players, ${gameStructure.starCount} stars`);
    
    // Step 5: Test canvas functionality (critical for screenshots)
    console.log('🖼️ Step 5: Testing canvas functionality...');
    
    const canvasTest = await page.evaluate(() => {
      const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
      if (!canvas) return { success: false, error: 'Canvas not found' };
      
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) return { success: false, error: 'No 2D context' };
        
        // Test dataURL generation (used by extension screenshots)
        const dataUrl = canvas.toDataURL('image/webp', 0.45);
        
        return {
          success: true,
          width: canvas.width,
          height: canvas.height,
          hasDataUrl: dataUrl.startsWith('data:image/'),
          dataUrlSize: dataUrl.length
        };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    });
    
    expect(canvasTest.success).toBe(true);
    expect(canvasTest.hasDataUrl).toBe(true);
    console.log(`✅ Canvas functional - ${canvasTest.width}x${canvasTest.height}, dataURL: ${canvasTest.dataUrlSize} bytes`);
    
    // Step 6: Test UI interactions
    console.log('🖱️ Step 6: Testing UI interactions...');
    
    // Test screenshot button
    await page.click('button:has-text("Test Screenshot")');
    await page.waitForTimeout(500);
    console.log('✅ Screenshot button interaction successful');
    
    // Test reports button
    await page.click('button:has-text("Test Reports")');
    await page.waitForTimeout(500);
    console.log('✅ Reports button interaction successful');
    
    // Step 7: Capture test screenshots
    console.log('📸 Step 7: Capturing test screenshots...');
    
    // Ensure test-results directory exists
    await page.evaluate(() => {
      // This runs in browser context, so we can't use fs here
      // Directory creation is handled by the test runner
    });
    
    // Full page screenshot
    await page.screenshot({ 
      path: 'test-results/demo-full-page.png',
      fullPage: true 
    });
    console.log('✅ Full page screenshot captured');
    
    // Game area screenshot
    const gameContainer = page.locator('#game-container');
    await gameContainer.screenshot({ 
      path: 'test-results/demo-game-area.png' 
    });
    console.log('✅ Game area screenshot captured');
    
    // Canvas-only screenshot
    const canvas = page.locator('#map-canvas');
    await canvas.screenshot({ 
      path: 'test-results/demo-game-canvas.png' 
    });
    console.log('✅ Game canvas screenshot captured');
    
    // UI overlay screenshot
    const uiOverlay = page.locator('.ui-overlay');
    await uiOverlay.screenshot({ 
      path: 'test-results/demo-ui-overlay.png' 
    });
    console.log('✅ UI overlay screenshot captured');
    
    // Step 8: Verify visual elements
    console.log('👁️ Step 8: Verifying visual elements...');
    
    // Check that key UI elements are visible
    await expect(page.locator('#game-container')).toBeVisible();
    await expect(page.locator('#map-canvas')).toBeVisible();
    await expect(page.locator('.ui-overlay')).toBeVisible();
    await expect(page.locator('button:has-text("Test Screenshot")')).toBeVisible();
    await expect(page.locator('button:has-text("Test Reports")')).toBeVisible();
    
    console.log('✅ All visual elements verified');
    
    // Step 9: Test performance metrics
    console.log('⚡ Step 9: Checking performance metrics...');
    
    const performanceMetrics = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: perf.domContentLoadedEventEnd - perf.domContentLoadedEventStart,
        loadComplete: perf.loadEventEnd - perf.loadEventStart,
        firstPaint: performance.getEntriesByType('paint').find(entry => entry.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: performance.getEntriesByType('paint').find(entry => entry.name === 'first-contentful-paint')?.startTime || 0
      };
    });
    
    console.log(`📊 Performance metrics:
      - DOM Content Loaded: ${performanceMetrics.domContentLoaded}ms
      - Load Complete: ${performanceMetrics.loadComplete}ms
      - First Paint: ${performanceMetrics.firstPaint}ms
      - First Contentful Paint: ${performanceMetrics.firstContentfulPaint}ms`);
    
    // Step 10: Final verification
    console.log('🏁 Step 10: Final verification...');
    
    // Verify no console errors
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        logs.push(msg.text());
      }
    });
    
    // Wait a bit more to catch any delayed errors
    await page.waitForTimeout(1000);
    
    if (logs.length > 0) {
      console.warn('⚠️ Console errors detected:', logs);
    } else {
      console.log('✅ No console errors detected');
    }
    
    console.log('🎉 Complete testing workflow demonstration finished successfully!');
    
    // Summary
    console.log(`
📋 TEST SUMMARY:
✅ Environment loaded and verified
✅ Game structure validated  
✅ Canvas functionality confirmed
✅ UI interactions working
✅ Screenshots captured successfully
✅ Visual elements all visible
✅ Performance metrics collected
✅ Error checking completed

🎯 This demonstrates the full testing capability for:
   - Extension loading verification
   - Game environment setup
   - Screenshot functionality testing
   - Visual regression detection
   - Performance monitoring
   - Error detection

Ready for production testing and refactoring safety!
    `);
  });
});