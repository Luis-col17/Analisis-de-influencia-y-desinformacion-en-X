// Paleta verde y valores por defecto de Chart.js.
// Se carga después de Chart.js y antes de evolucion.js y app.js.
// Los colores que cada gráfico defina por su cuenta tienen prioridad sobre estos valores.
(function () {
    window.PALETA = {
        c1: '#EAF4E4',
        c2: '#9CCB86',
        c3: '#4F9A4C',
        c4: '#23663A',
        c5: '#0F3B22'
    };

    if (!window.Chart) return;

    var P = window.PALETA;
    var D = Chart.defaults;

    D.color = '#4C6F58';
    D.borderColor = 'rgba(156, 203, 134, 0.35)';
    D.font.family = '"Figtree", system-ui, sans-serif';
    D.font.size = 12;

    D.plugins.legend.labels.usePointStyle = true;
    D.plugins.legend.labels.boxWidth = 8;

    D.plugins.tooltip.backgroundColor = P.c5;
    D.plugins.tooltip.titleColor = P.c1;
    D.plugins.tooltip.bodyColor = P.c1;
    D.plugins.tooltip.cornerRadius = 6;
    D.plugins.tooltip.padding = 10;

    D.elements.line.borderColor = P.c4;
    D.elements.line.borderWidth = 2;
    D.elements.point.backgroundColor = P.c4;
    D.elements.bar.backgroundColor = P.c3;
    D.elements.bar.borderRadius = 2;
})();