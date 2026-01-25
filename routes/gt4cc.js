'use strict';

const express = require('express');

module.exports = (ponk) => {
    const router = express.Router();

    const POINTS = [60, 48, 44, 40, 36, 32, 28, 26, 24, 20, 18, 16, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

    router.get('/races', async (req, res) => {
        try {
            const races = await ponk.db.gt4ccGetRaces();
            res.json(races);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/race/:id', async (req, res) => {
        try {
            const results = await ponk.db.gt4ccGetRaceResults(req.params.id);
            res.json(results);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/championship', async (req, res) => {
        try {
            const standings = await ponk.db.gt4ccGetChampionship();
            res.json(standings);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/race', async (req, res) => {
        const { timestamp, name, results } = req.body;
        if (!timestamp || !name || !results || !Array.isArray(results)) {
            return res.status(400).json({ success: false, message: 'Missing fields' });
        }

        // Calculate points if missing
        const processedResults = results.map(r => {
            if (r.points !== undefined) return r;
            const points = POINTS[r.position - 1] || 0;
            return { ...r, points };
        });

        try {
            const raceId = await ponk.db.gt4ccSaveRace(timestamp, name, processedResults);
            res.json({ success: true, raceId });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/race/:id', async (req, res) => {
        try {
            await ponk.db.gt4ccDeleteRace(req.params.id);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.put('/race/:id', async (req, res) => {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, message: 'Missing name' });
        }
        try {
            await ponk.db.gt4ccUpdateRaceTitle(req.params.id, name);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/race/:id/exchange', async (req, res) => {
        const { pos1, pos2 } = req.body;
        if (!pos1 || !pos2) {
            return res.status(400).json({ success: false, message: 'Missing positions' });
        }
        try {
            await ponk.db.gt4ccExchangeResults(req.params.id, parseInt(pos1), parseInt(pos2));
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};