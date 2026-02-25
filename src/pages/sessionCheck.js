// Redirige al login si no hay sesión activa
(function() {
  if (!localStorage.getItem('tm_token')) {
    window.location.href = 'login.html';
  }
})();
