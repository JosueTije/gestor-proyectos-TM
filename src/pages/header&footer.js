document.addEventListener('DOMContentLoaded', function() {
          
fetch('header.html')
    .then(res => res.text())
    .then(data => {
        // Ejecutar script para mostrar correo
        setTimeout(function() {
            const token = localStorage.getItem('tm_token');
            const email = localStorage.getItem('tm_email');
            const userEmailDiv = document.getElementById('user-email');
            if (token && email && userEmailDiv) {
                userEmailDiv.textContent = email;
            }
        }, 100);
        document.getElementById('header-placeholder').innerHTML = data;
    });
fetch('footer.html')
    .then(res => res.text())
    .then(data => {
        document.getElementById('footer-placeholder').innerHTML = data;
    });
});