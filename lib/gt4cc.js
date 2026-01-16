'use strict';

const WebSocket = require('ws');

const POINTS = [60, 48, 44, 40, 36, 32, 28, 26, 24, 20, 18, 16, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

class GT4CC {
    constructor(config) {
        this.url = config.url || 'wss://simhub.zocram.duckdns.org/ws';
        this.exclude = config.exclude || ['MarcoZ', 'DrBorisG'];
    }

    fetchRankings() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.url);
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    ws.terminate();
                    reject(new Error('Timeout fetching rankings'));
                }
            }, 10000);

            ws.on('open', () => {
                ws.send("echo|");
                ws.send("pid|1");
                ws.send("mainTemplateLoading|");
                ws.send("registerComponents|/Dashtemplates/GS - Broadcast Timing 30/GS - Broadcast Timing 30.djson");
                ws.send("mainTemplateLoaded|");
            });

            ws.on('message', (data) => {
                const message = data.toString();
                if (message === "-1|echo") return;
                if (!message.includes("1|")) return;

                const jsonString = message.split("1|")[1];
                try {
                    const parsed = JSON.parse(jsonString);
                    const table = parsed?.d?.T;
                    if (!table) return;

                    const rawDrivers = [];
                    // Slot 0
                    if (table["12r0"]) rawDrivers.push(table["12r0"]);

                    let keyBase = 12;
                    // Up to 30 more slots (total 31 potentially, matching scroll.html's loop)
                    for (let i = 0; i < 30; i++) {
                        keyBase += (i < 22) ? 38 : 35;
                        const key = `${keyBase}r0`;
                        let name = table[key];
                        if (name) rawDrivers.push(name);
                    }

                    const results = [];
                    let position = 1;

                    rawDrivers.forEach((rawName) => {
                        const formattedName = this.formatName(rawName);
                        // Ignore drivers in exclusion list (check both raw and formatted)
                        if (this.exclude.includes(formattedName) || this.exclude.includes(rawName)) {
                            return;
                        }

                        // Stop at 30 results as requested
                        if (position > 30) return;

                        const points = POINTS[position - 1] || 0;
                        results.push({
                            position,
                            driver: formattedName,
                            points
                        });
                        position++;
                    });

                    resolved = true;
                    clearTimeout(timeout);
                    ws.close();
                    resolve(results);
                } catch (e) {
                    // Parsing error might happen if message is partial, keep waiting
                }
            });

            ws.on('error', (err) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(err);
                }
            });
        });
    }

    formatName(name) {
        // Exception from scroll.html logic: MarcoZ is usually ignored but we Title Case others
        // We handle exclusion separately, so we just format here
        return name.replace(/_/g, " ")
                   .replace(/\b\w/g, c => c.toUpperCase());
    }
}

module.exports = GT4CC;