// Red de seguridad de arranque (script clásico, se ejecuta aunque los módulos fallen).
// Chrome/Edge bloquean los módulos ES cuando la página se abre con doble clic (file://). Si pasado un
// momento la app no ha arrancado, se explica qué hacer en vez de dejar los botones muertos.
window.addEventListener('load', function () {
  setTimeout(function () {
    if (window.__appBooted) return;
    var file = location.protocol === 'file:';
    var box = document.createElement('div');
    box.className = 'boot-warning';
    box.setAttribute('role', 'alert');
    box.innerHTML = file
      ? '<b>La aplicación no puede arrancar desde un archivo abierto con doble clic.</b>' +
        '<span>Chrome y Edge bloquean los módulos en <code>file://</code>. Opciones: ' +
        '<b>1)</b> abre <code>dist/claude-md-editor.html</code> (funciona con doble clic), o ' +
        '<b>2)</b> ejecuta <code>Iniciar.cmd</code> (o <code>npm run serve</code>) y entra en <code>http://localhost:8765</code>.</span>'
      : '<b>La aplicación no ha podido arrancar.</b>' +
        '<span>Recarga con Ctrl+Mayús+R. Si persiste, borra los datos del sitio (F12 → Application → Storage → Clear site data) y abre la consola para ver el error.</span>';
    document.body.prepend(box);
  }, 1500);
});
