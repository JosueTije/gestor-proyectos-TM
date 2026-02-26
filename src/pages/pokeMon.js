const POKE_API_URL = 'https://pokeapi.co/api/v2/pokemon?limit=3';

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

const createPokemonCard = (pokemon) => {
	const card = document.createElement('article');
	card.className = 'project-card';

	const imageUrl = pokemon.sprites.other?.['official-artwork']?.front_default || pokemon.sprites.front_default;
	const types = pokemon.types.map((typeInfo) => capitalize(typeInfo.type.name));

	card.innerHTML = `
		<div class="project-header">
			<h3>${capitalize(pokemon.name)}</h3>
		</div>
		<div class="project-body">
			<img class="pokemon-image" src="${imageUrl}" alt="${pokemon.name}">
			<p class="project-description">Pokédex #${pokemon.id} · Altura: ${pokemon.height / 10} m · Peso: ${pokemon.weight / 10} kg</p>
			<div class="project-meta pokemon-types">
				${types.map((type) => `<span class="project-status" data-status="completed">${type}</span>`).join('')}
			</div>
		</div>
	`;

	return card;
};

const showError = (container) => {
	container.innerHTML = '<p class="pokemon-error">No se pudieron cargar los pokémones. Intenta de nuevo más tarde.</p>';
};

const loadPokemonCards = async () => {
	const container = document.getElementById('pokemon-container');

	if (!container) {
		return;
	}

	try {
		const response = await fetch(POKE_API_URL);

		if (!response.ok) {
			throw new Error('No se pudo obtener la lista de pokémones');
		}

		const data = await response.json();
		const detailRequests = data.results.map((pokemon) => fetch(pokemon.url).then((detailResponse) => {
			if (!detailResponse.ok) {
				throw new Error('No se pudo obtener un pokémon');
			}

			return detailResponse.json();
		}));

		const pokemons = await Promise.all(detailRequests);

		container.innerHTML = '';
		pokemons.forEach((pokemon) => {
			container.appendChild(createPokemonCard(pokemon));
		});
	} catch (error) {
		showError(container);
	}
};

document.addEventListener('DOMContentLoaded', loadPokemonCards);
