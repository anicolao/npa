'use strict';

let registered = null;

async function loadNPA() {
  if (registered) {
    await registered.unregister();
    registered = null;
  }

  registered = await browser.userScripts.register({
    matches: ["https://np.ironhelmet.com/*"],
    js: [{code: `
      const script = document.createElement('script');
      script.src = 'https://bitbucket.org/osrictheknight/iosnpagent/raw/HEAD/intel.js';
      script.async = true;
      script.onerror = () => {
        console.log('Error loading NPA');
      };
      document.body.appendChild(script);
`}],
    scriptMetadata: {userScriptID: "NPA"},
  });
}

loadNPA();
