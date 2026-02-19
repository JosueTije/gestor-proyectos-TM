
const CREDENTIALS = [
    { email: "admin@demo.com", password: "1234" },
    { email: "user1@demo.com", password: "abcd" },
    { email: "josue@demo.com", password: "5678" },
    { email: "test@demo.com", password: "test" }
];

function showMessage(msg, isError = false) {
    let msgDiv = document.getElementById('login-message');
    if (!msgDiv) {
        msgDiv = document.createElement('div');
        msgDiv.id = 'login-message';
        msgDiv.style.margin = '20px 0';
        msgDiv.style.textAlign = 'center';
        msgDiv.style.fontWeight = 'bold';
        document.querySelector('.login-container').insertBefore(msgDiv, document.querySelector('.signup-link'));
    }
    msgDiv.textContent = msg;
    msgDiv.style.color = isError ? '#c41e3a' : '#4caf50';
}

const form = document.querySelector('form');
if (form) {
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const found = CREDENTIALS.find(
            cred => cred.email === email && cred.password === password
        );
        if (found) {
            showMessage('¡Login exitoso!');
            setTimeout(() => {
                window.location.href = 'landingPage.html';
            }, 1000);
        } else {
            showMessage('Ingrese correo y contraseña válidos', true);
        }
    });
}
