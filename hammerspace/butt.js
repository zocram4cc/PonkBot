module.exports = {
  name: 'butt',
  init: (ponk) => {
    let lastButtMessageTime = 0; // Initialize cooldown timer
    const cooldownPeriod = 90 * 1000; // 30 seconds cooldown
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
        const cleanMessage = message.replace(/<.*?>.*?<\/.*?>|<[^>]*>/g, '').trim();
        const words = cleanMessage.split(' ');
        if (words.length > 1) {
          const randomIndex = Math.floor(Math.random() * words.length);
          words[randomIndex] = 'butt';
          ponk.sendMessage(ponk.filterChat(words.join(' ')));
          lastButtMessageTime = Date.now(); // Reset cooldown
        }
      }
    });
  }
};
