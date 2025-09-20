// Script to fetch real Neptune's Pride game data for testing
export async function get(url: string, data: any): Promise<Response> {
  const response = await fetch(`${url}?osric_laptop&${new URLSearchParams(data).toString()}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    redirect: "follow",
    referrerPolicy: "no-referrer",
  });
  return response.json(); // parses JSON response into native JavaScript objects
}

async function np4api(game: number, apiKey: string) {
	let params = {
		game_number: game,
		api_version: "0.1",
		code: apiKey,
	};
	console.log(`game: ${game} key: ${apiKey}`);
	const api = await get("https://neptunespride4.appspot.com/api", params)
	console.log(JSON.stringify(api));
	return api;
}

// Fetch game data for game 4982 with provided API key
async function fetchGameData() {
	try {
		const gameData = await np4api(4982, "l5EP8dszo3cH");
		// Write to file that the test environment can use
		return gameData;
	} catch (error) {
		console.error("Error fetching game data:", error);
		return null;
	}
}

if (typeof window === 'undefined') {
	// Running in Node.js environment
	if (process.argv.length !== 4) {
		console.error("usage: bun index.ts [GAME_ID] [API_KEY]");
		console.error("or: tsx index.ts [GAME_ID] [API_KEY]");
	} else {
		np4api(parseInt(process.argv[2]), process.argv[3]);
	}
} else {
	// Running in browser environment
	window.fetchGameData = fetchGameData;
}