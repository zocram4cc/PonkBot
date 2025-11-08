// betting.js - Saltybet-style betting logic for PonkBot

class Betting {
  constructor(ponk) {
    this.ponk = ponk;
    this.db = ponk.db;
    this.config = ponk.betting || {};
    this.defaultBankroll = this.config.defaultBankroll || 1000;
    this.config.betCapPercentage = this.config.betCapPercentage || 0.20; // Max 20% of bankroll
    this.config.debtBetCap = this.config.debtBetCap || 500; // Max $500 bet if broke/in debt
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
    this.loadAllowDraw();

    // Set up the hourly economic decay
    //setInterval(() => this.applyEconomicDecay(), 3600 * 1000);
    this.config.betTaxTiers = this.config.betTaxTiers || [
      { threshold: 100000, rate: 0 },
      { threshold: 1000000, rate: 0.10 }, // 1%
      { threshold: 10000000, rate: 0.20 }, // 5%
      { threshold: 100000000, rate: 0.30 },
      { threshold: 1000000000, rate: 0.40 },
      { threshold: 10000000000, rate: 0.50 },
      { threshold: 100000000000, rate: 0.75 },
      { threshold: 1000000000000, rate: 0.9 },
      { threshold: Infinity, rate: 0.95 } // 30% for over 10,000
    ];
  }

  applyEconomicDecay() {
    let hadPositiveDecay = false;
    let hadNegativeDecay = false;

    for (const user in this.ledger) {
      const balance = this.ledger[user];
      if (balance > 2000000) {
        this.ledger[user] *= 0.995; // 0.2% decay for positive balances
        if (balance > 100000000000) {
          this.ledger[user] *= 0.9;
        }
        hadPositiveDecay = true;
      }
      else if (balance < -20000) { 
        this.ledger[user] *= 0.995; // 0.5% decay towards zero for negative balances
        hadNegativeDecay = true;
	if (balance < -10000000000) {
	  this.ledger[user] *= 0.9;
	}
      }
    }
    if (hadPositiveDecay || hadNegativeDecay) {
      this.saveLedger();
    }
  }

  async refundCurrentRound() {
    console.log('Checking for open bet to refund...');
    console.log('this.currentRound.open:', this.currentRound.open);
    console.log('this.currentRound.bets.length:', this.currentRound.bets.length);
    if (this.currentRound.open && this.currentRound.bets.length > 0) {
      console.warn('Bot restarted with an open bet. Refunding all placed bets.');
      this.ponk.sendMessage('Bot restarted with an open bet. Refunding all placed bets.');
      for (const bet of this.currentRound.bets) {
        this.updateBalance(bet.user, bet.amount);
        this.ponk.sendPrivate(`${bet.user}, your bet of ${bet.amount.toLocaleString()} has been refunded.`, bet.user);
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

  async loadAllowDraw() {
    try {
      const data = await this.db.getKeyValue('betting_allow_draw');
      if (data) {
        this.allowDraw = JSON.parse(data);
        console.info('Betting allowDraw loaded.', this.allowDraw);
      } else {
        this.allowDraw = this.config.allowDraw || false;
        console.info('No betting allowDraw data found in DB, defaulting to', this.allowDraw);
      }
    } catch (err) {
      console.error('Error loading betting allowDraw, defaulting to false.', err);
      this.allowDraw = false;
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

  async saveAllowDraw() {
    try {
      await this.db.setKeyValue('betting_allow_draw', JSON.stringify(this.allowDraw));
    } catch (err) {
      console.error('Error saving betting allowDraw.', err);
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
    let message = `Betting is open for ${teamA} vs ${teamB}. Use !bet /team/ <amount> to place your bet.`;
    if (this.allowDraw) {
      message += ' You can also bet on a draw. Use !bet draw <amount>.';
    }
    if (this.currentRound.bounty > 0) {
      message += ` The pot starts with a bounty of ${this.currentRound.bounty.toLocaleString()}!`;
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
    const validTeams = [this.currentRound.teamA.toLowerCase(), this.currentRound.teamB.toLowerCase()];
    if (this.allowDraw) {
      validTeams.push('draw');
    }
    if (!validTeams.includes(team.toLowerCase())) {
      return { success: false, message: 'Invalid team.' };
    }
    if (this.currentRound.bets.some(bet => bet.user.toLowerCase() === lowerUser)) {
        return { success: false, message: 'You have already placed a bet for this round.' };
    }

    let currentBalance = this.getBalance(lowerUser); // Get current balance
    let maxBet;
    if (currentBalance > 0) {
        // User has money: Cap is a percentage of their bankroll
        maxBet = Math.max(1, Math.floor(currentBalance * this.config.betCapPercentage));
        if (maxBet < amount) {
          amount = maxBet
          this.ponk.sendPrivate(`Your bet is too high! You can only bet up to ${this.config.betCapPercentage * 100}% of your bankroll. Your bet has been capped at $${amount.toLocaleString()}.`, user);
        }
    } else {
        // User is at 0 or in debt: Cap is a flat "mercy" amount
        if (this.config.debtBetCap < amount) {
          amount = this.config.debtBetCap
          this.ponk.sendPrivate(`You broke nigga, I can only lend you $${this.config.debtBetCap.toLocaleString()}. Your bet has been capped at $${amount.toLocaleString()}.`, user);
        }
    }
    // Apply Big Bet Tax
    let taxAmount = 0;
    let effectiveAmount = amount;
    let taxRate = 0;

    for (const tier of this.config.betTaxTiers) {
      if (amount >= tier.threshold) {
        taxRate = tier.rate;
      }
    }

    if (taxRate > 0) {
      taxAmount = Math.round(amount * taxRate);
      effectiveAmount = amount - taxAmount;
      const taxMessage = `Whoa there, Mr. Moneybags! A bet this size requires 'regulatory oversight.' I'm taking my ${taxRate * 100}% 'Big Bet Tax' ($${taxAmount}) off the top. Your actual bet is $${effectiveAmount.toLocaleString()}. Good luck.`;
      this.ponk.sendPrivate(taxMessage, user);
    }

    this.updateBalance(lowerUser, -amount); // Deduct original amount including tax (potentially modified by CBR)
    this.currentRound.bets.push({ user, team, amount: effectiveAmount }); // Bet with effective amount (potentially modified by CBR and tax)
    await this.saveCurrentRound();
    return { success: true, message: `Bet placed on ${team} for ${effectiveAmount.toLocaleString()} by ${user}.` };
  }

  async resolveRound(winner) {
    if (!this.currentRound.teamA || !this.currentRound.teamB) {
      return { success: false, message: 'No active betting round to resolve.' };
    }
    if (this.currentRound.open) {
      this.closeBetting();
    }
    const winningTeam = winner.toLowerCase();
    if (winningTeam === 'draw' && !this.allowDraw) {
      return { success: false, message: 'Draws are not enabled for this round.' };
    }

    const winningBets = this.currentRound.bets.filter(bet => bet.team.toLowerCase() === winningTeam);
    const losingBets = this.currentRound.bets.filter(bet => bet.team.toLowerCase() !== winningTeam);

    const totalWinningPool = winningBets.reduce((sum, bet) => sum + bet.amount, 0);
    const totalLosingPool = losingBets.reduce((sum, bet) => sum + bet.amount, 0);
    const bounty = this.currentRound.bounty || 0;

    if (winningBets.length === 0) {
      this.currentRound.bounty = bounty + totalLosingPool;
      this.ponk.sendMessage(`Nobody won! The pot of ${totalLosingPool.toLocaleString()} rolls over to the next round. The new bounty is ${this.currentRound.bounty.toLocaleString()}.`);
    } else {
        const winners = [];
        winningBets.forEach(bet => {
            const proportion = bet.amount / totalWinningPool;
            const winnings = bet.amount + ((totalLosingPool + bounty) * proportion);
            this.updateBalance(bet.user, winnings);
            winners.push({ user: bet.user, winnings: Math.round(winnings) });
            //this.ponk.sendPrivate(`${bet.user}, you won ${Math.round(winnings)} credits!`, bet.user);
        });

        winners.sort((a, b) => b.winnings - a.winnings);
        const topWinners = winners.slice(0, 3).map(winner => `${winner.user} (${winner.winnings.toLocaleString()})`).join(', ');
        if (winningTeam === 'draw') {
          this.ponk.sendMessage(`The result is a draw! Top winners: ${topWinners}.`);
        }
        else {
          this.ponk.sendMessage(`The winner is ${winner}! Top winners: ${topWinners}.`);
        }
        this.currentRound.bounty = 0;
    }

    // const winnerOdds = await this.db.getTeam(winningTeam);
    // const loserOdds = await this.db.getTeam(losingTeam);

    // await this.db.updateTeamOdds(winningTeam, winnerOdds - 0.1);
    // await this.db.updateTeamOdds(losingTeam, loserOdds + 0.1);

    this.currentRound = { teamA: null, teamB: null, bets: [], open: false, bounty: this.currentRound.bounty };
    await this.saveCurrentRound();
    this.saveLedger();
    this.applyEconomicDecay(); // Apply economic decay after round resolution
    return {
        success: true,
        message: `Winner declared: ${winner}. Payouts distributed.`
    };
  }
  
  getLedger() {
    const sortedLedger = Object.entries(this.ledger)
      .map(([user, balance]) => [user, Math.trunc(balance)])
      .sort(([, a], [, b]) => b - a);

    const ledger = sortedLedger
      .filter(([, balance]) => balance > 0)
      .map(([user, balance]) => ({ user, balance }));
    const shame = sortedLedger
      .filter(([, balance]) => balance <= 0)
      .map(([user, balance]) => ({ user, balance }));

    return { ledger, shame };
  }

  getCurrentBets() {
    const teamATotal = this.currentRound.bets
      .filter(bet => bet.team.toLowerCase() === this.currentRound.teamA.toLowerCase())
      .reduce((sum, bet) => sum + bet.amount, 0);
    const teamBTotal = this.currentRound.bets
      .filter(bet => bet.team.toLowerCase() === this.currentRound.teamB.toLowerCase())
      .reduce((sum, bet) => sum + bet.amount, 0);
    const totals = {
      [this.currentRound.teamA]: teamATotal,
      [this.currentRound.teamB]: teamBTotal,
    };
    if (this.allowDraw) {
      totals.draw = this.currentRound.bets
        .filter(bet => bet.team.toLowerCase() === 'draw')
        .reduce((sum, bet) => sum + bet.amount, 0);
    }

    return {
      round: {
        teamA: this.currentRound.teamA,
        teamB: this.currentRound.teamB,
        bets: this.currentRound.bets,
        open: this.currentRound.open,
        bounty: this.currentRound.bounty,
        allowDraw: this.allowDraw
      },
      totals,
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
            if (!team || isNaN(amount) || amount <= 0 || amount >= Number.MAX_SAFE_INTEGER) {
                return ponk.sendPrivate('Usage: !bet <team> <amount>', user);
            }
          } catch (err) {
            console.error('Some retard broke it.', err);
            return ponk.sendPrivate('Invalid bet amount. Please enter a whole number.', user);
        }
        const result = ponk.betting.placeBet(user, team, amount);
        ponk.sendPrivate(result.message, user);
    }.bind(ponk);
    ponk.commands.handlers.bucks = function(user, params, { command, message, rank }) {
      const balance = ponk.betting.getBalance(user);
      ponk.sendPrivate(`You have ${balance.toLocaleString()} bucks.`, user);
    }.bind(ponk);
    ponk.commands.handlers.addbucks = function(user, params, { command, message, rank }) {
      this.checkPermission({ user, hybrid: 'betadmin' }).then(() => {
        const [targetUser, amountStr] = params.split(' ');
        const amount = parseInt(amountStr, 10);
        if (!targetUser || isNaN(amount)) {
          return this.sendMessage('Usage: !addbucks <user> <amount>');
        }
        this.betting.updateBalance(targetUser, amount);
        this.sendMessage(`${amount.toLocaleString()} bucks added to ${targetUser}.`);
      }).catch((err) => {
        this.sendPrivate(err, user);
      });
    }.bind(ponk);
    ponk.commands.handlers.betdraw = function(user, params, { command, message, rank }) {
      this.checkPermission({ user, hybrid: 'betadmin' }).then(() => {
        const [option] = params.split(' ');
        if (option === 'on') {
          this.betting.allowDraw = true;
          this.sendMessage('Betting on draws is now enabled.');
        } else if (option === 'off') {
          this.betting.allowDraw = false;
          this.sendMessage('Betting on draws is now disabled.');
        } else {
          this.sendMessage('Usage: !betdraw <on|off>');
          return;
        }
        this.betting.saveAllowDraw();
      }).catch((err) => {
        this.sendPrivate(err, user);
      });
    }.bind(ponk);
    ponk.commands.handlers.betdecay = function(user, params, { command, message, rank }) {
        this.checkPermission({ user, hybrid: 'betadmin' }).then(() => {
            this.betting.applyEconomicDecay();
            this.sendMessage(`${user} triggered economic decay! Get his ass!`);
        }).catch((err) => {
            this.sendPrivate(err, user);
        });
    }.bind(ponk);
    ponk.commands.handlers.refundround = function(user, params, { command, message, rank }) {
        this.checkPermission({ user, hybrid: 'betadmin' }).then(() => {
            this.betting.refundCurrentRound();
        }).catch((err) => {
            this.sendPrivate(err, user);
        });
    }.bind(ponk);
    ponk.commands.handlers.topbets = function(user, params, { command, message, rank }) {
        const { ledger } = this.betting.getLedger();
        const top = ledger.slice(0, 5)
            .map(({user, balance}) => `${user}: ${balance.toLocaleString()}`)
            .join(', ');
        this.sendMessage(`Top 5 bettors: ${top}`);
    }.bind(ponk);
    ponk.commands.handlers.forcebet = function(user, params, { command, message, rank }) {
        this.checkPermission({ user, hybrid: 'betadmin' }).then(() => {
            const [teamA, teamB] = params.split(' ');
            if (!teamA || !teamB) {
                return this.sendMessage('Usage: !forcebet <teamA> <teamB>');
            }
            this.betting.startRound(teamA, teamB);
        }).catch((err) => {
            this.sendPrivate(err, user);
        });
    }.bind(ponk);
    ponk.commands.handlers.forceclose = function(user, params, { command, message, rank }) {
        this.checkPermission({ user, hybrid: 'betadmin' }).then(() => {
            const result = this.betting.closeBetting();
            this.sendMessage(result.message);
        }).catch((err) => {
            this.sendPrivate(err, user);
        });
    }.bind(ponk);
    ponk.commands.handlers.forcewinner = function(user, params, { command, message, rank }) {
        this.checkPermission({ user, hybrid: 'betadmin' }).then(() => {
            const winner = params.split(' ')[0];
            if (!winner) {
                return this.sendPrivate('You must specify a winner.', user);
            }
            const result = this.betting.resolveRound(winner);
            this.sendMessage(result.message);
        }).catch((err) => {
            this.sendPrivate(err, user);
        });
    }.bind(ponk);
  }
};
