const express = require('express');
const { WebcastPushConnection } = require('tiktok-live-chat');
const app = express();
const PORT = process.env.PORT || 3001;
 
let liveConnection = new WebcastPushConnection('YOUR_TIKTOK_USERNAME');
const events = [];
 
liveConnection.connect().then(state => {
  console.log(`Connected to TikTok Live. State: ${JSON.stringify(state)}`);
}).catch(err => {
  console.error('Failed to connect to TikTok Live.', err);
});
 
liveConnection.on('chat', data => {
  events.push({
    type: 'comment',
    data: { nickname: data.nickname, comment: data.comment }
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
