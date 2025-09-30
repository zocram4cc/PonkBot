
// betting.js - Saltybet-style betting logic for PonkBot

class Betting {
  constructor(ponk) {
    this.ponk = ponk;
    this.db = ponk.db;
    this.config = ponk.betting || {};
    this.defaultBankroll = this.config.defaultBankroll || 1000;
    this.ledger = {};
    this.currentRound = {
      teamA: null,
      teamB: null,
      bets: [],
      open: false,
    };

    this.loadLedger();
  }

  async loadLedger() {
    try {
      const data = await this.db.getKeyValue('betting_ledger');
      if (data) {
        this.ledger = JSON.parse(data);
        console.info('Betting ledger loaded.');
      }
    } catch (err) {
      console.error('Error loading ledger, starting fresh.', err);
      this.ledger = {};
    }
  }

  async saveLedger() {
    try {
      await this.db.setKeyValue('betting_ledger', JSON.stringify(this.ledger, null, 2));
    } catch (err) {
      console.error('Error saving ledger.', err);
    }
  }

  getBalance(user) {
    return this.ledger[user.toLowerCase()] || this.defaultBankroll;
  }

  updateBalance(user, amount) {
    const lowerUser = user.toLowerCase();
    if (!this.ledger[lowerUser]) {
      this.ledger[lowerUser] = this.defaultBankroll;
    }
    this.ledger[lowerUser] += amount;
    this.saveLedger();
    return this.ledger[lowerUser];
  }

  async startRound(teamA, teamB) {
    this.currentRound = {
      teamA,
      teamB,
      bets: [],
      open: true,
    };
    // let teamA_odds = await this.db.getTeam(teamA);
    // let teamB_odds = await this.db.getTeam(teamB);
    // if (teamA_odds === undefined) {
    //     await this.db.insertTeam(teamA);
    //     teamA_odds = 1.5;
    // }
    // if (teamB_odds === undefined) {
    //     await this.db.insertTeam(teamB);
    //     teamB_odds = 1.5;
    // }
    this.ponk.sendMessage(`Betting is open! Today's match: ${teamA} vs ${teamB}. Use !bet <team> <amount> to place your bet.`);
    return this.currentRound;
  }

  closeBetting() {
    if (!this.currentRound.open) {
      return { success: false, message: 'Betting is already closed.' };
    }
    this.currentRound.open = false;
    this.ponk.sendMessage('Betting is now closed!');
    return { success: true, message: 'Betting closed.' };
  }

  placeBet(user, team, amount) {
    const lowerUser = user.toLowerCase();
    if (!this.currentRound.open) {
      return { success: false, message: 'Betting is closed.' };
    }
    if (team.toLowerCase() !== this.currentRound.teamA.toLowerCase() && team.toLowerCase() !== this.currentRound.teamB.toLowerCase()) {
      return { success: false, message: 'Invalid team.' };
    }
    if (this.currentRound.bets.some(bet => bet.user.toLowerCase() === lowerUser)) {
        return { success: false, message: 'You have already placed a bet for this round.' };
    }
    const balance = this.getBalance(lowerUser);
    if (amount > balance) {
      return { success: false, message: 'You do not have enough credits.' };
    }

    this.updateBalance(lowerUser, -amount);
    this.currentRound.bets.push({ user, team, amount });
    return { success: true, message: `Bet placed on ${team} for ${amount}.` };
  }

  async resolveRound(winner) {
    if (!this.currentRound.teamA || !this.currentRound.teamB) {
      return { success: false, message: 'No active betting round to resolve.' };
    }
    if (this.currentRound.open) {
      this.closeBetting();
    }
    const winningTeam = winner.toLowerCase();
    const losingTeam = (winningTeam === this.currentRound.teamA.toLowerCase()) ? this.currentRound.teamB.toLowerCase() : this.currentRound.teamA.toLowerCase();

    const winningBets = this.currentRound.bets.filter(bet => bet.team.toLowerCase() === winningTeam);
    const losingBets = this.currentRound.bets.filter(bet => bet.team.toLowerCase() === losingTeam);

    const totalWinningPool = winningBets.reduce((sum, bet) => sum + bet.amount, 0);
    const totalLosingPool = losingBets.reduce((sum, bet) => sum + bet.amount, 0);

    if (totalWinningPool > 0) {
        winningBets.forEach(bet => {
            const proportion = bet.amount / totalWinningPool;
            const winnings = bet.amount + (totalLosingPool * proportion);
            this.updateBalance(bet.user, winnings);
            this.ponk.sendMessage(`${bet.user} won ${Math.round(winnings)} credits!`);
        });
    }

    // const winnerOdds = await this.db.getTeam(winningTeam);
    // const loserOdds = await this.db.getTeam(losingTeam);

    // await this.db.updateTeamOdds(winningTeam, winnerOdds - 0.1);
    // await this.db.updateTeamOdds(losingTeam, loserOdds + 0.1);

    this.ponk.sendMessage(`The winner is ${winner}! Payouts complete.`);
    this.currentRound = { teamA: null, teamB: null, bets: [], open: false };
    this.saveLedger();
    return {
        success: true,
        message: `Winner declared: ${winner}. Payouts distributed.`
    };
  }
  
  getLedger() {
    return this.ledger;
  }

  getCurrentBets() {
    const teamATotal = this.currentRound.bets
      .filter(bet => bet.team.toLowerCase() === this.currentRound.teamA.toLowerCase())
      .reduce((sum, bet) => sum + bet.amount, 0);
    const teamBTotal = this.currentRound.bets
      .filter(bet => bet.team.toLowerCase() === this.currentRound.teamB.toLowerCase())
      .reduce((sum, bet) => sum + bet.amount, 0);

    return {
      round: this.currentRound,
      totals: {
        [this.currentRound.teamA]: teamATotal,
        [this.currentRound.teamB]: teamBTotal,
      }
    };
  }
}

module.exports = {
  name: 'betting',
  init: (ponk) => {
    ponk.betting = new Betting(ponk);
    ponk.commands.handlers.bet = function(user, params, { command, message, rank }) {
        const [team, amountStr] = params.split(' ');
        const amount = parseInt(amountStr, 10);
        if (!team || isNaN(amount) || amount <= 0) {
            return ponk.sendMessage('Usage: !bet <team> <amount>');
        }
        const result = ponk.betting.placeBet(user, team, amount);
        ponk.sendMessage(result.message);
    }.bind(ponk);
  }
};
