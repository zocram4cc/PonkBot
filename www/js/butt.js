async function updateLedger() {
  fetch('/api/butt-ledger')
    .then(res => res.json())
    .then(data => {
      const { ledger } = data;

      const buttTableDiv = document.getElementById('butt-table');
      if (ledger.length === 0) {
        buttTableDiv.innerHTML = '<p>Ledger is empty.</p>';
      } else {
        const buttTable = `
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Butts</th>
              </tr>
            </thead>
            <tbody>
              ${ledger.map(entry => `
                <tr>
                  <td>${entry.user}</td>
                  <td class="text-end">${entry.balance.toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        buttTableDiv.innerHTML = buttTable;
      }

    });
}

updateLedger();
