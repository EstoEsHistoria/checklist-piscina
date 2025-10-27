// assets/js/charts.js
let dailyChartInstance = null;

/**
 * renderLineChart(containerId, labels, datasetEntered, datasetTotal)
 */
export function renderLineChart(containerId, labels, enteredData, totalData) {
  const ctx = document.getElementById(containerId);
  if (!ctx) return;
  if (dailyChartInstance) dailyChartInstance.destroy();

  dailyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Total de Huéspedes',
          data: totalData,
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        },
        {
          label: 'Ingresados (Check-in)',
          data: enteredData,
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.5)',
          borderWidth: 2,
          fill: false,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Cantidad' } },
        x: { title: { display: true, text: 'Fecha' } }
      },
      plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } }
    }
  });
}
