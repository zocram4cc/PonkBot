'use strict';

const GT4CC = require('../lib/gt4cc.js');

module.exports = {
    name: 'gt4cc',
    init: (ponk) => {
        const gt4cc = new GT4CC(ponk.API.gt4cc || {});

        ponk.commands.handlers.racefinish = function(user, params, { command, message, rank }) {
            this.checkPermission({ user, hybrid: 'betadmin' }).then(() => {
                this.sendMessage('Fetching GT4CC race results...');
                gt4cc.fetchRankings().then(results => {
                    const timestamp = Math.floor(Date.now() / 1000);
                    const raceName = params || `Race ${new Date().toISOString().split('T')[0]}`;
                    
                    this.db.gt4ccSaveRace(timestamp, raceName, results).then(raceId => {
                        this.sendPrivate(`Race "${raceName}" finished and saved! ID: ${raceId}`, user);
                    }).catch(err => {
                        this.logger.error('Error saving race results:', err);
                        this.sendPrivate('Error saving race results to database.', user);
                    });
                }).catch(err => {
                    this.logger.error('Error fetching GT4CC rankings:', err);
                    this.sendPrivate('Error fetching rankings from SimHub. Is the race running?', user);
                });
            }).catch((err) => {
                this.sendPrivate(err, user);
            });
        }.bind(ponk);
    }
};
