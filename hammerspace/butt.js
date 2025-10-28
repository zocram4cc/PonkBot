module.exports = {
  name: 'butt',
  init: (ponk) => {
    ponk.on('message', ({ user, message }) => {
      if (user === ponk.name) {
        return;
      }
      if (Math.random() < 0.0001) {
        const cleanMessage = message.replace(/<span style="display:none" class="teamColorSpan">-team.*?<\/span>/g, '').trim();
        const words = cleanMessage.split(' ');
        if (words.length > 0) {
          const randomIndex = Math.floor(Math.random() * words.length);
          words[randomIndex] = 'butt';
          ponk.sendMessage(words.join(' '));
        }
      }
    });
  }
};