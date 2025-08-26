const express = require('express');
const { TikTokLiveChat } = require('tiktok-live-stream-chat-reader');
const app = express();
const PORT = process.env.PORT || 3001;

let liveConnection = new TikTokLiveChat('YOUR_TIKTOK_USERNAME');
const events = [];

liveConnection.connect().then(() => {
  console.log(`Connected to TikTok Live.`);
}).catch(err => {
  console.error('Failed to connect to TikTok Live.', err);
});

liveConnection.on('comment', data => {
  events.push({
    type: 'comment',
    data: { nickname: data.uniqueId, comment: data.comment }
  });
  if (events.length > 50) {
    events.shift();
  }
});

app.get('/api/events', (req, res) => {
  res.json(events);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
