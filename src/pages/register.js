const form = document.querySelector('form');

if (form) {
    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const formData = {
            nombre: document.getElementById('nombre')?.value.trim() || '',
            fechaNacimiento: document.getElementById('fecha')?.value || '',
            correo: document.getElementById('email')?.value.trim() || '',
            password: document.getElementById('password')?.value || ''
        };

        console.log('Registro capturado:', formData);
    });
}
