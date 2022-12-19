/* global define, Crux, NeptunesPride, Mousetrap, jQuery, Cookies, $ */

const sat_version = "2.21"

const stripHtml = (html) => {
	let tmp = document.createElement("DIV");
	tmp.innerHTML = html;
	return tmp.textContent || tmp.innerText || "";
}

const image_url = (str) => {
	let safe_str = stripHtml(str)
	const protocol = "^(https://)"
	const domains = "(i\.ibb\.co/|i.imgur.com/)"
	const content = "([-#/;&_\\w]{1,150})"
	const images = "(.)(gif|jpe?g|tiff?|png|webp|bmp|GIF|JPE?G|TIFF?|PNG|WEBP|BMP)$"
	let regex = new RegExp(protocol + domains + content + images)
	return regex.test(safe_str)
}



//Custom UI ComponentsNe
const PlayerNameIconRowLink = (player) => {
	let playerNameIconRow = Crux.Widget("rel col_black clickable")
		.size(480, 48)

	NeptunesPride.npui.PlayerIcon(player, true)
		.roost(playerNameIconRow);

	Crux.Text("", "section_title")
		.grid(6, 0, 21, 3)
		.rawHTML(`<a onclick="Crux.crux.trigger('show_player_uid', '${player.uid}' )">${player.alias}</a>`)
		.roost(playerNameIconRow);

	return playerNameIconRow;
};



//Get ledger info to see what is owed

const get_hero = () => {
	let gal = NeptunesPride.universe.galaxy
	let player = gal['player_uid']
	return gal.players[Number(player)]
}

const get_ledger = (messages) => {
	let loading = Crux.Text("", "rel txt_center pad12").rawHTML(`Parsing ${messages.length} messages.`)
	loading.roost(NeptunesPride.npui.activeScreen)
	let uid = get_hero().uid
	let ledger = {}
	messages.filter(m => m.payload.template === "money_sent" || m.payload.template === "shared_technology")
		.map(m => m.payload)
		.forEach(m => {
			let liaison = m.from_puid === uid ? m.to_puid : m.from_puid
			let value = m.template === "money_sent" ? m.amount : m.price
			value *= m.from_puid === uid ? 1 : -1 // amount is (+) if credit & (-) if debt
			liaison in ledger ? ledger[liaison] += value : ledger[liaison] = value
		});

	let players = []
	for (const [_key, p] of Object.entries(NeptunesPride.universe.galaxy.players)) {
		p.debt = 0
	}
	for (let uid in ledger) {
		let player = NeptunesPride.universe.galaxy.players[uid]
		player.debt = ledger[uid]
		players.push(player)
	}
	get_hero().ledger = ledger
	return players
}

/*
Ledger Display
*/
//Handler for new message ajax request


const display_tech_trading = () => {
	let npui = NeptunesPride.npui
	var tech_trade_screen = npui.Screen("tech_trading")
	npui.onHideScreen(null, true);
	npui.onHideSelectionMenu();
	npui.trigger("hide_side_menu");
	npui.trigger("reset_edit_mode");
	npui.activeScreen = tech_trade_screen;
	tech_trade_screen.roost(npui.screenContainer);
	npui.layoutElement(tech_trade_screen)

	let trading = Crux.Text("", "rel pad12").rawHTML("Trading..")
	trading.roost(tech_trade_screen)

	tech_trade_screen.transact = (text) => {
		let trading = Crux.Text("", "rel pad8").rawHTML(text)
		trading.roost(tech_trade_screen)
	}
	return tech_trade_screen
}
let cached_events = [];
let cacheFetchStart = new Date();
let cacheFetchSize = 0;

const update_event_cache = (fetchSize, success, error) => {
	const count = cached_events.length > 0 ? fetchSize : 100000;

	cacheFetchStart = new Date();
	cacheFetchSize = count;

	jQuery.ajax({
		type: 'POST',
		url: "/trequest/fetch_game_messages",
		async: true,
		data: {
			type: "fetch_game_messages",
			count,
			offset: 0,
			group: "game_event",
			version: NeptunesPride.version,
			game_number: NeptunesPride.gameNumber
		},
		success,
		error,
		dataType: "json"
	});
}
const recieve_new_messages = (response) => {
	const cacheFetchEnd = new Date();
	const elapsed = cacheFetchEnd.getTime() - cacheFetchStart.getTime();
	console.log(`Fetched ${cacheFetchSize} events in ${elapsed}ms`);

	const npui = NeptunesPride.npui
	const universe = NeptunesPride.universe
	let incoming = response.report.messages;
	if (cached_events.length > 0) {
		let overlapOffset = -1;
		for (let i = 0; i < incoming.length; ++i) {
			const message = incoming[i];
			if (message.key === cached_events[0].key) {
				overlapOffset = i;
				break;
			}
		}
		if (overlapOffset >= 0) {
			incoming = incoming.slice(0, overlapOffset);
		} else if (overlapOffset < 0) {
			const size = incoming.length * 2;
			console.log(`Missing some events, double fetch to ${size}`);
			update_event_cache(size, recieve_new_messages, console.error);
			return;
		}

		// we had cached events, but want to be extra paranoid about
		// correctness. So if the response contained the entire event
		// log, validate that it exactly matches the cached events.
		if (response.report.messages.length === cached_events.length) {
			console.log("*** Validating cached_events ***");
			const valid = response.report.messages;
			let invalidEntries = cached_events.filter((e, i) => e.key !== valid[i].key);
			if (invalidEntries.length) {
				console.error("!! Invalid entries found: ", invalidEntries);
			}
			console.log("*** Validation Completed ***");
		} else {
			// the response didn't contain the entire event log. Go fetch
			// a version that _does_.
			update_event_cache(100000, recieve_new_messages, console.error);
		}
	}
	cached_events = incoming.concat(cached_events);
	const players = get_ledger(cached_events);

	const ledgerScreen = npui.ledgerScreen();

	npui.onHideScreen(null, true);
	npui.onHideSelectionMenu();
	npui.trigger("hide_side_menu");
	npui.trigger("reset_edit_mode");
	npui.activeScreen = ledgerScreen;
	ledgerScreen.roost(npui.screenContainer);
	npui.layoutElement(ledgerScreen)

	players.forEach(p => {
		let player = PlayerNameIconRowLink(universe.galaxy.players[p.uid]).roost(npui.activeScreen);
		player.addStyle("player_cell")
		let prompt = p.debt > 0 ? "They owe" : "You owe"
		if (p.debt === 0) {
			prompt = "Balance"
		}
		if (p.debt < 0) {
			Crux.Text("", "pad12 txt_right red-text")
				.rawHTML(`${prompt}: ${p.debt}`)
				.grid(20, 0, 10, 3)
				.roost(player);
			// rome-ignore lint/complexity/useSimplifiedLogicExpression: @Lorentz?
			if (true || p.debt * -1 <= get_hero().cash) {
				Crux.Button("forgive", "forgive_debt", { targetPlayer: p.uid })
					.grid(17, 0, 6, 3)
					.roost(player);
			}
		} else if (p.debt > 0) {
			Crux.Text("", "pad12 txt_right blue-text")
				.rawHTML(`${prompt}: ${p.debt}`)
				.grid(20, 0, 10, 3)
				.roost(player);
		} else if (p.debt === 0) {
			Crux.Text("", "pad12 txt_right orange-text")
				.rawHTML(`${prompt}: ${p.debt}`)
				.grid(20, 0, 10, 3)
				.roost(player);
		}
	})
}

const renderLedger = () => {
	Mousetrap.bind(["m", "M"], function () { NeptunesPride.np.trigger("trigger_ledger"); });
	const np = NeptunesPride.np
	const npui = NeptunesPride.npui
	const universe = NeptunesPride.universe
	NeptunesPride.templates["ledger"] = "Ledger";
	NeptunesPride.templates["tech_trading"] = "Trading Technology"
	NeptunesPride.templates["forgive"] = "Pay Debt";
	NeptunesPride.templates["forgive_debt"] = "Are you sure you want to forgive this debt?"
	if (!npui.hasmenuitem) {
		npui.SideMenuItem("icon-database", "ledger", "trigger_ledger").roost(npui.sideMenu);
		npui.hasmenuitem = true
	}
	npui.ledgerScreen = (_config) => { return npui.Screen("ledger") };
	NeptunesPride.np.on('trigger_ledger', () => {
		const ledgerScreen = npui.ledgerScreen();
		let loading = Crux.Text("", "rel txt_center pad12 section_title").rawHTML("Tabulating Ledger...")
		loading.roost(ledgerScreen)

		npui.onHideScreen(null, true);
		npui.onHideSelectionMenu();
		npui.trigger("hide_side_menu");
		npui.trigger("reset_edit_mode");
		npui.activeScreen = ledgerScreen;
		ledgerScreen.roost(npui.screenContainer);
		npui.layoutElement(ledgerScreen)

		update_event_cache(4, recieve_new_messages, console.error);
	})

	np.onForgiveDebt = function (event, data) {
		let targetPlayer = data.targetPlayer;
		let player = universe.galaxy.players[targetPlayer]
		let amount = player.debt * -1
		//let amount = 1
		universe.player.ledger[targetPlayer] = 0;
		np.trigger("show_screen", ["confirm", {
			message: "forgive_debt",
			eventKind: 'confirm_forgive_debt',
			eventData: { type: "order", order: `send_money,${targetPlayer},${amount}` }
		}]);
	};
	np.on("confirm_forgive_debt", (event, data) => {
		np.trigger("server_request", data)
		np.trigger("trigger_ledger")
	})
	np.on("forgive_debt", np.onForgiveDebt);
}


const _get_star_gis = () => {
	let stars = NeptunesPride.universe.galaxy.stars;
	let output = [];
	for (const s in stars) {
		let star = stars[s]
		output.push({
			x: star.x,
			y: star.y,
			owner: star.qualifiedAlias,
			economy: star.e,
			industry: star.i,
			science: star.s,
			ships: star.totalDefenses
		})
	}
	return output
}


const get_research = () => {
	let hero = get_hero()
	let science = hero.total_science

	//Current Science
	let current = hero.tech[hero.researching]
	let current_points_remaining = current['brr'] * current['level'] - current['research']
	let eta = Math.ceil(current_points_remaining / science) //Hours

	//Next science
	let next = hero.tech[hero.researching_next]
	let next_points_remaining = next['brr'] * next['level'] - next['research']
	let next_eta = Math.ceil(next_points_remaining / science) + eta
	let next_level = next['level'] + 1
	if (hero.researching === hero.researching_next) {
		//Recurring research
		next_points_remaining += next['brr']
		next_eta = Math.ceil((next['brr'] * next['level'] + 1) / science) + eta
		next_level += 1
	}
	let name_map = {
		scanning: 'Scanning',
		propulsion: 'Hyperspace Range',
		terraforming: 'Terraforming',
		research: 'Experimentation',
		weapons: 'Weapons',
		banking: 'Banking',
		manufacturing: 'Manufacturing'
	}

	return {
		current_name: name_map[hero.researching],
		current_level: current['level'] + 1,
		current_eta: eta,
		next_name: name_map[hero.researching_next],
		next_level: next_level,
		next_eta: next_eta,
		science: science
	}
}

const get_research_text = () => {
	const research = get_research()
	let first_line = `Now: ${research['current_name']} ${research['current_level']} - ${research['current_eta']} ticks.`
	let second_line = `Next: ${research['next_name']} ${research['next_level']} - ${research['next_eta']} ticks.`
	let third_line = `My Science: ${research['science']}`
	return `${first_line}\n${second_line}\n${third_line}\n`
}

const _get_weapons_next = () => {
	const research = get_research()
	if (research['current_name'] === 'Weapons') {
		return research['current_eta']
	} else if (research['next_name'] === 'Weapons') {
		return research['next_eta']
	}
	return 10 ** 10
}


const get_tech_trade_cost = (from, to, tech_name = null) => {
	let total_cost = 0;
	for (const [tech, value] of Object.entries(to.tech)) {
		if (tech_name == null || tech_name === tech) {
			let me = from.tech[tech].level;
			let you = value.level
			for (let i = 1; i <= me - you; ++i) {
				//console.log(tech,(you+i),(you+i)*15)
				total_cost += (you + i) * NeptunesPride.gameConfig.tradeCost
			}
		}
	}
	return total_cost
}
const apply_hooks = () => {
	NeptunesPride.np.on("share_all_tech", (event, player) => {
		let total_cost = get_tech_trade_cost(get_hero(), player);
		NeptunesPride.templates[`confirm_tech_share_${player.uid}`] = `Are you sure you want to spend $${total_cost} to give ${player.rawAlias} all of your tech?`
		NeptunesPride.np.trigger("show_screen", ["confirm", {
			message: `confirm_tech_share_${player.uid}`,
			eventKind: 'confirm_trade_tech',
			eventData: player,
		}]);
	})
	NeptunesPride.np.on("buy_all_tech", (event, data) => {
		let player = data.player
		let cost = data.cost
		NeptunesPride.templates[`confirm_tech_share_${player.uid}`] = `Are you sure you want to spend $${cost} to buy all of ${player.rawAlias}'s tech? It is up to them to actually send it to you.`
		NeptunesPride.np.trigger("show_screen", ["confirm", {
			message: `confirm_tech_share_${player.uid}`,
			eventKind: 'confirm_buy_tech',
			eventData: data,
		}]);
	})
	NeptunesPride.np.on("buy_one_tech", (event, data) => {
		let player = data.player
		let tech = data.tech
		let cost = data.cost
		console.log(player)
		NeptunesPride.templates[`confirm_tech_share_${player.uid}`] = `Are you sure you want to spend $${cost} to buy ${tech} from ${player.rawAlias}? It is up to them to actually send it to you.`
		NeptunesPride.np.trigger("show_screen", ["confirm", {
			message: `confirm_tech_share_${player.uid}`,
			eventKind: 'confirm_buy_tech',
			eventData: data,
		}]);
	})
	NeptunesPride.np.on("confirm_trade_tech", (even, player) => {
		let hero = get_hero()
		let display = display_tech_trading()
		const close = () => {
			NeptunesPride.universe.selectPlayer(player);
			NeptunesPride.np.trigger("refresh_interface");
			NeptunesPride.np.npui.refreshTurnManager();
		}
		let offset = 300
		for (const [tech, value] of Object.entries(player.tech)) {
			let me = hero.tech[tech].level;
			let you = value.level
			for (let i = 1; i <= me - you; ++i) {
				setTimeout(() => {
					console.log(me - you, { type: "order", order: `share_tech,${player.uid},${tech}` })
					display.transact(`Sending ${tech} level ${you + i}`)
					NeptunesPride.np.trigger("server_request", { type: "order", order: `share_tech,${player.uid},${tech}` });
					if (i === me - you) {
						display.transact("Done.")
					}
				}, offset)
				offset += 1000
			}
		}
		setTimeout(close, offset + 1000)
	})

	//Pays a player a certain amount 
	NeptunesPride.np.on("confirm_buy_tech", (even, data) => {
		let player = data.player
		NeptunesPride.np.trigger("server_request", { type: "order", order: `send_money,${player.uid},${data.cost}` });
		NeptunesPride.universe.selectPlayer(player);
		NeptunesPride.np.trigger("refresh_interface");
	})
}

const _wide_view = () => {
	NeptunesPride.np.trigger("map_center_slide", { x: 0, y: 0 });
	NeptunesPride.np.trigger("zoom_minimap");
}

function NeptunesPrideAgent() {
	let title = (document?.currentScript?.title) || `SAT ${sat_version}`;
	let version = title.replace(/^.*v/, 'v');
	console.log(title);

	var lastClip = "Error";
	let clip = function (text) {
		lastClip = text;
	}

	let copy = function (reportFn) {
		return function () {
			reportFn();
			navigator.clipboard.writeText(lastClip);
		}
	}

	let hotkeys = [];
	let hotkey = function (key, action) {
		hotkeys.push([key, action]);
		Mousetrap.bind(key, copy(action));
	}

	if (!String.prototype.format) {
		String.prototype.format = function (...args) {
			return this.replace(/{(\d+)}/g, function (match, number) {
				if (typeof args[number] === 'number') {
					return Math.trunc(args[number] * 1000) / 1000;
				}
				return typeof args[number] !== 'undefined'
					? args[number]
					: match
					;
			});
		};
	}



	const linkFleets = function () {
		let universe = NeptunesPride.universe;
		let fleets = NeptunesPride.universe.galaxy.fleets;

		for (const f in fleets) {
			let fleet = fleets[f];
			let fleetLink = `<a onClick='Crux.crux.trigger(\"show_fleet_uid\", \"${fleet.uid}\")'>${fleet.n}</a>`;
			universe.hyperlinkedMessageInserts[fleet.n] = fleetLink;
		}
	};

	function starReport() {
		let players = NeptunesPride.universe.galaxy.players;
		let stars = NeptunesPride.universe.galaxy.stars;

		let output = [];
		for (const p in players) {
			output.push("[[{0}]]".format(p));
			for (const s in stars) {
				let star = stars[s];
				if (star.puid === p && star.shipsPerTick >= 0) {
					output.push("  [[{0}]] {1}/{2}/{3} {4} ships".format(star.n, star.e, star.i, star.s, star.totalDefenses));
				}
			}
		}
		clip(output.join("\n"));
	};
	hotkey("*", starReport);
	starReport.help = "Generate a report on all stars in your scanning range, and copy it to the clipboard." +
		"<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.";

	let ampm = function (h, m) {
		if (m < 10)
			m = `0${m}`;
		if (h < 12) {
			if (h === 0) h = 12;
			return "{0}:{1} AM".format(h, m);
		} else if (h > 12) {
			return "{0}:{1} PM".format(h - 12, m);
		}
		return "{0}:{1} PM".format(h, m);
	}

	let msToTick = function (tick, wholeTime) {
		let universe = NeptunesPride.universe;
		var ms_since_data = 0;
		var tf = universe.galaxy.tick_fragment;
		var ltc = universe.locTimeCorrection;

		if (!universe.galaxy.paused) {
			ms_since_data = new Date().valueOf() - universe.now.valueOf();
		}

		if (wholeTime || universe.galaxy.turn_based) {
			ms_since_data = 0;
			tf = 0;
			ltc = 0;
		}

		var ms_remaining = (tick * 1000 * 60 * universe.galaxy.tick_rate) -
			(tf * 1000 * 60 * universe.galaxy.tick_rate) -
			ms_since_data - ltc;
		return ms_remaining;
	}

	let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	let msToEtaString = function (msplus, prefix) {
		let now = new Date();
		let arrival = new Date(now.getTime() + msplus);
		let p = prefix !== undefined ? prefix : "ETA ";
		let ttt = p + ampm(arrival.getHours(), arrival.getMinutes());
		if (arrival.getDay() !== now.getDay())
			ttt = `${p}${days[arrival.getDay()]} @ ${ampm(arrival.getHours(), arrival.getMinutes())}`;
		return ttt;
	}
	let tickToEtaString = function (tick, prefix) {
		let msplus = msToTick(tick);
		return msToEtaString(msplus, prefix);
	}

	let fleetOutcomes = {};
	let combatHandicap = 0;
	let combatOutcomes = function () {
		let universe = NeptunesPride.universe;
		let players = NeptunesPride.universe.galaxy.players;
		let fleets = NeptunesPride.universe.galaxy.fleets;
		let stars = NeptunesPride.universe.galaxy.stars;
		let flights = [];
		fleetOutcomes = {};
		for (const f in fleets) {
			let fleet = fleets[f];
			if (fleet.o && fleet.o.length > 0) {
				let stop = fleet.o[0][1];
				let ticks = fleet.etaFirst;
				let starname = stars[stop]?.n;
				if (!starname) {
					continue;
				}
				flights.push([ticks, "[[{0}]] [[{1}]] {2} → [[{3}]] {4}".format(
					fleet.puid, fleet.n, fleet.st, starname, tickToEtaString(ticks)
				), fleet]);
			}
		}
		flights = flights.sort(function (a, b) { return a[0] - b[0]; });
		let arrivals = {};
		let output = [];
		let arrivalTimes = [];
		let starstate = {};
		for (const i in flights) {
			let fleet = flights[i][2];
			if (fleet.orbiting) {
				let orbit = fleet.orbiting.uid;
				if (!starstate[orbit]) {
					starstate[orbit] = { last_updated: 0, ships: stars[orbit].totalDefenses, puid: stars[orbit].puid, c: stars[orbit].c };
				}
				// This fleet is departing this tick; remove it from the origin star's totalDefenses
				starstate[orbit].ships -= fleet.st;
			}
			if (arrivalTimes.length === 0 || arrivalTimes[arrivalTimes.length - 1] !== flights[i][0]) {
				arrivalTimes.push(flights[i][0]);
			}
			let arrivalKey = [flights[i][0], fleet.o[0][1]];
			if (arrivals[arrivalKey] !== undefined) {
				arrivals[arrivalKey].push(fleet);
			} else {
				arrivals[arrivalKey] = [fleet];
			}
		}
		for (const k in arrivals) {
			let arrival = arrivals[k];
			let ka = k.split(",");
			let tick = ka[0];
			let starId = ka[1];
			if (!starstate[starId]) {
				starstate[starId] = { last_updated: 0, ships: stars[starId].totalDefenses, puid: stars[starId].puid, c: stars[starId].c };
			}
			if (starstate[starId].puid === -1) {
				// assign ownership of the star to the player whose fleet has traveled the least distance
				let minDistance = 10000;
				let owner = -1;
				for (const i in arrival) {
					let fleet = arrival[i];
					let d = universe.distance(stars[starId].x, stars[starId].y, fleet.lx, fleet.ly);
					if (d < minDistance || owner === -1) {
						owner = fleet.puid;
						minDistance = d;
					}
				}
				starstate[starId].puid = owner;
			}
			output.push("{0}: [[{1}]] [[{2}]] {3} ships".format(tickToEtaString(tick, "@"), starstate[starId].puid, stars[starId].n, starstate[starId].ships))
			let tickDelta = tick - starstate[starId].last_updated - 1;
			if (tickDelta > 0) {
				let oldShips = starstate[starId].ships;
				starstate[starId].last_updated = tick - 1;
				if (stars[starId].shipsPerTick) {
					let oldc = starstate[starId].c;
					starstate[starId].ships += stars[starId].shipsPerTick * tickDelta + oldc;
					starstate[starId].c = starstate[starId].ships - Math.trunc(starstate[starId].ships);
					starstate[starId].ships -= starstate[starId].c;
					output.push("  {0}+{3} + {2}/h = {1}+{4}".format(oldShips, starstate[starId].ships, stars[starId].shipsPerTick, oldc, starstate[starId].c));
				}
			}
			for (const i in arrival) {
				let fleet = arrival[i];
				if (fleet.puid === starstate[starId].puid || starstate[starId].puid === -1) {
					let oldShips = starstate[starId].ships;
					if (starstate[starId].puid === -1) {
						starstate[starId].ships = fleet.st;
					} else {
						starstate[starId].ships += fleet.st;
					}
					let landingString = "  {0} + {2} on [[{3}]] = {1}".format(oldShips, starstate[starId].ships, fleet.st, fleet.n);
					output.push(landingString);
					landingString = landingString.substring(2);
				}
			}
			for (const i in arrival) {
				let fleet = arrival[i];
				if (fleet.puid === starstate[starId].puid) {
					let outcomeString = "{0} ships on {1}".format(Math.floor(starstate[starId].ships), stars[starId].n);
					fleetOutcomes[fleet.uid] = { eta: tickToEtaString(fleet.etaFirst), outcome: outcomeString };
				}
			}
			let awt = 0;
			let offense = 0;
			let contribution = {};
			for (const i in arrival) {
				let fleet = arrival[i];
				if (fleet.puid !== starstate[starId].puid) {
					let olda = offense;
					offense += fleet.st;
					output.push("  [[{4}]]! {0} + {2} on [[{3}]] = {1}".format(olda, offense, fleet.st, fleet.n, fleet.puid));
					contribution[[fleet.puid, fleet.uid]] = fleet.st;
					let wt = players[fleet.puid].tech.weapons.level;
					if (wt > awt) {
						awt = wt;
					}
				}
			}
			let attackersAggregate = offense;
			while (offense > 0) {
				let dwt = players[starstate[starId].puid].tech.weapons.level;
				let defense = starstate[starId].ships;
				output.push("  Combat! [[{0}]] defending".format(starstate[starId].puid));
				output.push("    Defenders {0} ships, WS {1}".format(defense, dwt));
				output.push("    Attackers {0} ships, WS {1}".format(offense, awt));
				dwt += 1;
				if (starstate[starId].puid !== universe.galaxy.player_uid) {
					if (combatHandicap > 0) {
						dwt += combatHandicap;
						output.push("    Defenders WS{0} = {1}".format(handicapString(""), dwt));
					} else {
						awt -= combatHandicap;
						output.push("    Attackers WS{0} = {1}".format(handicapString(""), awt));
					}
				} else {
					if (combatHandicap > 0) {
						awt += combatHandicap;
						output.push("    Attackers WS{0} = {1}".format(handicapString(""), awt));
					} else {
						dwt -= combatHandicap;
						output.push("    Defenders WS{0} = {1}".format(handicapString(""), dwt));
					}
				}

				if (universe.galaxy.player_uid === starstate[starId].puid) {
					// truncate defense if we're defending to give the most
					// conservative estimate
					defense = Math.trunc(defense);
				}
				while (defense > 0 && offense > 0) {
					offense -= dwt;
					if (offense <= 0) break;
					defense -= awt;
				}

				let newAggregate = 0;
				let playerContribution = {};
				let biggestPlayer = -1;
				let biggestPlayerId = starstate[starId].puid;
				if (offense > 0) {
					output.push("  Attackers win with {0} ships remaining".format(offense));
					for (const k in contribution) {
						let ka = k.split(",");
						let fleet = fleets[ka[1]];
						let playerId = ka[0];
						contribution[k] = offense * contribution[k] / attackersAggregate;
						newAggregate += contribution[k];
						if (playerContribution[playerId]) {
							playerContribution[playerId] += contribution[k];
						} else {
							playerContribution[playerId] = contribution[k];
						}
						if (playerContribution[playerId] > biggestPlayer) {
							biggestPlayer = playerContribution[playerId];
							biggestPlayerId = playerId;
						}
						output.push("    [[{0}]] has {1} on [[{2}]]".format(fleet.puid, contribution[k], fleet.n));
						let outcomeString = "Wins! {0} land.".format(contribution[k]);
						fleetOutcomes[fleet.uid] = { eta: tickToEtaString(fleet.etaFirst), outcome: outcomeString };
					}
					offense = newAggregate - playerContribution[biggestPlayerId];
					starstate[starId].puid = biggestPlayerId;
					starstate[starId].ships = playerContribution[biggestPlayerId];
				} else {
					starstate[starId].ships = defense;
					for (const i in arrival) {
						let fleet = arrival[i];
						if (fleet.puid === starstate[starId].puid) {
							let outcomeString = "{0} ships on {1}".format(Math.floor(starstate[starId].ships), stars[starId].n);
							fleetOutcomes[fleet.uid] = { eta: tickToEtaString(fleet.etaFirst), outcome: outcomeString };
						}
					}
					for (const k in contribution) {
						let ka = k.split(",");
						let fleet = fleets[ka[1]];
						let outcomeString = "Loses! {0} live.".format(defense);
						fleetOutcomes[fleet.uid] = { eta: tickToEtaString(fleet.etaFirst), outcome: outcomeString };
					}
				}
				attackersAggregate = offense;
			}
			output.push("  [[{0}]] [[{1}]] {2} ships".format(starstate[starId].puid, stars[starId].n, starstate[starId].ships));
		}
		return output;
	}

	function incCombatHandicap() {
		combatHandicap += 1;
	}
	function decCombatHandicap() {
		combatHandicap -= 1;
	}
	hotkey(".", incCombatHandicap);
	incCombatHandicap.help = "Change combat calculation to credit your enemies with +1 weapons. Useful " +
		"if you suspect they will have achieved the next level of tech before a battle you are investigating." +
		"<p>In the lower left of the HUD, an indicator will appear reminding you of the weapons adjustment. If the " +
		"indicator already shows an advantage for defenders, this hotkey will reduce that advantage first before crediting " +
		"weapons to your opponent.";
	hotkey(",", decCombatHandicap);
	decCombatHandicap.help = "Change combat calculation to credit yourself with +1 weapons. Useful " +
		"when you will have achieved the next level of tech before a battle you are investigating." +
		"<p>In the lower left of the HUD, an indicator will appear reminding you of the weapons adjustment. When " +
		"indicator already shows an advantage for attackers, this hotkey will reduce that advantage first before crediting " +
		"weapons to you.";

	function longFleetReport() {
		clip(combatOutcomes().join("\n"));
	}
	hotkey("&", longFleetReport);
	longFleetReport.help = "Generate a detailed fleet report on all carriers in your scanning range, and copy it to the clipboard." +
		"<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.";

	function briefFleetReport() {
		let fleets = NeptunesPride.universe.galaxy.fleets;
		let stars = NeptunesPride.universe.galaxy.stars;
		let flights = [];
		for (const f in fleets) {
			let fleet = fleets[f];
			if (fleet.o && fleet.o.length > 0) {
				let stop = fleet.o[0][1];
				let ticks = fleet.etaFirst;
				let starname = stars[stop]?.n;
				if (!starname) continue;
				flights.push([ticks, "[[{0}]] [[{1}]] {2} → [[{3}]] {4}".format(fleet.puid, fleet.n, fleet.st, stars[stop].n, tickToEtaString(ticks, ""))]);
			}
		}
		flights = flights.sort(function (a, b) { return a[0] - b[0]; });
		clip(flights.map(x => x[1]).join("\n"));
	};

	hotkey("^", briefFleetReport);
	briefFleetReport.help = "Generate a summary fleet report on all carriers in your scanning range, and copy it to the clipboard." +
		"<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown.";

	function screenshot() {
		let map = NeptunesPride.npui.map;
		clip(map.canvas[0].toDataURL('image/webp', 0.05));
	}

	hotkey("#", screenshot);
	screenshot.help = "Create a data: URL of the current map. Paste it into a browser window to view. This is likely to be removed.";

	let homePlanets = function () {
		let p = NeptunesPride.universe.galaxy.players;
		let output = [];
		for (let i in p) {
			let home = p[i].home;
			if (home) {
				output.push("Player #{0} is [[{0}]] home {2} [[{1}]]".format(i, home.n, i === home.puid ? "is" : "was"))
			} else {
				output.push("Player #{0} is [[{0}]] home unknown".format(i))
			}
		}
		clip(output.join("\n"));
	}
	hotkey("!", homePlanets);
	homePlanets.help = "Generate a player summary report and copy it to the clipboard." +
		"<p>This same report can also be viewed via the menu; enter the agent and choose it from the dropdown. " +
		"It is most useful for discovering player numbers so that you can write [[#]] to reference a player in mail.";

	let drawOverlayString = function (context, s, x, y, fgColor) {
		context.fillStyle = "#000000";
		for (let smear = 1; smear < 4; ++smear) {
			context.fillText(s, x + smear, y + smear);
			context.fillText(s, x - smear, y + smear);
			context.fillText(s, x - smear, y - smear);
			context.fillText(s, x + smear, y - smear);
		}
		context.fillStyle = fgColor || "#00ff00";
		context.fillText(s, x, y);
	}

	let anyStarCanSee = function (owner, fleet) {
		let stars = NeptunesPride.universe.galaxy.stars;
		let universe = NeptunesPride.universe;
		let scanRange = universe.galaxy.players[owner].tech.scanning.value;
		for (const s in stars) {
			let star = stars[s];
			if (star.puid === owner) {
				let distance = universe.distance(star.x, star.y, fleet.x, fleet.y);
				if (distance <= scanRange) {
					return true;
				}
			}
		}
		return false;
	}

	let hooksLoaded = false;
	let handicapString = function (prefix) {
		let p = prefix !== undefined ? prefix : ((combatHandicap > 0) ? "Enemy WS" : "My WS");;
		return p + (combatHandicap > 0 ? "+" : "") + combatHandicap
	}
	let loadHooks = function () {
		let superDrawText = NeptunesPride.npui.map.drawText;
		NeptunesPride.npui.map.drawText = function () {
			let universe = NeptunesPride.universe;
			let map = NeptunesPride.npui.map;
			superDrawText();

			map.context.font = `${(14 * map.pixelRatio)}px OpenSansRegular, sans-serif`;
			map.context.fillStyle = "#FF0000";
			map.context.textAlign = "right";
			map.context.textBaseline = "middle";
			let v = version;
			if (combatHandicap !== 0) {
				v = `${handicapString()} ${v}`;
			}
			drawOverlayString(map.context, v, map.viewportWidth - 10, map.viewportHeight - 16 * map.pixelRatio);
			if (NeptunesPride.originalPlayer === undefined) {
				NeptunesPride.originalPlayer = universe.player.uid;
			}
			if (NeptunesPride.originalPlayer !== universe.player.uid) {
				let n = universe.galaxy.players[universe.player.uid].alias;
				drawOverlayString(map.context, n, map.viewportWidth - 100, map.viewportHeight - 2 * 16 * map.pixelRatio);
			}

			if (universe.selectedFleet && universe.selectedFleet.path.length > 0) {
				//console.log("Selected fleet", universe.selectedFleet);
				map.context.font = `${(14 * map.pixelRatio)}px OpenSansRegular, sans-serif`;
				map.context.fillStyle = "#FF0000";
				map.context.textAlign = "left";
				map.context.textBaseline = "middle";
				let dy = universe.selectedFleet.y - universe.selectedFleet.ly;
				let dx = universe.selectedFleet.x - universe.selectedFleet.lx;
				dy = universe.selectedFleet.path[0].y - universe.selectedFleet.y;
				dx = universe.selectedFleet.path[0].x - universe.selectedFleet.x;
				let lineHeight = 16 * map.pixelRatio;
				let radius = 2 * 0.028 * map.scale * map.pixelRatio;
				let angle = Math.atan(dy / dx);
				let offsetx = radius * Math.cos(angle);
				let offsety = radius * Math.sin(angle);
				if (offsetx > 0 && dx > 0) {
					offsetx *= -1;
				}
				if (offsety > 0 && dy > 0) {
					offsety *= -1;
				}
				if (offsetx < 0 && dx < 0) {
					offsetx *= -1;
				}
				if (offsety < 0 && dy < 0) {
					offsety *= -1;
				}
				combatOutcomes();
				let s = fleetOutcomes[universe.selectedFleet.uid].eta;
				let o = fleetOutcomes[universe.selectedFleet.uid].outcome;
				let x = map.worldToScreenX(universe.selectedFleet.x) + offsetx;
				let y = map.worldToScreenY(universe.selectedFleet.y) + offsety;
				if (offsetx < 0) {
					map.context.textAlign = "right";
				}
				drawOverlayString(map.context, s, x, y);
				drawOverlayString(map.context, o, x, y + lineHeight);
			}
			if (!NeptunesPride.gameConfig.turnBased && universe.timeToTick(1).length < 3) {
				let lineHeight = 16 * map.pixelRatio;
				map.context.font = `${(14 * map.pixelRatio)}px OpenSansRegular, sans-serif`;
				map.context.fillStyle = "#FF0000";
				map.context.textAlign = "left";
				map.context.textBaseline = "middle";
				let s = "Tick < 10s away!";
				if (universe.timeToTick(1) === '0s') {
					s = "Tick passed. Click production countdown to refresh.";
				}
				drawOverlayString(map.context, s, 1000, lineHeight);
			}
			if (universe.selectedStar && universe.selectedStar.puid !== universe.player.uid && universe.selectedStar.puid !== -1) {
				// enemy star selected; show HUD for scanning visibility
				map.context.textAlign = "left";
				map.context.textBaseline = "middle";
				let xOffset = 26 * map.pixelRatio;
				//map.context.translate(xOffset, 0);
				let fleets = NeptunesPride.universe.galaxy.fleets;
				for (const f in fleets) {
					let fleet = fleets[f];
					if (fleet.puid === universe.player.uid) {
						let dx = universe.selectedStar.x - fleet.x;
						let dy = universe.selectedStar.y - fleet.y;
						let distance = Math.sqrt(dx * dx + dy * dy);
						let offsetx = xOffset;
						let offsety = 0;
						let x = map.worldToScreenX(fleet.x) + offsetx;
						let y = map.worldToScreenY(fleet.y) + offsety;
						if (distance > universe.galaxy.players[universe.selectedStar.puid].tech.scanning.value) {
							if (fleet.path && fleet.path.length > 0) {
								dx = fleet.path[0].x - universe.selectedStar.x;
								dy = fleet.path[0].y - universe.selectedStar.y;
								distance = Math.sqrt(dx * dx + dy * dy);
								if (distance < universe.galaxy.players[universe.selectedStar.puid].tech.scanning.value) {
									let stepRadius = NeptunesPride.universe.galaxy.fleet_speed;
									if (fleet.warpSpeed) stepRadius *= 3;
									dx = fleet.x - fleet.path[0].x;
									dy = fleet.y - fleet.path[0].y;
									let angle = Math.atan(dy / dx);
									let stepx = stepRadius * Math.cos(angle);
									let stepy = stepRadius * Math.sin(angle);
									if (stepx > 0 && dx > 0) {
										stepx *= -1;
									}
									if (stepy > 0 && dy > 0) {
										stepy *= -1;
									}
									if (stepx < 0 && dx < 0) {
										stepx *= -1;
									}
									if (stepy < 0 && dy < 0) {
										stepy *= -1;
									}
									let ticks = 0;
									do {
										let x = ticks * stepx + Number(fleet.x);
										let y = ticks * stepy + Number(fleet.y);
										//let sx = map.worldToScreenX(x);
										//let sy = map.worldToScreenY(y);
										dx = x - universe.selectedStar.x;
										dy = y - universe.selectedStar.y;
										distance = Math.sqrt(dx * dx + dy * dy);
										//console.log(distance, x, y);
										//drawOverlayString(map.context, "o", sx, sy);
										ticks += 1;
									} while (distance > universe.galaxy.players[universe.selectedStar.puid].tech.scanning.value && ticks <= fleet.etaFirst + 1);
									ticks -= 1;
									let visColor = "#00ff00";
									if (anyStarCanSee(universe.selectedStar.puid, fleet)) {
										visColor = "#888888";
									}
									drawOverlayString(map.context, `Scan ${tickToEtaString(ticks)}`, x, y, visColor);
								}
							}
						}
					}
				}
				//map.context.translate(-xOffset, 0);
			}
			if (universe.ruler.stars.length === 2) {
				let p1 = universe.ruler.stars[0].puid;
				let p2 = universe.ruler.stars[1].puid;
				if (p1 !== p2 && p1 !== -1 && p2 !== -1) {
					//console.log("two star ruler");
				}
			}
		}
		Crux.format = function (s, templateData) {
			if (!s) {
				return "error";
			}
			var i;
			var fp;
			var sp;
			var sub;
			var pattern;

			i = 0;
			fp = 0;
			sp = 0;
			sub = "";
			pattern = "";

			// look for standard patterns
			while (fp >= 0 && i < 1000) {
				i = i + 1;
				fp = s.search("\\[\\[");
				sp = s.search("\\]\\]");
				sub = s.slice(fp + 2, sp);
				pattern = `[[${sub}]]`;
				if (templateData[sub] !== undefined) {
					s = s.replace(pattern, templateData[sub]);
				} else if (sub.startsWith("api:")) {
					let apiLink = `<a onClick='Crux.crux.trigger(\"switch_user_api\", \"${sub}\")'> View as ${sub}</a>`;
					apiLink += ` or <a onClick='Crux.crux.trigger(\"merge_user_api\", \"${sub}\")'> Merge ${sub}</a>`;
					s = s.replace(pattern, apiLink);
				} else if (image_url(sub)) {
					let safe_url = stripHtml(sub)
					s = s.replace(pattern, `<img width="100%" src='${safe_url}' />`)
				} else {
					s = s.replace(pattern, `(${sub})`);
				}
			}
			return s;
		};
		let npui = NeptunesPride.npui;
		NeptunesPride.templates["n_p_a"] = "NP Agent";
		NeptunesPride.templates["npa_report_type"] = "Report Type:";
		NeptunesPride.templates["npa_paste"] = "Intel";
		//Research button to quickly tell friends research
		NeptunesPride.templates["npa_research"] = "Research";

		let superNewMessageCommentBox = npui.NewMessageCommentBox;

		let reportPasteHook = function (_e, _d) {
			let inbox = NeptunesPride.inbox;
			inbox.commentDrafts[inbox.selectedMessage.key] += "\n" + lastClip;
			inbox.trigger("show_screen", "diplomacy_detail");
		}
		let reportResearchHook = function (_e, _d) {
			let text = get_research_text()
			console.log(text)
			let inbox = NeptunesPride.inbox;
			inbox.commentDrafts[inbox.selectedMessage.key] += text
			inbox.trigger("show_screen", "diplomacy_detail");
		}

		NeptunesPride.np.on("paste_research", reportResearchHook);

		NeptunesPride.np.on("paste_report", reportPasteHook);

		npui.NewMessageCommentBox = function () {
			let widget = superNewMessageCommentBox();
			let reportButton = Crux.Button("npa_paste", "paste_report", "intel")
				.grid(10, 12, 4, 3)
			reportButton.roost(widget);
			let research_button = Crux.Button("npa_research", "paste_research", "research")
				.grid(14, 12, 6, 3)
			research_button.roost(widget);
			return widget;
		}
		const npaReports = function (_screenConfig) {
			npui.onHideScreen(null, true);
			npui.onHideSelectionMenu();

			npui.trigger("hide_side_menu");
			npui.trigger("reset_edit_mode");
			var reportScreen = npui.Screen("n_p_a");

			Crux.Text("", "rel pad12 txt_center col_black  section_title")
				.rawHTML(title)
				.roost(reportScreen);

			var report = Crux.Widget("rel  col_accent")
				.size(480, 48);
			var output = Crux.Widget("rel");

			Crux.Text("npa_report_type", "pad12")
				.roost(report);
			var selections = {
				"planets": "Home Planets",
				"fleets": "Fleets (short)",
				"combats": "Fleets (long)",
				"stars": "Stars",
			};
			Crux.DropDown("", selections, "exec_report")
				.grid(15, 0, 15, 3)
				.roost(report);

			let text = Crux.Text("", "pad12 rel txt_selectable")
				.size(432)
				.pos(48)

				.rawHTML("Choose a report from the dropdown.");
			text.roost(output);

			report.roost(reportScreen);
			output.roost(reportScreen);

			let reportHook = function (e, d) {
				console.log("Execute report", e, d);
				if (d === "planets") {
					homePlanets();
				} else if (d === "fleets") {
					briefFleetReport();
				} else if (d === "combats") {
					longFleetReport();
				} else if (d === "stars") {
					starReport();
				}
				let html = lastClip.replace(/\n/g, '<br>');
				html = NeptunesPride.inbox.hyperlinkMessage(html);
				text.rawHTML(html);
			};
			reportHook(0, "planets");
			NeptunesPride.np.on("exec_report", reportHook);

			npui.activeScreen = reportScreen;
			reportScreen.roost(npui.screenContainer);
			npui.layoutElement(reportScreen);
		};
		NeptunesPride.np.on("trigger_npa", npaReports);
		npui.SideMenuItem("icon-eye", "n_p_a", "trigger_npa")
			.roost(npui.sideMenu);


		let superFormatTime = Crux.formatTime;
		let relativeTimes = true;
		Crux.formatTime = function (ms, mins, secs) {
			if (relativeTimes) {
				return superFormatTime(ms, mins, secs);
			} else {
				return msToEtaString(ms, "");
			}
		}
		let toggleRelative = function () { relativeTimes = !relativeTimes; }
		hotkey("%", toggleRelative);
		toggleRelative.help = "Change the display of ETAs from relative times to absolute clock times. Makes predicting " +
			"important times of day to sign in and check much easier especially for multi-leg fleet movements. Sometimes you " +
			"will need to refresh the display to see the different times.";

		try {
			Object.defineProperty(Crux, 'touchEnabled', { get: () => false, set: (x) => { console.log("Crux.touchEnabled set ignored", x) } });
		} catch (e) {
			console.log(e)
		}
		Object.defineProperty(NeptunesPride.npui.map, 'ignoreMouseEvents', { get: () => false, set: (x) => { console.log("NeptunesPride.npui.map.ignoreMouseEvents set ignored", x) } });

		hooksLoaded = true;
	}

	let init = function () {
		if (NeptunesPride.universe?.galaxy && NeptunesPride.npui.map) {
			linkFleets();
			console.log("Fleet linking complete.");
			if (!hooksLoaded) {
				loadHooks();
				console.log("HUD setup complete.");
			} else {
				console.log("HUD setup already done; skipping.");
			}
			homePlanets();
		} else {
			console.log("Game not fully initialized yet; wait.", NeptunesPride.universe);
		}
	}
	hotkey("@", init);
	init.help = "Reinitialize Neptune's Pride Agent. Use the @ hotkey if the version is not being shown on the map after dragging.";

	if (NeptunesPride.universe?.galaxy && NeptunesPride.npui.map) {
		console.log("Universe already loaded. Hyperlink fleets & load hooks.");
		init();
	} else {
		console.log("Universe not loaded. Hook onServerResponse.");
		let superOnServerResponse = NeptunesPride.np.onServerResponse;
		NeptunesPride.np.onServerResponse = function (response) {
			superOnServerResponse(response);
			if (response.event === "order:player_achievements") {
				console.log("Initial load complete. Reinstall.");
				init();
			} else if (response.event === "order:full_universe") {
				console.log("Universe received. Reinstall.");
				NeptunesPride.originalPlayer = NeptunesPride.universe.player.uid;
				init();
			} else if (!hooksLoaded && NeptunesPride.npui.map) {
				console.log("Hooks need loading and map is ready. Reinstall.");
				init();
			}
		}
	}

	var otherUserCode = undefined;
	let game = NeptunesPride.gameNumber;
	let switchUser = function (event, data) {
		if (NeptunesPride.originalPlayer === undefined) {
			NeptunesPride.originalPlayer = NeptunesPride.universe.player.uid;
		}
		let code = (data?.split(":")[1]) || otherUserCode;
		otherUserCode = code;
		if (otherUserCode) {
			let params = { game_number: game, api_version: "0.1", code: otherUserCode };
			let eggers = jQuery.ajax({ type: 'POST', url: "https://np.ironhelmet.com/api", async: false, data: params, dataType: "json" })
			NeptunesPride.np.onFullUniverse(null, eggers.responseJSON.scanning_data);
			NeptunesPride.npui.onHideScreen(null, true);
			NeptunesPride.np.trigger("select_player", [NeptunesPride.universe.player.uid, true]);
			init();
		}
	}

	let mergeUser = function (event, data) {
		if (NeptunesPride.originalPlayer === undefined) {
			NeptunesPride.originalPlayer = NeptunesPride.universe.player.uid;
		}
		let code = (data?.split(":")[1]) || otherUserCode;
		otherUserCode = code;
		if (otherUserCode) {
			let params = { game_number: game, api_version: "0.1", code: otherUserCode };
			let eggers = jQuery.ajax({ type: 'POST', url: "https://np.ironhelmet.com/api", async: false, data: params, dataType: "json" })
			let universe = NeptunesPride.universe;
			let scan = eggers.responseJSON.scanning_data;
			universe.galaxy.stars = { ...scan.stars, ...universe.galaxy.stars };
			for (let s in scan.stars) {
				const star = scan.stars[s];
				if (star.v !== "0") {
					universe.galaxy.stars[s] = { ...universe.galaxy.stars[s], ...star };
				}
			}
			universe.galaxy.fleets = { ...scan.fleets, ...universe.galaxy.fleets };
			NeptunesPride.np.onFullUniverse(null, universe.galaxy);
			NeptunesPride.npui.onHideScreen(null, true);
			init();
		}
	}
	hotkey(">", switchUser);
	switchUser.help = "Switch views to the last user whose API key was used to load data. The HUD shows the current user when " +
		"it is not your own alias to help remind you that you aren't in control of this user.";
	hotkey("|", mergeUser);
	mergeUser.help = "Merge the latest data from the last user whose API key was used to load data. This is useful after a tick " +
		"passes and you've reloaded, but you still want the merged scan data from two players onscreen.";
	NeptunesPride.np.on("switch_user_api", switchUser);
	NeptunesPride.np.on("merge_user_api", mergeUser);

	let npaHelp = function () {
		let help = [`<H1>${title}</H1>`];
		for (let pair in hotkeys) {
			let key = hotkeys[pair][0];
			let action = hotkeys[pair][1];
			help.push(`<h2>Hotkey: ${key}</h2>`);
			if (action.help) {
				help.push(action.help);
			} else {
				help.push(`<p>No documentation yet.<p><code>${action.toLocaleString()}</code>`);
			}
		}
		NeptunesPride.universe.helpHTML = help.join("");
		NeptunesPride.np.trigger("show_screen", "help");
	}
	npaHelp.help = "Display this help screen.";
	hotkey("?", npaHelp);

	var autocompleteMode = 0;
	let autocompleteTrigger = function (e) {
		if (e.target.type === "textarea") {
			if (autocompleteMode) {
				let start = autocompleteMode;
				let endBracket = e.target.value.indexOf("]", start);
				if (endBracket === -1) endBracket = e.target.value.length;
				let autoString = e.target.value.substring(start, endBracket);
				let key = e.key;
				if (key === "]") {
					autocompleteMode = 0;
					let m = autoString.match(/^[0-9][0-9]*$/);
					if (m?.length) {
						let puid = Number(autoString);
						let end = e.target.selectionEnd;
						let auto = `${puid}]] ${NeptunesPride.universe.galaxy.players[puid].alias}`;
						e.target.value = e.target.value.substring(0, start) + auto + e.target.value.substring(end, e.target.value.length);
						e.target.selectionStart = start + auto.length;
						e.target.selectionEnd = start + auto.length;
					}
				}
			} else if (e.target.selectionStart > 1) {
				let start = e.target.selectionStart - 2;
				let ss = e.target.value.substring(start, start + 2);
				autocompleteMode = ss === "[[" ? e.target.selectionStart : 0;
			}
		}
	}
	document.body.addEventListener('keyup', autocompleteTrigger);

	console.log("SAT: Neptune's Pride Agent injection finished.");
}


const force_add_custom_player_panel = () => {
	if ("PlayerPanel" in NeptunesPride.npui) {
		add_custom_player_panel()
	} else {
		setTimeout(add_custom_player_panel, 3000);
	}

}

const add_custom_player_panel = () => {
	NeptunesPride.npui.PlayerPanel = function (player, showEmpire) {
		let universe = NeptunesPride.universe;
		let npui = NeptunesPride.npui;
		var playerPanel = Crux.Widget("rel")
			.size(480, 264 - 8 + 48);

		var heading = "player";
		if (universe.playerAchievements && NeptunesPride.gameConfig.anonymity === 0) {
			if (universe.playerAchievements[player.uid]) {
				if (universe.playerAchievements[player.uid].premium === "premium") {
					heading = "premium_player";
				}
				if (universe.playerAchievements[player.uid].premium === "lifetime") {
					heading = "lifetime_premium_player";
				}

			}
		}

		Crux.Text(heading, "section_title col_black")
			.grid(0, 0, 30, 3)
			.roost(playerPanel);

		if (player.ai) {
			Crux.Text("ai_admin", "txt_right pad12")
				.grid(0, 0, 30, 3)
				.roost(playerPanel);
		}

		Crux.Image(`../images/avatars/160/${player.avatar}.jpg`, "abs")
			.grid(0, 6, 10, 10)
			.roost(playerPanel);

		Crux.Widget(`pci_48_${player.uid}`)
			.grid(7, 13, 3, 3)
			.roost(playerPanel);

		Crux.Widget("col_accent")
			.grid(0, 3, 30, 3)
			.roost(playerPanel);

		Crux.Text("", "screen_subtitle")
			.grid(0, 3, 30, 3)
			.rawHTML(player.qualifiedAlias)
			.roost(playerPanel);

		var myAchievements;
		//U=>Toxic
		//V=>Magic
		//5=>Flombaeu
		//W=>Wizard
		if (universe.playerAchievements) {
			myAchievements = universe.playerAchievements[player.uid];
			if (player.rawAlias === "Lorentz" && "W" !== myAchievements.badges.slice(0, 1)) {
				myAchievements.badges = `W${myAchievements.badges}`
			} else if (player.rawAlias === 'A Stoned Ape' && "5" !== myAchievements.badges.slice(0, 1)) {
				myAchievements.badges = `5${myAchievements.badges}`
			}
		}
		if (myAchievements) {
			npui.SmallBadgeRow(myAchievements.badges)
				.grid(0, 3, 30, 3)
				.roost(playerPanel);
		}


		Crux.Widget("col_black")
			.grid(10, 6, 20, 3)
			.roost(playerPanel);
		if (player.uid !== get_hero().uid && player.ai === 0) {
			//Use this to only view when they are within scanning:
			//universe.selectedStar.v != "0"
			let total_sell_cost = get_tech_trade_cost(get_hero(), player)
			let btn = Crux.Button("", "share_all_tech", player)
				.addStyle("fwd")
				.rawHTML(`Share All Tech: $${total_sell_cost}`)
				.grid(10, 31, 14, 3)
			if (get_hero().cash >= total_sell_cost) {
				btn.roost(playerPanel);
			} else {
				btn.disable().roost(playerPanel);
			}
			let total_buy_cost = get_tech_trade_cost(player, get_hero())
			btn = Crux.Button("", "buy_all_tech", { player: player, tech: null, cost: total_buy_cost })
				.addStyle("fwd")
				.rawHTML(`Pay for All Tech: $${total_buy_cost}`)
				.grid(10, 49, 14, 3)
			if (get_hero().cash >= total_sell_cost) {
				btn.roost(playerPanel);
			} else {
				btn.disable().roost(playerPanel);
			}

			/*Individual techs*/
			let _name_map = {
				scanning: 'Scanning',
				propulsion: 'Hyperspace Range',
				terraforming: 'Terraforming',
				research: 'Experimentation',
				weapons: 'Weapons',
				banking: 'Banking',
				manufacturing: 'Manufacturing'
			}
			let techs = ['scanning', 'propulsion', 'terraforming', 'research', 'weapons', 'banking', 'manufacturing']
			techs.forEach((tech, i) => {
				let one_tech_cost = get_tech_trade_cost(player, get_hero(), tech)
				let one_tech = Crux.Button("", "buy_one_tech", { player: player, tech: tech, cost: one_tech_cost })
					.addStyle("fwd")
					.rawHTML(`Pay: $${one_tech_cost}`)
					.grid(15, 34.5 + i * 2, 7, 2)
				if (get_hero().cash >= one_tech_cost && one_tech_cost > 0) {
					one_tech.roost(playerPanel);
				}
			})
		}
		Crux.Text("you", "pad12 txt_center")
			.grid(25, 6, 5, 3)
			.roost(playerPanel);

		// Labels
		Crux.Text("total_stars", "pad8")
			.grid(10, 9, 15, 3)
			.roost(playerPanel);

		Crux.Text("total_fleets", "pad8")
			.grid(10, 11, 15, 3)
			.roost(playerPanel);

		Crux.Text("total_ships", "pad8")
			.grid(10, 13, 15, 3)
			.roost(playerPanel);

		Crux.Text("new_ships", "pad8")
			.grid(10, 15, 15, 3)
			.roost(playerPanel);

		// This players stats
		if (player !== universe.player) {
			Crux.Text("", "pad8 txt_center")
				.grid(20, 9, 5, 3)
				.rawHTML(player.total_stars)
				.roost(playerPanel);

			Crux.Text("", "pad8 txt_center")
				.grid(20, 11, 5, 3)
				.rawHTML(player.total_fleets)
				.roost(playerPanel);

			Crux.Text("", "pad8 txt_center")
				.grid(20, 13, 5, 3)
				.rawHTML(player.total_strength)
				.roost(playerPanel);

			Crux.Text("", "pad8 txt_center")
				.grid(20, 15, 5, 3)
				.rawHTML(player.shipsPerTick)
				.roost(playerPanel);
		}

		function selectHilightStyle(p1, p2) {
			p1 = Number(p1);
			p2 = Number(p2);
			if (p1 < p2) return " txt_warn_bad";
			if (p1 > p2) return " txt_warn_good";
			return "";
		}

		// Your stats
		if (universe.player) {

			Crux.Text("", `pad8 txt_center ${selectHilightStyle(universe.player.total_stars, player.total_stars)}`)
				.grid(25, 9, 5, 3)
				.rawHTML(universe.player.total_stars)
				.roost(playerPanel);

			Crux.Text("", `pad8 txt_center${selectHilightStyle(universe.player.total_fleets, player.total_fleets)}`)
				.grid(25, 11, 5, 3)
				.rawHTML(universe.player.total_fleets)
				.roost(playerPanel);

			Crux.Text("", `pad8 txt_center${selectHilightStyle(universe.player.total_strength, player.total_strength)}`)
				.grid(25, 13, 5, 3)
				.rawHTML(universe.player.total_strength)
				.roost(playerPanel);

			Crux.Text("", `pad8 txt_center${selectHilightStyle(universe.player.shipsPerTick, player.shipsPerTick)}`)
				.grid(25, 15, 5, 3)
				.rawHTML(universe.player.shipsPerTick)
				.roost(playerPanel);
		}




		Crux.Widget("col_accent")
			.grid(0, 16, 10, 3)
			.roost(playerPanel);

		if (universe.player) {
			var msgBtn = Crux.IconButton("icon-mail", "inbox_new_message_to_player", player.uid)
				.grid(0, 16, 3, 3)
				.addStyle("fwd")
				.disable()
				.roost(playerPanel);
			if (player !== universe.player && player.alias) {
				msgBtn.enable();
			}

			Crux.IconButton("icon-chart-line", "show_intel", player.uid)
				.grid(2.5, 16, 3, 3)
				.roost(playerPanel);

			if (showEmpire) {
				Crux.IconButton("icon-eye", "show_screen", "empire")
					.grid(7, 16, 3, 3)
					.roost(playerPanel);
			}
		}

		return playerPanel;
	};
}

NeptunesPride.npui.StarInspector = function () {
	let npui = NeptunesPride.npui;
	let universe = NeptunesPride.universe;
	var starInspector = npui.Screen();
	starInspector.heading.rawHTML(universe.selectedStar.n);

	Crux.IconButton("icon-help", "show_help", "stars")
		.grid(24.5, 0, 3, 3)
		.roost(starInspector);

	Crux.IconButton("icon-doc-text", "show_screen", "combat_calculator")
		.grid(22, 0, 3, 3)
		.roost(starInspector);

	var starKind = "unscanned_star";
	if (!universe.selectedStar.player) {
		starKind = "unclaimed_star";
	} else {
		starKind = "enemy_star";
		if (universe.selectedStar.v === "0") {
			starKind = "unscanned_enemy";
		}
	}

	if (universe.selectedStar.owned) {
		starKind = "my_star";
	}
	// subtitle
	starInspector.intro = Crux.Widget("rel")
		.roost(starInspector);

	Crux.Text(starKind, "pad12 rel col_black txt_center")
		.format(universe.selectedStar)
		.roost(starInspector.intro);

	if (starKind === "unclaimed_star") {
		npui.StarResStatus(true, false)
			.roost(starInspector);
		starInspector.footerRequired = false;
	}

	if (starKind === "unscanned_enemy") {
		npui.StarResStatus(true, false)
			.roost(starInspector);

		npui.PlayerPanel(universe.selectedStar.player, true)
			.roost(starInspector);

	}

	if (starKind === "enemy_star") {
		npui.StarDefStatus(false)
			.roost(starInspector);

		npui.StarInfStatus(false)
			.roost(starInspector);

		Crux.Widget("rel col_black")
			.size(480, 8)
			.roost(starInspector);

		npui.ShipConstructionRate()
			.roost(starInspector);

		if (universe.selectedStar.ga > 0) {
			Crux.Widget("rel col_black")
				.size(480, 8)
				.roost(starInspector);
			Crux.Text("has_warp_gate", "rel col_accent pad12 txt_center")
				.size(480, 48)
				.roost(starInspector);

		}

		npui.PlayerPanel(universe.selectedStar.player, true)
			.roost(starInspector);
	}

	if (starKind === "my_star") {
		npui.StarDefStatus(true)
			.roost(starInspector);

		npui.StarInfStatus(true)
			.roost(starInspector);

		Crux.Widget("rel col_black")
			.size(480, 8)
			.roost(starInspector);

		npui.ShipConstructionRate()
			.roost(starInspector);

		Crux.Widget("rel col_black")
			.size(480, 8)
			.roost(starInspector);

		npui.StarBuildFleet()
			.roost(starInspector);

		if (NeptunesPride.gameConfig.buildGates !== 0) {
			Crux.Widget("rel col_black")
				.size(480, 8)
				.roost(starInspector);

			npui.StarGateStatus(true)
				.roost(starInspector);
		} else {
			if (universe.selectedStar.ga > 0) {
				Crux.Widget("rel col_black")
					.size(480, 8)
					.roost(starInspector);
				Crux.Text("has_warp_gate", "rel col_accent pad12 txt_center")
					.size(480, 48)
					.roost(starInspector);
			}
		}

		Crux.Widget("rel col_black")
			.size(480, 8)
			.roost(starInspector);

		npui.StarAbandon()
			.roost(starInspector);

		npui.StarPremium()
			.roost(starInspector);

		npui.PlayerPanel(universe.selectedStar.player, true)
			.roost(starInspector);
	}

	async function apply_fractional_ships() {
		let depth = NeptunesPride.gameConfig.turnBased ? 4 : 3
		let selector = `#contentArea > div > div.widget.fullscreen > div:nth-child(${depth}) > div > div:nth-child(5) > div.widget.pad12.icon-rocket-inline.txt_right`

		let element = $(selector)
		let counter = 0
		let fractional_ship = universe.selectedStar['c'].toFixed(2)
		$(selector).append(fractional_ship)

		while (element.length === 0 && counter <= 100) {
			await new Promise(r => setTimeout(r, 10));
			element = $(selector)
			let fractional_ship = universe.selectedStar['c']
			let new_value = parseInt($(selector).text()) + fractional_ship
			$(selector).text(new_value.toFixed(2))
			counter += 1
		}
	}
	if ('c' in universe.selectedStar) {
		apply_fractional_ships()
	}

	return starInspector;
};


setTimeout(NeptunesPrideAgent, 1000)
setTimeout(renderLedger, 2000)
setTimeout(apply_hooks, 2000)


//Test to see if PlayerPanel is there
//If it is overwrites custom one
//Otherwise while loop & set timeout until its there
force_add_custom_player_panel()
