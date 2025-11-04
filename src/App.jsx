import React, { useEffect, useRef, useState } from "react";
import {
  FiMenu,
  FiSend,
  FiMic,
  
  FiTrash2,
  FiCopy,
  FiEdit2,
  FiThumbsUp,
} from "react-icons/fi";

const API_KEY = "AIzaSyDQDgq_H-ywd_w9yjJFtwgfkV1VU39Rf3w";
const MODEL = "gemini-2.0-flash";

const createEmptyChat = (title = "New Chat") => ({
  id: crypto.randomUUID(),
  title,
  systemPrompt: "You are a helpful assistant.",
  messages: [],
  createdAt: Date.now(),
});

const cleanResponse = (text) =>
  text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/#+\s?/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]*)`/g, "$1");

// Create a short, readable title from the user's first message
const generateTitleFromText = (text) => {
  if (!text) return "New Chat";
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/[`_*#>[\](){}]/g, "")
    .trim();
  const words = cleaned.split(" ");
  const slice = words.slice(0, 7).join(" ");
  const capped = slice.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return capped.length > 50 ? capped.slice(0, 47) + "…" : capped;
};

// Escape HTML to avoid injection; we only render what we generate
const escapeHtml = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// Convert AI response into numbered, readable HTML with bolded main point
const toNumberedHtml = (text) => {
  if (!text) return "";
  // If it already looks like a list, keep lines as items
  const looksLikeList = /(^|\n)\s*([-•\d]+[.)]|[-•])/m.test(text);
  const lines = looksLikeList
    ? text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    : text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s && s.length > 1);

  if (lines.length === 0) return escapeHtml(text);

  const items = lines.map((line) => {
    const safe = escapeHtml(line.replace(/^[-•\d.)\s]+/, ""));
    // Bold up to a delimiter if present, otherwise bold first few words
    const delimiterMatch = safe.match(/[:\-\u2014]\s/); // :, -, —
    if (delimiterMatch) {
      const idx = delimiterMatch.index;
      const head = safe.slice(0, idx).trim();
      const tail = safe.slice(idx + delimiterMatch[0].length).trim();
      return `<li><strong>${head}</strong>${tail ? ` — ${tail}` : ""}</li>`;
    }
    const words = safe.split(/\s+/);
    const head = words.slice(0, Math.min(4, words.length)).join(" ");
    const tail = words.slice(Math.min(4, words.length)).join(" ");
    return `<li><strong>${head}</strong>${tail ? ` — ${tail}` : ""}</li>`;
  });
  return `<ol class="ai-list">${items.join("")}</ol>`;
};

export default function App() {
  const [chats, setChats] = useState(() => {
    const saved = localStorage.getItem("gemini_chats");
    return saved ? JSON.parse(saved) : [createEmptyChat("Welcome")];
  });
  const [activeChatId, setActiveChatId] = useState(chats[0].id);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // desktop only

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const activeChat = chats.find((c) => c.id === activeChatId);

  useEffect(() => {
    localStorage.setItem("gemini_chats", JSON.stringify(chats));
  }, [chats]);

  const [isNearBottom, setIsNearBottom] = useState(true);

  const scrollToBottom = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } catch (err) {
      // Fallback for browsers that don't support smooth option
      el.scrollTop = el.scrollHeight;
      console.log(err)
    }
  };

  const handleComposerFocus = () => {
    setIsNearBottom(true);
    requestAnimationFrame(() => setTimeout(scrollToBottom, 60));
  };

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    if (!isNearBottom) return; // don't jump when user is reading history
    // Wait for layout/paint on mobile before scrolling
    requestAnimationFrame(() => {
      scrollToBottom();
      setTimeout(scrollToBottom, 50);
    });
  }, [activeChat?.messages, loading, isNearBottom]);

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distanceFromBottom < 120);
  };

  useEffect(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRec();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.onresult = (ev) => {
      const transcript = Array.from(ev.results).map((r) => r[0].transcript).join("");
      if (ev.results[0].isFinal) {
        setInput((prev) => (prev ? prev + " " + transcript : transcript));
      }
    };
    recognitionRef.current = rec;
  }, []);

  const updateChat = (updatedChat) =>
    setChats((prev) => prev.map((c) => (c.id === updatedChat.id ? updatedChat : c)));

  const handleNewChat = () => {
    const newChat = createEmptyChat(`Chat ${chats.length + 1}`);
    setChats([newChat, ...chats]);
    setActiveChatId(newChat.id);
    setSidebarOpen(false);
  };

  const deleteChat = (id) => {
    const filtered = chats.filter((c) => c.id !== id);
    if (filtered.length === 0) {
      // Show a prompt and keep a fallback chat so the UI doesn't go blank
      const fallback = createEmptyChat("Welcome");
      setChats([fallback]);
      setActiveChatId(fallback.id);
      setSidebarOpen(true);
      setShowSelectModal(true);
      return;
    }
    setChats(filtered);
    if (id === activeChatId) setActiveChatId(filtered[0]?.id);
  };

  const clearChat = (id) =>
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, messages: [] } : c)));

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setIsNearBottom(true); // ensure we auto-scroll after sending
    const userMsg = { id: crypto.randomUUID(), sender: "user", text };
    // Auto-title: if first message or generic title, rename chat to the topic
    const isGenericTitle = !activeChat.title || /^Chat\s\d+$/i.test(activeChat.title) || /Welcome/i.test(activeChat.title);
    const newTitle = activeChat.messages.length === 0 || isGenericTitle ? generateTitleFromText(text) : activeChat.title;
    const updated = { ...activeChat, title: newTitle, messages: [...activeChat.messages, userMsg] };
    updateChat(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: text }] }],
          }),
        }
      );
      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const cleaned = cleanResponse(raw);
      const botHtml = toNumberedHtml(cleaned) || escapeHtml("⚠️ Something went wrong.");

      const botMsg = { id: crypto.randomUUID(), sender: "ai", text: botHtml, html: true };
      updateChat({ ...updated, messages: [...updated.messages, botMsg] });
    } catch (err) {
      updateChat({
        ...updated,
        messages: [...updated.messages, { id: crypto.randomUUID(), sender: "ai", text: "Error: " + err.message }],
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) return;
    if (isRecording) recognitionRef.current.stop();
    else recognitionRef.current.start();
    setIsRecording(!isRecording);
  };

  // Message toolbar actions
  const copyMessage = (text) => navigator.clipboard?.writeText(text);
  const deleteMessage = (msgId) => {
    const updated = {
      ...activeChat,
      messages: activeChat.messages.filter((m) => m.id !== msgId),
    };
    updateChat(updated);
  };
  const editMessage = (msgId) => {
    const msg = activeChat.messages.find((m) => m.id === msgId);
    if (!msg) return;
    const newText = window.prompt("Edit message", msg.text);
    if (typeof newText !== "string") return;
    const updated = {
      ...activeChat,
      messages: activeChat.messages.map((m) => (m.id === msgId ? { ...m, text: newText } : m)),
    };
    updateChat(updated);
  };
  const toggleLikeMessage = (msgId) => {
    const updated = {
      ...activeChat,
      messages: activeChat.messages.map((m) => (m.id === msgId ? { ...m, liked: !m.liked } : m)),
    };
    updateChat(updated);
  };

  const inlineCss = `
    .bg-grad { background: radial-gradient(circle at 10% 10%, rgba(139,92,246,0.12), transparent 40%), radial-gradient(circle at 90% 90%, rgba(99,102,241,0.1), transparent 40%), linear-gradient(180deg, #130028 0%, #1c0036 50%, #120023 100%); }
    .glass { backdrop-filter: blur(14px); background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); }
     .glass-strong { backdrop-filter: blur(18px); background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); }
    @keyframes bounce { 0%, 80%, 100% { transform: scale(1); opacity: 0.5; } 40% { transform: scale(1.4); opacity: 1; } }
    .typing span { animation: bounce 1.4s infinite; display: inline-block; width: 6px; height: 6px; margin: 0 3px; background: white; border-radius: 50%; }
    .typing span:nth-child(2){animation-delay:0.2s;} .typing span:nth-child(3){animation-delay:0.4s;}
     @keyframes gradientShift { 0%{background-position: 0% 50%;} 50%{background-position: 100% 50%;} 100%{background-position: 0% 50%;} }
     .bg-anim { animation: gradientShift 20s ease-in-out infinite; background-size: 200% 200%; }
     @keyframes fadeSlide { from{opacity:0; transform: translateY(8px)} to{opacity:1; transform: translateY(0)} }
     .animate-card { animation: fadeSlide .35s ease both; }
     @keyframes spin { to { transform: rotate(360deg); } }
     .spinner { width:16px; height:16px; border-radius:50%; border:2px solid rgba(255,255,255,.35); border-top-color:#fff; animation: spin .8s linear infinite; }
    .ai-list { list-style: decimal; margin: 0.25rem 0 0 1.25rem; }
    .ai-list li { margin: 0.25rem 0; }
    .ai-list strong { color: #fff; font-weight: 700; }
     .composer-sticky { position: sticky; bottom: 0; z-index: 20; padding-bottom: env(safe-area-inset-bottom); background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 60%); }
     .touch-scroll{ -webkit-overflow-scrolling: touch; }
     @media(max-width:768px){ .sidebar{position:fixed;left:0;top:0;width:80%;height:100%;z-index:50;transform:translateX(-100%);transition:transform .3s ease;} .sidebar.open{transform:translateX(0);} .app-root{height:calc(100vh - 20px); overflow-y:auto;} }
  `;

  return (
    <div className="app-root h-screen w-full font-Inter flex flex-col md:flex-row relative overflow-hidden text-white ">
      <style>{inlineCss}</style>
       <div className="absolute inset-0 bg-grad bg-anim -z-10" />

      {/* Sidebar */}
       <aside className={`sidebar glass p-4 flex flex-col transition-all duration-200 ${sidebarOpen ? "open" : ""} ${sidebarCollapsed ? "md:w-20" : "md:w-72 lg:w-80"}`}>
         <div className="flex justify-between items-center mb-4">
           <div className={`${sidebarCollapsed ? "hidden md:block md:h-6 md:w-6 md:rounded bg-white/20" : ""}`}>
             {!sidebarCollapsed && (
               <>
                 <div className="text-xl font-bold">Gemini</div>
                 <p className="text-xs text-gray-300">AI Assistant</p>
               </>
             )}
           </div>
           <div className="flex items-center gap-2">
             <button
               className="hidden md:inline-flex text-white/80 p-2 rounded-md bg-white/10 hover:bg-white/20"
               title={sidebarCollapsed ? "Expand" : "Collapse"}
               onClick={() => setSidebarCollapsed((v) => !v)}
             >
               <FiMenu />
             </button>
             <button className="md:hidden text-white/70" onClick={() => setSidebarOpen(false)}>
               ✕
             </button>
           </div>
         </div>

         {!sidebarCollapsed && (
           <div className="flex gap-2 mb-3">
             <button onClick={handleNewChat} className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full py-2 text-sm font-semibold hover:scale-[1.02] transition">+ New</button>
             <button onClick={() => deleteChat(activeChatId)} className="bg-white/10 px-3 rounded-full"><FiTrash2 /></button>
           </div>
         )}

         {/* search removed per request */}

         <div className="overflow-y-auto flex-1 pr-1 space-y-2">
          {chats.map((c) => (
            <div
              key={c.id}
              onClick={() => setActiveChatId(c.id)}
               className={`p-3 rounded-lg cursor-pointer transition transform hover:-translate-y-0.5 ${
                c.id === activeChatId ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
               <div className={`flex ${sidebarCollapsed ? "justify-center" : "justify-between"} items-center`}>
                 {!sidebarCollapsed && <span className="truncate font-medium">{c.title}</span>}
                 <span className="text-xs text-gray-400">{c.messages.length}</span>
               </div>
               {/* Description preview removed per request */}
            </div>
          ))}
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col md:p-6 p-3 min-h-0">
        <header className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-2 bg-white/10 rounded-md" onClick={() => setSidebarOpen(true)}>
              <FiMenu />
            </button>
            <h1 className="text-xl font-semibold">AI Assistant</h1>
          </div>
          <button onClick={() => clearChat(activeChatId)} className="hidden md:inline-block bg-white/10 px-3 py-1.5 rounded-full text-sm hover:bg-white/20">Clear</button>
        </header>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="flex-1 overflow-y-auto touch-scroll pb-28 md:pb-6 space-y-4 glass-strong rounded-2xl p-4 border border-white/10"
        >
          {activeChat.messages.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-gray-400">
              <h3 className="text-lg font-semibold text-white/90 mb-2">Start a Conversation ✨</h3>
              
            </div>
          ) : (
            activeChat.messages.map((msg) => (
              <div key={msg.id} className={`group relative flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                {/* Hover toolbar (user messages only) */
                msg.sender === "user" && (
                  <div className={`absolute -top-3 ${msg.sender === "user" ? "right-0" : "left-0"} flex gap-1 opacity-0 group-hover:opacity-100 transition`}>
                    <button title="Like" onClick={() => toggleLikeMessage(msg.id)} className={`p-1.5 rounded-md text-xs ${msg.liked ? "bg-white/20 text-white" : "bg-white/10 hover:bg-white/20"}`}>
                      <FiThumbsUp />
                    </button>
                    <button title="Copy" onClick={() => copyMessage(msg.text)} className="p-1.5 rounded-md text-xs bg-white/10 hover:bg-white/20">
                      <FiCopy />
                    </button>
                    <button title="Edit" onClick={() => editMessage(msg.id)} className="p-1.5 rounded-md text-xs bg-white/10 hover:bg-white/20">
                      <FiEdit2 />
                    </button>
                    <button title="Delete" onClick={() => deleteMessage(msg.id)} className="p-1.5 rounded-md text-xs bg-white/10 hover:bg-white/20">
                      <FiTrash2 />
                    </button>
                  </div>
                )}
                <div
                  className={`max-w-[80%] md:max-w-[70%] p-3 rounded-xl text-sm ${
                    msg.sender === "user"
                      ? "bg-gradient-to-tr from-indigo-500 to-violet-600 text-white"
                      : "glass text-gray-100"
                  }`}
                >
                  {msg.sender === "ai" && msg.html ? (
                    <div className="leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.text }} />
                  ) : (
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                  )}
                </div>
              </div>
            ))
          )}

          <div ref={messagesEndRef} />
        </div>

         {/* Input */}
        <div className="composer-sticky mt-3 flex items-center gap-1 glass-strong rounded-xl p-2 md:px-4 border border-white/10">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            onFocus={handleComposerFocus}
            
             className="flex-1 bg-transparent outline-none px-3 text-white placeholder:text-gray-400"
          />
          <label className="cursor-pointer text-gray-300">
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () =>
                  setInput((prev) => prev + "\n[Attached file content]\n" + reader.result);
                reader.readAsText(f);
              }}
            />
           
          </label>
           <button onClick={toggleRecording} className={`p-2 rounded-md ${isRecording ? "bg-red-200 text-red-700" : "bg-white/10 hover:bg-white/20"}`}>
            <FiMic />
          </button>
          <button
            onClick={sendMessage}
            disabled={loading}
             className="p-2 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-md text-white"
          >
             <FiSend />
          </button>
        </div>
      </main>
      {showSelectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="glass rounded-2xl p-5 w-[90%] max-w-sm text-center">
            <h3 className="text-lg font-semibold mb-2">Please select a chat</h3>
            <p className="text-sm text-gray-200 mb-4">Your last chat was deleted. Create a new one or pick from the list.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => { setShowSelectModal(false); handleNewChat(); }} className="px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600">+ New Chat</button>
              <button onClick={() => { setShowSelectModal(false); setSidebarOpen(true); }} className="px-4 py-2 rounded-full bg-white/10">Open Sidebar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
