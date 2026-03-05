(() => {
	'use strict';

	const API_BASE = 'https://pokeapi.co/api/v2';
	const PAGE_LIMIT = 25;
	const CONCURRENCY = 12;

	const els = {
		results: document.getElementById('results'),
		tplCard: document.getElementById('pokemon-card-template'),
		form: document.getElementById('controlsForm'),
		NameId: document.getElementById('NameID'),
		typeFilter: document.getElementById('typeFilter'),
		btnMore: document.getElementById('loadMore'),
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
