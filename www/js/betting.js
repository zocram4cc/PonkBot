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
        `;
      }

      document.getElementById('team-a-name').textContent = round.teamA;
      document.getElementById('team-b-name').textContent = round.teamB;

      const teamABets = round.bets.filter(bet => bet.team.toLowerCase() === round.teamA.toLowerCase());
      const teamBBets = round.bets.filter(bet => bet.team.toLowerCase() === round.teamB.toLowerCase());

      const teamATableDiv = document.getElementById('team-a-table');
      if (teamABets.length === 0) {
        teamATableDiv.innerHTML = '<p>No bets placed yet.</p>';
      } else {
        const table = `
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${teamABets.map(bet => `
                <tr>
                  <td>${bet.user}</td>
                  <td>${bet.amount.toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        teamATableDiv.innerHTML = table;
      }

      const teamBTableDiv = document.getElementById('team-b-table');
      if (teamBBets.length === 0) {
        teamBTableDiv.innerHTML = '<p>No bets placed yet.</p>';
      } else {
        const table = `
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${teamBBets.map(bet => `
                <tr>
                  <td>${bet.user}</td>
                  <td>${bet.amount.toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        teamBTableDiv.innerHTML = table;
      }

      const drawBetSection = document.getElementById('draw-bet-section');
      if (round.allowDraw) {
        drawBetSection.style.display = 'block';
        const drawBets = round.bets.filter(bet => bet.team.toLowerCase() === 'draw');
        const drawTableDiv = document.getElementById('draw-table');
        if (drawBets.length === 0) {
          drawTableDiv.innerHTML = '<p>No bets placed yet.</p>';
        } else {
          const table = `
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${drawBets.map(bet => `
                  <tr>
                    <td>${bet.user}</td>
                    <td>${bet.amount.toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          drawTableDiv.innerHTML = table;
        }
      } else {
        drawBetSection.style.display = 'none';
      }

      const totalsDiv = document.getElementById('betting-totals');
      if (!round.teamA || !round.teamB) {
        totalsDiv.style.display = 'none';
      } else {
        totalsDiv.style.display = 'block';
        const totalAmount = Object.values(totals).reduce((a, b) => a + b, 0);
        let totalsHTML = `
          <p>Total on ${round.teamA}: ${totals[round.teamA].toLocaleString()}</p>
          <p>Total on ${round.teamB}: ${totals[round.teamB].toLocaleString()}</p>
        `;
        if (round.allowDraw) {
          totalsHTML += `<p>Total on Draw: ${(totals.draw || 0).toLocaleString()}</p>`;
        }
        totalsHTML += `<p><strong>Total Betting Pool: ${totalAmount.toLocaleString()}</strong></p>`;
        totalsDiv.innerHTML = totalsHTML;
      }
    });
}

function updateLedger() {
  fetch('/api/ledger')
    .then(res => res.json())
    .then(data => {
      const { ledger, shame } = data;

      const ledgerTableDiv = document.getElementById('ledger-table');
      if (ledger.length === 0) {
        ledgerTableDiv.innerHTML = '<p>Ledger is empty.</p>';
      } else {
        const ledgerTable = `
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Bucks</th>
              </tr>
            </thead>
            <tbody>
              ${ledger.map(entry => `
                <tr>
                  <td>${entry.user}</td>
                  <td class="text-end">${localeNum.format(entry.balance)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        ledgerTableDiv.innerHTML = ledgerTable;
      }

      const shameTableDiv = document.getElementById('shame-table');
      if (shame.length === 0) {
        shameTableDiv.innerHTML = '<p>No one is in debt.</p>';
      } else {
        const shameTable = `
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Bucks</th>
              </tr>
            </thead>
            <tbody>
              ${shame.map(entry => `
                <tr>
                  <td>${entry.user}</td>
                  <td>${localeNum.format(entry.balance)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        shameTableDiv.innerHTML = shameTable;
      }
    });
}

updateBettingInfo();
updateLedger();
setInterval(() => {
  updateBettingInfo();
  updateLedger();
}, 5000);