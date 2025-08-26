import React, { useState, useEffect } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { ChatBubbleLeftRightIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';

// The following variables are provided by the hosting environment.
// DO NOT MODIFY THEM.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [userId, setUserId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Authenticate the user with Firebase
    const authenticate = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Firebase authentication failed:", error);
      }
    };

    authenticate();

    // Listen for auth state changes
    const unsubscribeAuth = auth.onAuthStateChanged(user => {
      if (user) {
        setUserId(user.uid);
        setIsConnected(true);
      } else {
        setUserId(null);
        setIsConnected(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Use a public collection for a shared chat
    const publicCollectionPath = `artifacts/${appId}/public/data/messages`;
    const q = query(collection(db, publicCollectionPath));

    const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => doc.data()).sort((a, b) => a.timestamp - b.timestamp);
      setMessages(newMessages);
    }, (error) => {
      console.error("Failed to fetch messages:", error);
    });

    return () => unsubscribeFirestore();
  }, [userId]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (input.trim() === '' || !userId) {
      return;
    }

    try {
      // Add a new message to the public collection
      const publicCollectionPath = `artifacts/${appId}/public/data/messages`;
      await addDoc(collection(db, publicCollectionPath), {
        text: input,
        userId: userId,
        timestamp: serverTimestamp(),
      });
      setInput('');
    } catch (error) {
      console.error("Error adding document: ", error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans p-4 antialiased">
      <div className="flex-grow overflow-y-auto mb-4 p-4 rounded-lg shadow-md bg-white dark:bg-gray-800 transition-colors duration-300">
        <h1 className="text-3xl font-bold mb-4 text-center text-blue-600 dark:text-blue-400">Collaborative Chat</h1>
        <div className="flex flex-col space-y-2">
          {messages.length > 0 ? (
            messages.map((msg, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg max-w-[80%] break-words ${
                  msg.userId === userId
                    ? 'self-end bg-blue-500 text-white dark:bg-blue-700'
                    : 'self-start bg-gray-300 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                } transition-all duration-300 ease-in-out`}
              >
                <div className="text-xs font-semibold mb-1 opacity-75">
                  User ID: {msg.userId}
                </div>
                {msg.text}
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500 dark:text-gray-400 mt-20">
              No messages yet. Say something!
            </div>
          )}
        </div>
      </div>

      <form onSubmit={sendMessage} className="flex p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={!isConnected}
          className="flex-grow p-3 bg-transparent border-none focus:outline-none placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-gray-100"
        />
        <button
          type="submit"
          disabled={!isConnected}
          className="p-3 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-lg ml-2 transition-transform transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PaperAirplaneIcon className="h-5 w-5 rotate-90" />
        </button>
      </form>
    </div>
  );
}

export default App;
