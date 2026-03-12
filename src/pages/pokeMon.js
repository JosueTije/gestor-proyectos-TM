(() => {
	'use strict';

	const API_BASE = 'https://pokeapi.co/api/v2';
	const PAGE_LIMIT = 25;
	const CONCURRENCY = 12;
	const TURN_DELAY_MS = 950;

	const els = {
		results: document.getElementById('results'),
		tplCard: document.getElementById('pokemon-card-template'),
		form: document.getElementById('controlsForm'),
		NameId: document.getElementById('NameID'),
		typeFilter: document.getElementById('typeFilter'),
		btnMore: document.getElementById('loadMore'),
		battleForm: document.getElementById('battleForm'),
		battlePokemonA: document.getElementById('battlePokemonA'),
		battlePokemonB: document.getElementById('battlePokemonB'),
		battleArena: document.getElementById('battleArena'),
		hpFillA: document.getElementById('hpFillA'),
		hpFillB: document.getElementById('hpFillB'),
		hpTextA: document.getElementById('hpTextA'),
		hpTextB: document.getElementById('hpTextB'),
		fighterAName: document.querySelector('#fighterA .fighter-name'),
		fighterBName: document.querySelector('#fighterB .fighter-name'),
		fighterAImage: document.querySelector('#fighterA .fighter-image'),
		fighterBImage: document.querySelector('#fighterB .fighter-image'),
		battleLog: document.getElementById('battleLog'),
		winnerOverlay: document.getElementById('battleWinnerOverlay'),
		winnerImage: document.getElementById('winnerImage'),
		winnerName: document.getElementById('winnerName'),
		closeWinnerOverlay: document.getElementById('closeWinnerOverlay'),
		startBattle: document.getElementById('startBattle'),
	};

	if (!els.results || !els.tplCard || !els.form || !els.NameId || !els.typeFilter || !els.btnMore) {
		return;
	}

	const state = {
		mode: 'list',
		offset: 0,
		limit: PAGE_LIMIT,
		hasMore: true,
		currentQ: '',
		currentType: '',
		typeCatalog: [],
		typeCursor: 0,
	};

	const battleState = {
		runId: 0,
		running: false,
	};

	const cache = new Map();

	bindUI();
	init();

	async function init() {
		try {
			await loadTypesIntoSelect();
			await runQueryFromControls();
		} catch (err) {
			showError('No se pudo inicializar la aplicación. Revisa tu conexión.');
			console.error(err);
		}
	}

	function bindUI() {
		els.form.addEventListener('submit', (event) => {
			event.preventDefault();
			runQueryFromControls();
		});

		els.btnMore.addEventListener('click', () => {
			loadMorePage();
		});

		if (els.battleForm && els.battlePokemonA && els.battlePokemonB) {
			els.battleForm.addEventListener('submit', (event) => {
				event.preventDefault();
				startBattleFromControls();
			});
		}

		if (els.closeWinnerOverlay && els.winnerOverlay) {
			els.closeWinnerOverlay.addEventListener('click', () => {
				els.winnerOverlay.hidden = true;
			});
		}
	}

	async function runQueryFromControls() {
		state.currentQ = (els.NameId.value || '').trim().toLowerCase();
		state.currentType = (els.typeFilter.value || '').trim().toLowerCase();

		if (state.currentQ) {
			state.mode = 'search';
		} else if (state.currentType) {
			state.mode = 'type';
		} else {
			state.mode = 'list';
		}

		state.offset = 0;
		state.typeCatalog = [];
		state.typeCursor = 0;
		state.hasMore = true;
		clearGrid();

		await loadMorePage(true);
	}

	async function loadMorePage(isFirstPage = false) {
		try {
			setBusy(true);
			clearMessages();

			let batch = [];

			if (state.mode === 'list') {
				batch = await fetchListPage(state.offset, state.limit);
				state.offset += state.limit;
				state.hasMore = batch.length === state.limit;
			} else if (state.mode === 'type') {
				if (state.typeCatalog.length === 0) {
					state.typeCatalog = await fetchTypeCatalog(state.currentType);
					state.typeCursor = 0;
				}

				const slice = state.typeCatalog.slice(state.typeCursor, state.typeCursor + state.limit);
				state.typeCursor += slice.length;
				state.hasMore = state.typeCursor < state.typeCatalog.length;
				batch = await fetchManyDetails(slice.map((pokemon) => pokemon.name));
			} else if (state.mode === 'search') {
				const pokemon = await fetchDetailSafely(state.currentQ);

				if (pokemon && state.currentType) {
					const hasType = pokemon.types.some((typeInfo) => typeInfo.type.name === state.currentType);
					if (hasType) {
						batch = [pokemon];
					} else {
						batch = [];
						showInfo(`“${state.currentQ}” no es de tipo “${state.currentType}”.`);
					}
				} else {
					batch = pokemon ? [pokemon] : [];
				}

				state.hasMore = false;
			}

			if (batch.length === 0) {
				if (isFirstPage) {
					renderEmptyState();
				}
				updateLoadMoreVisibility();
				return;
			}
			renderCards(batch);
			updateLoadMoreVisibility();
		} catch (err) {
			showError('Ocurrió un error al cargar datos de PokeAPI.');
			console.error(err);
		} finally {
			setBusy(false);
		}
	}

	async function fetchListPage(offset, limit) {
		const url = `${API_BASE}/pokemon?limit=${limit}&offset=${offset}`;
		const list = await fetchJSON(url);
		const names = (list.results || []).map((pokemon) => pokemon.name);
		return fetchManyDetails(names);
	}

	async function fetchTypeCatalog(typeName) {
		const url = `${API_BASE}/type/${encodeURIComponent(typeName)}`;
		const data = await fetchJSON(url);
		return (data.pokemon || []).map((entry) => ({
			name: entry.pokemon.name,
			url: entry.pokemon.url,
		}));
	}

	async function fetchDetailSafely(nameOrId) {
		const key = String(nameOrId).toLowerCase().trim();
		if (cache.has(key)) {
			return cache.get(key);
		}

		try {
			const data = await fetchJSON(`${API_BASE}/pokemon/${encodeURIComponent(key)}`);
			cache.set(key, data);
			cache.set(String(data.id), data);
			cache.set(data.name.toLowerCase(), data);
			return data;
		} catch {
			return null;
		}
	}

	async function fetchManyDetails(names) {
		const queue = [...names];
		const results = [];
		let active = 0;

		return new Promise((resolve) => {
			const next = () => {
				if (queue.length === 0 && active === 0) {
					resolve(results);
					return;
				}

				while (active < CONCURRENCY && queue.length > 0) {
					const name = queue.shift();
					active += 1;

					(async () => {
						try {
							const detail = await fetchDetailSafely(name);
							if (detail) {
								results.push(detail);
							}
						} catch (err) {
							console.warn('Error detalle:', name, err);
						} finally {
							active -= 1;
							next();
						}
					})();
				}
			};

			next();
		});
	}

	async function loadTypesIntoSelect() {
		const url = `${API_BASE}/type`;
		const data = await fetchJSON(url);
		let types = (data.results || []).map((typeInfo) => typeInfo.name.toLowerCase());

		const excluded = new Set(['unknown', 'shadow']);
		types = types.filter((type) => !excluded.has(type)).sort((a, b) => a.localeCompare(b));

		const fragment = document.createDocumentFragment();
		for (const type of types) {
			const option = document.createElement('option');
			option.value = type;
			option.textContent = capitalize(type);
			fragment.appendChild(option);
		}

		els.typeFilter.appendChild(fragment);
	}

	async function fetchJSON(url) {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status} - ${url}`);
		}
		return response.json();
	}

	async function startBattleFromControls() {
		if (!els.battlePokemonA || !els.battlePokemonB || !els.startBattle) {
			return;
		}

		const qA = (els.battlePokemonA.value || '').trim().toLowerCase();
		const qB = (els.battlePokemonB.value || '').trim().toLowerCase();

		if (!qA || !qB) {
			showError('Debes ingresar dos Pokemon para iniciar la batalla.');
			return;
		}

		const runId = Date.now();
		battleState.runId = runId;
		battleState.running = true;
		els.startBattle.disabled = true;

		try {
			clearBattleLog();
			hideWinnerOverlay();

			const [detailA, detailB] = await Promise.all([fetchDetailSafely(qA), fetchDetailSafely(qB)]);

			if (battleState.runId !== runId) {
				return;
			}

			if (!detailA || !detailB) {
				showError('No se pudieron encontrar ambos Pokemon. Revisa nombre o ID.');
				return;
			}

			const fighterA = buildFighter(detailA, 'A');
			const fighterB = buildFighter(detailB, 'B');

			setupBattleArena(fighterA, fighterB);
			logBattle('La batalla comienza. Vida inicial: 100% para ambos.');

			await runBattleTurns(fighterA, fighterB, runId);
		} catch (err) {
			showError('No fue posible simular la batalla en este momento.');
			console.error(err);
		} finally {
			if (battleState.runId === runId) {
				battleState.running = false;
			}
			els.startBattle.disabled = false;
		}
	}

	function buildFighter(detail, side) {
		return {
			side,
			detail,
			name: capitalize(detail.name),
			hp: 100,
			attack: getBaseStat(detail, 'attack'),
			defense: getBaseStat(detail, 'defense'),
			speed: getBaseStat(detail, 'speed'),
			turnsTaken: 0,
			specialAttackCd: 3,
			specialDefenseCd: 2,
			hasShield: false,
		};
	}

	async function runBattleTurns(fighterA, fighterB, runId) {
		let attacker = pickFirstAttacker(fighterA, fighterB);
		let defender = attacker === fighterA ? fighterB : fighterA;
		let turn = 1;

		while (fighterA.hp > 0 && fighterB.hp > 0) {
			if (battleState.runId !== runId) {
				return;
			}

			const result = executeTurn(attacker, defender, turn);
			logBattle(result.message);
			updateBattleUI(fighterA, fighterB);

			if (defender.hp <= 0) {
				break;
			}

			await sleep(TURN_DELAY_MS);

			const previousAttacker = attacker;
			attacker = defender;
			defender = previousAttacker;
			turn += 1;
		}

		const winner = fighterA.hp > 0 ? fighterA : fighterB;
		const loser = winner === fighterA ? fighterB : fighterA;
		logBattle(`Fin de la batalla: ${winner.name} derrota a ${loser.name}.`);
		showWinnerOverlay(winner);
	}

	function executeTurn(attacker, defender, turn) {
		attacker.turnsTaken += 1;
		attacker.specialAttackCd += 1;
		attacker.specialDefenseCd += 1;

		const action = chooseBattleAction(attacker, defender);
		let damage = 0;
		let shieldNote = '';

		if (action.kind === 'special-defense') {
			attacker.specialDefenseCd = 0;
			attacker.hasShield = true;
		} else {
			damage = calculateDamage(attacker, defender, action.kind);

			if (defender.hasShield) {
				damage = Math.max(1, Math.round(damage * 0.4));
				defender.hasShield = false;
				shieldNote = ' (la defensa especial redujo el dano)';
			}

			defender.hp = Math.max(0, defender.hp - damage);

			if (action.kind === 'special-attack') {
				attacker.specialAttackCd = 0;
			}
		}

		const remaining = defender.hp;
		const msg = `Turno ${turn}: ${attacker.name} usa ${action.label}. Daño: ${damage}. Vida de ${defender.name}: ${remaining}% de 100%.${shieldNote}`;

		return {
			message: msg,
		};
	}

	function chooseBattleAction(attacker) {
		const canSpecialAttack = attacker.turnsTaken >= 3 && attacker.specialAttackCd >= 3;
		const canSpecialDefense = attacker.turnsTaken >= 2 && attacker.specialDefenseCd >= 2 && !attacker.hasShield;

		const roll = Math.random();

		if (canSpecialAttack && roll < 0.35) {
			return { kind: 'special-attack', label: 'Ataque Especial' };
		}

		if (canSpecialDefense && roll >= 0.35 && roll < 0.55) {
			return { kind: 'special-defense', label: 'Defensa Especial' };
		}

		return { kind: 'basic-attack', label: 'Ataque Basico' };
	}

	function calculateDamage(attacker, defender, kind) {
		const base = kind === 'special-attack' ? 24 : 13;
		const attackFactor = attacker.attack / 120;
		const defenseFactor = defender.defense / 170;
		const randomFactor = 0.88 + Math.random() * 0.24;
		const raw = (base + attackFactor * 18 - defenseFactor * 7) * randomFactor;

		if (kind === 'special-attack') {
			return Math.max(12, Math.round(raw));
		}

		return Math.max(6, Math.round(raw));
	}

	function pickFirstAttacker(fighterA, fighterB) {
		if (fighterA.speed === fighterB.speed) {
			return Math.random() > 0.5 ? fighterA : fighterB;
		}

		return fighterA.speed > fighterB.speed ? fighterA : fighterB;
	}

	function setupBattleArena(fighterA, fighterB) {
		if (!els.battleArena || !els.fighterAName || !els.fighterBName || !els.fighterAImage || !els.fighterBImage) {
			return;
		}

		els.battleArena.hidden = false;
		els.fighterAName.textContent = fighterA.name;
		els.fighterBName.textContent = fighterB.name;
		els.fighterAImage.src = getPokemonImage(fighterA.detail);
		els.fighterBImage.src = getPokemonImage(fighterB.detail);
		els.fighterAImage.alt = `Imagen de ${fighterA.name}`;
		els.fighterBImage.alt = `Imagen de ${fighterB.name}`;
		updateBattleUI(fighterA, fighterB);
	}

	function updateBattleUI(fighterA, fighterB) {
		if (!els.hpFillA || !els.hpFillB || !els.hpTextA || !els.hpTextB) {
			return;
		}

		const hpA = clampHp(fighterA.hp);
		const hpB = clampHp(fighterB.hp);

		els.hpFillA.style.width = `${hpA}%`;
		els.hpFillB.style.width = `${hpB}%`;
		els.hpTextA.textContent = `${hpA}%`;
		els.hpTextB.textContent = `${hpB}%`;
	}

	function clearBattleLog() {
		if (els.battleLog) {
			els.battleLog.innerHTML = '';
		}
	}

	function logBattle(msg) {
		if (!els.battleLog) {
			return;
		}

		const line = document.createElement('p');
		line.className = 'battle-log-entry';
		line.textContent = msg;
		els.battleLog.appendChild(line);
		els.battleLog.scrollTop = els.battleLog.scrollHeight;
	}

	function showWinnerOverlay(winner) {
		if (!els.winnerOverlay || !els.winnerImage || !els.winnerName) {
			return;
		}

		els.winnerImage.src = getPokemonImage(winner.detail);
		els.winnerImage.alt = `Imagen del ganador ${winner.name}`;
		els.winnerName.textContent = winner.name;
		els.winnerOverlay.hidden = false;
	}

	function hideWinnerOverlay() {
		if (els.winnerOverlay) {
			els.winnerOverlay.hidden = true;
		}
	}

	function getPokemonImage(detail) {
		return (
			detail?.sprites?.other?.['official-artwork']?.front_default ||
			detail?.sprites?.other?.dream_world?.front_default ||
			detail?.sprites?.front_default ||
			'data:image/gif;base64,R0lGODlhAQABAAAAACw='
		);
	}

	function getBaseStat(detail, statName) {
		const item = (detail?.stats || []).find((statInfo) => statInfo?.stat?.name === statName);
		return item ? item.base_stat : 50;
	}

	function clampHp(value) {
		return Math.max(0, Math.min(100, Math.round(value)));
	}

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	function renderCards(pokemons) {
		const fragment = document.createDocumentFragment();
		for (const pokemon of pokemons) {
			fragment.appendChild(buildCard(pokemon));
		}
		els.results.appendChild(fragment);
	}

	function buildCard(detail) {
		const node = els.tplCard.content.cloneNode(true);
		const $ = (selector, root = node) => root.querySelector(selector);

		const imgUrl =
			detail?.sprites?.other?.['official-artwork']?.front_default ||
			detail?.sprites?.other?.dream_world?.front_default ||
			detail?.sprites?.front_default ||
			'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

		const img = $('.card-img');
		img.src = imgUrl;
		img.alt = `Imagen oficial de ${capitalize(detail.name)}`;

		$('.pokemon-name').textContent = capitalize(detail.name);
		$('.pokemon-id').textContent = `#${String(detail.id).padStart(4, '0')}`;

		const typesWrap = $('.types');
		for (const typeInfo of detail.types) {
			const chip = document.createElement('span');
			chip.className = 'project-status';
			chip.textContent = typeInfo.type.name;
			typesWrap.appendChild(chip);
		}

		const abilityList = $('.ability-list');
		for (const ability of detail.abilities) {
			const item = document.createElement('li');
			item.textContent = ability.ability.name;
			abilityList.appendChild(item);
		}

		const statsList = $('.stats-list');
		const order = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
		const statsMap = Object.fromEntries(detail.stats.map((stat) => [stat.stat.name, stat.base_stat]));

		for (const key of order) {
			const item = document.createElement('li');
			const label = key.replace('-', ' ');
			item.innerHTML = `<span>${label}</span><strong>${statsMap[key] ?? '—'}</strong>`;
			statsList.appendChild(item);
		}

		return node;
	}

	function renderEmptyState() {
		const wrap = document.createElement('div');
		wrap.className = 'pokemon-empty';
		wrap.innerHTML = '<p>Sin resultados. Prueba otro nombre/ID, cambia el tipo o quita filtros.</p>';
		els.results.appendChild(wrap);
	}

	function updateLoadMoreVisibility() {
		els.btnMore.hidden = !state.hasMore;
	}

	function clearGrid() {
		els.results.innerHTML = '';
	}

	function setBusy(isBusy) {
		els.results.setAttribute('aria-busy', String(Boolean(isBusy)));
	}

	function showError(msg) {
		toast(msg, 'error');
	}

	function showInfo(msg) {
		toast(msg, 'info');
	}

	function clearMessages() {
		document.querySelectorAll('.pokemon-toast').forEach((toastEl) => toastEl.remove());
	}

	function toast(msg, kind = 'info') {
		const el = document.createElement('div');
		el.textContent = msg;
		el.className = `pokemon-toast pokemon-toast--${kind}`;
		els.results.parentElement.insertBefore(el, els.results);
		setTimeout(() => el.remove(), 3500);
	}

	function capitalize(value) {
		return (value || '').charAt(0).toUpperCase() + (value || '').slice(1);
	}
})();
