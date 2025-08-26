// App.jsx
import { useEffect, useState, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import {
  ChatBubbleBottomCenterTextIcon,
  Cog6ToothIcon,
  SwatchIcon,
  PlayCircleIcon,
  PauseCircleIcon,
} from '@heroicons/react/24/solid';

// Define the global Firebase variables if they exist
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Ensure this is a complete, self-contained component.
const App = () => {
  // State for Firebase services and user data
  const [firebase, setFirebase] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // App-specific state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [streamStatus, setStreamStatus] = useState('disconnected');
  const [isLive, setIsLive] = useState(false);
  const [userName, setUserName] = useState('');
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState({
    voice: 'Kore',
    volume: 1.0,
    speed: 1.0,
    readComments: true,
  });

  // TTS and audio state
  const [isPlaying, setIsPlaying] = useState(false);
  const audioQueue = useRef([]);
  const audioContextRef = useRef(null);
  const audioSourceRef = useRef(null);
  const audioBufferRef = useRef(null);
  const audioPlayingPromise = useRef(null);

  // Firestore path for user settings
  const getSettingsDocPath = (uid) => `/artifacts/${appId}/users/${uid}/app-settings/tikfinity-settings`;

  // --- Real-time data simulation ---
  // In a real app, this would be a WebSocket connection to a Node.js server
  const eventSimulationInterval = useRef(null);
  const simulatedEvents = [
    { type: 'comment', data: { nickname: 'JaneDoe', comment: 'This is a test comment.' } },
    { type: 'gift', data: { nickname: 'JohnS', giftName: 'Rose', count: 1 } },
    { type: 'comment', data: { nickname: 'Alex99', comment: 'Hello everyone! Glad to be here.' } },
    { type: 'follow', data: { nickname: 'StreamFan' } },
    { type: 'gift', data: { nickname: 'Alice', giftName: 'Heart', count: 10 } },
    { type: 'comment', data: { nickname: 'Bob', comment: 'Hey, is the sound working?' } },
    { type: 'like', data: { nickname: 'Liker123', count: 50 } },
    { type: 'comment', data: { nickname: 'Charlie', comment: 'Can you read this out loud?' } },
  ];
  let currentEventIndex = 0;

  const startSimulatedStream = () => {
    if (eventSimulationInterval.current) return;
    setEvents([]);
    setIsLive(true);
    setStreamStatus('connected');
    eventSimulationInterval.current = setInterval(() => {
      if (currentEventIndex >= simulatedEvents.length) {
        currentEventIndex = 0; // Loop the events
      }
      const newEvent = simulatedEvents[currentEventIndex];
      setEvents((prevEvents) => [newEvent, ...prevEvents].slice(0, 10)); // Keep a max of 10 events
      currentEventIndex++;
    }, 2500); // Add a new event every 2.5 seconds
  };

  const stopSimulatedStream = () => {
    if (eventSimulationInterval.current) {
      clearInterval(eventSimulationInterval.current);
      eventSimulationInterval.current = null;
      setIsLive(false);
      setStreamStatus('disconnected');
      setEvents([]);
    }
  };

  // --- Firebase & Firestore setup ---
  useEffect(() => {
    if (!firebaseConfig) {
      console.error('Firebase config is not defined.');
      return;
    }
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    const setupAuthAndDb = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error('Firebase authentication failed:', e);
      }
    };

    setupAuthAndDb();

    // Set up auth state change listener
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setFirebase({ app, auth, db });
        const settingsDocRef = doc(db, getSettingsDocPath(currentUser.uid));
        // Set up real-time listener for settings
        onSnapshot(settingsDocRef, (docSnap) => {
          if (docSnap.exists()) {
            setSettings(docSnap.data());
            console.log("Settings updated from Firestore.");
          } else {
            // Create default settings if they don't exist
            setDoc(settingsDocRef, settings);
          }
        }, (error) => {
          console.error("Error listening to settings:", error);
        });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // --- TTS Functionality ---
  const playNextInQueue = async () => {
    if (audioQueue.current.length === 0 || isPlaying) {
      setIsPlaying(false);
      return;
    }

    const nextAudioData = audioQueue.current.shift();
    setIsPlaying(true);

    try {
      const audioContext = audioContextRef.current || new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
      }

      const audioBuffer = await audioContext.decodeAudioData(base64ToArrayBuffer(nextAudioData));
      audioBufferRef.current = audioBuffer;
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
      audioSourceRef.current = source;
      
      // Use a Promise to track when the audio has finished
      audioPlayingPromise.current = new Promise((resolve) => {
        source.onended = () => {
          resolve();
        };
      });

      await audioPlayingPromise.current;
      playNextInQueue(); // Play the next item in the queue
    } catch (e) {
      console.error("Error playing audio:", e);
      setIsPlaying(false);
      playNextInQueue();
    }
  };

  const textToSpeech = async (text) => {
    const payload = {
      contents: [{
        parts: [{ text: text }]
      }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: settings.voice }
          }
        }
      },
      model: "gemini-2.5-flash-preview-tts"
    };

    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API call failed with status: ${response.status}`);
      }

      const result = await response.json();
      const audioData = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (audioData) {
        audioQueue.current.push(audioData);
        if (!isPlaying) {
          playNextInQueue();
        }
      }
    } catch (e) {
      console.error("Error generating speech:", e);
    }
  };
  
  // Helper to convert base64 to ArrayBuffer for audio playback
  const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Use a useEffect to listen for new events and trigger TTS
  useEffect(() => {
    if (events.length > 0 && settings.readComments) {
      const latestEvent = events[0];
      if (latestEvent.type === 'comment') {
        const textToRead = `${latestEvent.data.nickname} said, "${latestEvent.data.comment}"`;
        textToSpeech(textToRead);
      }
    }
  }, [events, settings.readComments]);

  // Handle saving settings to Firestore
  const saveSettings = async () => {
    if (!user || !firebase) {
      console.error('User or Firebase not initialized.');
      return;
    }
    try {
      const settingsDocRef = doc(firebase.db, getSettingsDocPath(user.uid));
      await setDoc(settingsDocRef, settings);
      console.log("Settings saved successfully.");
    } catch (e) {
      console.error("Error saving settings:", e);
    }
  };

  // UI Components
  const TabButton = ({ tabId, label, icon }) => (
    <button
      onClick={() => setActiveTab(tabId)}
      className={`flex-1 p-2 flex flex-col items-center justify-center space-y-1 transition-colors duration-200
                  ${activeTab === tabId ? 'text-purple-500' : 'text-gray-400 hover:text-purple-300'}`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );

  const Dashboard = () => (
    <div className="p-4 space-y-4">
      <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-200">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Live Stream Dashboard</h2>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            className="flex-grow p-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Enter TikTok username"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
          <button
            onClick={isLive ? stopSimulatedStream : startSimulatedStream}
            className={`p-3 rounded-full text-white shadow-md transition-all duration-300
                        ${isLive ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
          >
            {isLive ? <PauseCircleIcon className="h-6 w-6" /> : <PlayCircleIcon className="h-6 w-6" />}
          </button>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          Status: <span className={`font-semibold ${isLive ? 'text-green-500' : 'text-red-500'}`}>{streamStatus}</span>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-200 h-[400px] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Events</h2>
        {events.length > 0 ? (
          <ul className="space-y-3">
            {events.map((event, index) => (
              <li key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg shadow-sm">
                <span className="text-sm font-semibold text-gray-600">
                  {event.type === 'comment' && (
                    <span className="font-bold text-purple-600">{event.data.nickname}:</span>
                  )}
                  {event.type === 'gift' && (
                    <span className="font-bold text-pink-600">{event.data.nickname} gifted:</span>
                  )}
                  {event.type === 'follow' && (
                    <span className="font-bold text-blue-600">{event.data.nickname} followed!</span>
                  )}
                  {event.type === 'like' && (
                    <span className="font-bold text-yellow-600">{event.data.nickname} liked!</span>
                  )}
                </span>
                <span className="flex-1 text-sm text-gray-800">
                  {event.type === 'comment' && event.data.comment}
                  {event.type === 'gift' && `${event.data.count}x ${event.data.giftName}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center text-gray-500 py-10">No events yet. Start a stream to see live data.</div>
        )}
      </div>
    </div>
  );

  const Settings = () => (
    <div className="p-4 space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Text-to-Speech Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Voice</label>
            <select
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-purple-500 focus:border-purple-500"
              value={settings.voice}
              onChange={(e) => setSettings({ ...settings, voice: e.target.value })}
            >
              <option value="Kore">Kore (Firm)</option>
              <option value="Puck">Puck (Upbeat)</option>
              <option value="Zephyr">Zephyr (Bright)</option>
              <option value="Algenib">Algenib (Gravelly)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Volume</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.volume}
              onChange={(e) => setSettings({ ...settings, volume: parseFloat(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-sm text-gray-500">{settings.volume.toFixed(1)}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Speaking Speed</label>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={settings.speed}
              onChange={(e) => setSettings({ ...settings, speed: parseFloat(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-sm text-gray-500">{settings.speed.toFixed(1)}x</span>
          </div>
          <div className="flex items-center">
            <input
              id="readCommentsToggle"
              type="checkbox"
              checked={settings.readComments}
              onChange={(e) => setSettings({ ...settings, readComments: e.target.checked })}
              className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
            />
            <label htmlFor="readCommentsToggle" className="ml-2 block text-sm text-gray-900">
              Read comments aloud
            </label>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={saveSettings}
          className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-6 rounded-full shadow-lg transition-colors duration-200"
        >
          Save Settings
        </button>
      </div>
      <div className="mt-4 p-4 text-sm text-center text-gray-500">
        <p>Your unique User ID: <span className="font-mono break-all">{user?.uid || 'Not authenticated'}</span></p>
      </div>
    </div>
  );

  const Gallery = () => (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold text-gray-800 text-center">Gallery Coming Soon!</h2>
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
        <p className="text-gray-600 text-center">
          This section will allow you to browse different voice packs and sound effect widgets for your stream.
          <br />
          Think of it as an asset library for your live stream overlays.
        </p>
      </div>
    </div>
  );
  
  // Main App container
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="text-purple-500 font-bold text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen font-sans bg-gray-100">
      {/* Top Bar with Title */}
      <header className="bg-white p-4 shadow-md z-10">
        <h1 className="text-center text-2xl font-extrabold text-purple-600">My Tikfinity App</h1>
      </header>

      {/* Main Content Area based on activeTab */}
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'settings' && <Settings />}
        {activeTab === 'gallery' && <Gallery />}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="bg-white p-2 shadow-inner border-t border-gray-200 z-10">
        <div className="flex justify-around">
          <TabButton tabId="dashboard" label="Dashboard" icon={<ChatBubbleBottomCenterTextIcon className="h-6 w-6" />} />
          <TabButton tabId="settings" label="Settings" icon={<Cog6ToothIcon className="h-6 w-6" />} />
          <TabButton tabId="gallery" label="Gallery" icon={<SwatchIcon className="h-6 w-6" />} />
        </div>
      </nav>
    </div>
  );
};

export default App;
