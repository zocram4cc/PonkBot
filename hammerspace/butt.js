class Butt {
  constructor(ponk) {
    this.ponk = ponk;
    this.db = ponk.db;
    this.config = ponk.betting || {};
    this.ledger = {};
    
    this.loadLedger();
  }
  
  async loadLedger() {
    try {
      const data = await this.db.getKeyValue('butt_ledger');
      if (data) {
        this.ledger = JSON.parse(data);
        console.info('Butt ledger loaded.');
      }
    } catch (err) {
      console.error('Error loading butt ledger, starting fresh.', err);
      this.ledger = {};
    }
  }

  async saveLedger() {
    try {
      await this.db.setKeyValue('butt_ledger', JSON.stringify(this.ledger, null, 2));
    } catch (err) {
      console.error('Error saving butt ledger.', err);
    }
  }
  
  updateLedger(user, amount) {
    const lowerUser = user.toLowerCase();
    if (!this.ledger.hasOwnProperty(lowerUser)) {
      ledger[lowerUser] = this.defaultBankroll;
    }
    this.ledger[lowerUser] += amount;
    this.saveLedger();
    return this.ledger[lowerUser];
  }

  getButts(user) {
    return this.ledger[user.toLowerCase()] || 0;
  }
}


module.exports = {
  name: 'butt',
  init: (ponk) => {
    ponk.butt = new Butt(ponk);
    
    let lastButtMessageTime = 0; // Initialize cooldown timer
    const cooldownPeriod = 90 * 1000; // 90 seconds cooldown
    const baseProbability = 0.015; // Base probability for 10 users
    const targetUsers = 55; // Target number of users for base probability

    ponk.on('message', ({ user, message }) => {
      if (user === ponk.name) {
        return;
      }
      // Check cooldown
      if (Date.now() - lastButtMessageTime < cooldownPeriod) {
        return; // Still in cooldown, do not send butt message
      }

      const actualUsers = ponk.userlist.length || 1; // Avoid division by zero
      const dynamicProbability = baseProbability * (targetUsers / actualUsers);

      if (Math.random() < dynamicProbability) {
        // It's butt time
        const cleanMessage = message.replace(/<.*?>.*?<\/.*?>|<[^>]*>/g, '').trim();
        const words = cleanMessage.split(' ');
        if (words.length > 1) {
          const randomIndex = Math.floor(Math.random() * words.length);
          words[randomIndex] = 'butt';
          ponk.sendMessage(ponk.filterChat(words.join(' ')));
          lastButtMessageTime = Date.now(); // Reset cooldown
        }
        // Update butt ledger
        updateLedger(user,1);
      }
    });

    ponk.commands.handlers.butt = function(user, params, { command, message, rank }) {
      const buttCount = this.butt.getButts(user);
      const msg = (buttCount > 0) ? `You have ${buttCount.toLocaleString()} butts.` : `You have no butts... yet.`; 
      ponk.sendPrivate(msg, user);
    }.bind(ponk);
    ponk.commands.handlers.resetbutts = function(user, params, { command, message, rank }) {
      this.checkPermission({ user, hybrid: 'betadmin' }).then(() => {
        const targetUser = params;
        if (!targetUser) {
          return this.sendMessage('Usage: !resetbutts <user>');
        }
        this.betting.updateBalance(targetUser, 0);
        this.sendMessage(`${targetUser} now has no butt.`);
      }).catch((err) => {
        this.sendPrivate(err, user);
      });
    }.bind(ponk);
    
  }
};
