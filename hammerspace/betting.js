
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
      bounty: 0,
    };

    this.loadLedger();
    this.loadCurrentRound();
    this.refundOpenBet();
  }

  async refundOpenBet() {
    console.log('Checking for open bet to refund...');
    console.log('this.currentRound.open:', this.currentRound.open);
    console.log('this.currentRound.bets.length:', this.currentRound.bets.length);
    if (this.currentRound.open && this.currentRound.bets.length > 0) {
      console.warn('Bot restarted with an open bet. Refunding all placed bets.');
      this.ponk.sendMessage('Bot restarted with an open bet. Refunding all placed bets.');
      for (const bet of this.currentRound.bets) {
        this.updateBalance(bet.user, bet.amount);
        this.ponk.sendPrivate(`${bet.user}, your bet of ${bet.amount} has been refunded.`, bet.user);
      }
      this.currentRound = { teamA: null, teamB: null, bets: [], open: false, bounty: 0 };
      await this.saveCurrentRound();
      this.saveLedger();
    }
  }

  async loadCurrentRound() {
    try {
      const data = await this.db.getKeyValue('betting_current_round');
      if (data) {
        this.currentRound = JSON.parse(data);
        if (!this.currentRound.bounty) {
          this.currentRound.bounty = 0;
        }
        console.info('Current betting round loaded.', this.currentRound);
      } else {
        console.info('No current betting round data found in DB.');
      }
    } catch (err) {
      console.error('Error loading current betting round, starting fresh.', err);
      this.currentRound = {
        teamA: null,
        teamB: null,
        bets: [],
        open: false,
        bounty: 0,
      };
    }
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

  async saveCurrentRound() {
    try {
      await this.db.setKeyValue('betting_current_round', JSON.stringify(this.currentRound, null, 2));
    } catch (err) {
      console.error('Error saving current betting round.', err);
    }
  }

  getBalance(user) {
    return this.ledger[user.toLowerCase()] || this.defaultBankroll;
  }

  updateBalance(user, amount) {
    const lowerUser = user.toLowerCase();
    if (!this.ledger.hasOwnProperty(lowerUser)) {
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
      bounty: this.currentRound.bounty || 0,
    };
    await this.saveCurrentRound();
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
    let message = `Betting is open! Today\'s match: ${teamA} vs ${teamB}. Use !bet <team> <amount> to place your bet.`;
    if (this.currentRound.bounty > 0) {
      message += ` The pot starts with a bounty of ${this.currentRound.bounty}!`;
    }
    this.ponk.sendMessage(message);
    return this.currentRound;
  }

  async closeBetting() {
    if (!this.currentRound.open) {
      return { success: false, message: 'Betting is already closed.' };
    }
    this.currentRound.open = false;
    await this.saveCurrentRound();
    this.ponk.sendMessage('Betting is now closed!');
    return { success: true, message: 'Betting closed.' };
  }

  async placeBet(user, team, amount) {
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


    this.updateBalance(lowerUser, -amount);
    this.currentRound.bets.push({ user, team, amount });
    await this.saveCurrentRound();
    return { success: true, message: `Bet placed on ${team} for ${amount} by ${user}.` };
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
    const bounty = this.currentRound.bounty || 0;

    if (winningBets.length === 0) {
      this.currentRound.bounty = bounty + totalLosingPool;
      this.ponk.sendMessage(`Nobody won! The pot of ${totalLosingPool} rolls over to the next round. The new bounty is ${this.currentRound.bounty}.`);
    } else {
        const winners = [];
        winningBets.forEach(bet => {
            const proportion = bet.amount / totalWinningPool;
            const winnings = bet.amount + ((totalLosingPool + bounty) * proportion);
            this.updateBalance(bet.user, winnings);
            winners.push({ user: bet.user, winnings: Math.round(winnings) });
            this.ponk.sendPrivate(`${bet.user}, you won ${Math.round(winnings)} credits!`, bet.user);
        });

        winners.sort((a, b) => b.winnings - a.winnings);
        const topWinners = winners.slice(0, 3).map(winner => `${winner.user} (${winner.winnings})`).join(', ');
        this.ponk.sendMessage(`The winner is ${winner}! Top winners: ${topWinners}.`);
        this.currentRound.bounty = 0;
    }

    // const winnerOdds = await this.db.getTeam(winningTeam);
    // const loserOdds = await this.db.getTeam(losingTeam);

    // await this.db.updateTeamOdds(winningTeam, winnerOdds - 0.1);
    // await this.db.updateTeamOdds(losingTeam, loserOdds + 0.1);

    this.currentRound = { teamA: null, teamB: null, bets: [], open: false, bounty: this.currentRound.bounty };
    await this.saveCurrentRound();
    this.saveLedger();
    return {
        success: true,
        message: `Winner declared: ${winner}. Payouts distributed.`
    };
  }
  
  getLedger() {
    const sortedLedger = Object.entries(this.ledger)
      .map(([user, balance]) => [user, Math.trunc(balance)])
      .sort(([, a], [, b]) => b - a);

    const ledger = Object.fromEntries(sortedLedger.filter(([, balance]) => balance > 0));
    const shame = Object.fromEntries(sortedLedger.filter(([, balance]) => balance <= 0));

    return { ledger, shame };
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
        let amount;
          try {
            if (amountStr.toLowerCase() === 'all') {
              amount = ponk.betting.getBalance(user);
            } else {
              amount = parseInt(amountStr, 10);
            }
            if (!team || isNaN(amount) || amount <= 0) {
                return ponk.sendMessage('Usage: !bet <team> <amount>');
            }
          } catch (err) {
            console.error('Some retard broke it.', err);
        }
        const result = ponk.betting.placeBet(user, team, amount);
        ponk.sendPrivate(result.message, user);
    }.bind(ponk);
    ponk.commands.handlers.bucks = function(user, params, { command, message, rank }) {
      const balance = ponk.betting.getBalance(user);
      ponk.sendPrivate(`You have ${balance} bucks.`, user);
    }.bind(ponk);
    ponk.commands.handlers.addbucks = function(user, params, { command, message, rank }) {
      this.checkPermission({ user, hybrid: 'betadmin' }).then(() => {
        const [targetUser, amountStr] = params.split(' ');
        const amount = parseInt(amountStr, 10);
        if (!targetUser || isNaN(amount)) {
          return this.sendMessage('Usage: !addbucks <user> <amount>');
        }
        this.betting.updateBalance(targetUser, amount);
        this.sendMessage(`${amount} bucks added to ${targetUser}.`);
      }).catch((err) => {
        this.sendPrivate(err, user);
      });
    }.bind(ponk);
  }
};
