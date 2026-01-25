// www/js/gt4cc.js

function loadChampionship() {
    fetch('/api/gt4cc/championship')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('championship-table');
            if (data.length === 0) {
                container.innerHTML = '<p>No data available.</p>';
                return;
            }

            let html = `
                <table class="table table-striped table-hover">
                    <thead class="table-dark">
                        <tr>
                            <th>Rank</th>
                            <th>Driver</th>
                            <th>Points</th>
                            <th>Races</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            data.forEach((entry, index) => {
                html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${entry.driver}</td>
                        <td>${entry.total_points}</td>
                        <td>${entry.races_participated}</td>
                    </tr>
                `;
            });

            html += '</tbody></table>';
            container.innerHTML = html;
        });
}

function loadRaces() {
    fetch('/api/gt4cc/races')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('races-list');
            if (data.length === 0) {
                container.innerHTML = '<p>No races found.</p>';
                return;
            }

            let html = '';
            data.forEach(race => {
                const date = new Date(race.timestamp * 1000).toLocaleString();
                const escapedName = JSON.stringify(race.name).replace(/"/g, '&quot;');
                html += `
                    <button type="button" class="list-group-item list-group-item-action" onclick="loadRaceDetails(${race.id}, ${escapedName})">
                        <strong>${race.name}</strong><br>
                        <small>${date}</small>
                    </button>
                `;
            });
            container.innerHTML = html;
        });
}

function loadRaceDetails(id, name) {
    const container = document.getElementById('race-details');
    container.innerHTML = '<p>Loading...</p>';

    fetch(`/api/gt4cc/race/${id}`)
        .then(res => res.json())
        .then(data => {
            let html = `<h3>${name}</h3>`;
            html += `
                <table class="table table-sm table-striped">
                    <thead class="table-dark">
                        <tr>
                            <th>Pos</th>
                            <th>Driver</th>
                            <th>Points</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            data.forEach(result => {
                html += `
                    <tr>
                        <td>${result.position}</td>
                        <td>${result.driver}</td>
                        <td>${result.points}</td>
                    </tr>
                `;
            });

            html += '</tbody></table>';
            container.innerHTML = html;
        });
}

// Initial load
loadChampionship();
loadRaces();
