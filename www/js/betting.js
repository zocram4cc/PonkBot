// www/js/betting.js

const userLocale = navigator.languages[0];
const localeNum = new Intl.NumberFormat(userLocale,"en");

function updateBettingInfo() {
  fetch('/api/bets')
    .then(res => res.json())
    .then(data => {
      const { round, totals } = data;
      const infoDiv = document.getElementById('betting-info');
      if (!round.open) {
        infoDiv.innerHTML = '<p>Betting is closed.</p>';
      } else {
        infoDiv.innerHTML = `
          <p><strong>${round.teamA}</strong> vs <strong>${round.teamB}</strong></p>
          <p>Total on ${round.teamA}: ${localeNum.format(totals[round.teamA])}</p>
          <p>Total on ${round.teamB}: ${localeNum.format(totals[round.teamB])}</p>
        `;
      }
      let divText = `
        <h3 class="text-center">Current match: <strong>${round.teamA}</strong> vs <strong>${round.teamB}</strong></h3>
        <h4 class="text-center">Total on ${round.teamA}: ${localeNum.format(totals[round.teamA])}</h4>
        <h4 class="text-center">Total on ${round.teamB}: ${localeNum.format(totals[round.teamB])}</h4>
      `;
      if (bettingOpen) {
        divText = divText.concat('<h4>Betting is <strong><span style="color: green">OPEN</span></strong>.</h4>');
      } else {
        divText = divText.concat('<h4>Betting is <strong><span style="color: red">CLOSED</span></strong>.</h4>');
      }
      infoDiv.innerHTML = divText;
      

      const tableDiv = document.getElementById('betting-table');
      if (round.bets.length === 0) {
        tableDiv.innerHTML = '<p>No bets placed yet.</p>';
        return;
      }

      const table = `
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Team</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${round.bets.map(bet => `
              <tr>
                <td>${bet.user}</td>
                <td>${bet.team}</td>
                <td class="text-end">${localeNum.format(bet.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      tableDiv.innerHTML = table;
    });
}

function updateLedger() {
  fetch('/api/ledger')
    .then(res => res.json())
    .then(ledger => {
      const tableDiv = document.getElementById('ledger-table');
      const users = Object.keys(ledger);
      if (users.length === 0) {
        tableDiv.innerHTML = '<p>Ledger is empty.</p>';
        return;
      }

      const table = `
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Bucks</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(user => `
              <tr>
                <td>${user}</td>
                <td class="text-end">${localeNum.format(ledger[user])}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      tableDiv.innerHTML = table;
    });
}

updateBettingInfo();
updateLedger();
setInterval(() => {
  updateBettingInfo();
  updateLedger();
}, 5000);
