import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Mic, 
  MicOff, 
  Download, 
  Settings, 
  Trash2, 
  Send, 
  Image as ImageIcon,
  Languages,
  Volume2,
  VolumeX,
  FileText,
  FileJson,
  FileCode,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { jsPDF } from 'jspdf';
import { Message, Language, LANGUAGES } from './types';

// --- Constants & Config ---
const GEMINI_MODEL = "gemini-3-flash-preview";

export default function App() {
  // --- State ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('en');
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // --- Initialization ---
  useEffect(() => {
    // Initialize Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = selectedLanguage;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        handleSendMessage(transcript);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };
    }
  }, [selectedLanguage]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Handlers ---
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      setCameraActive(false);
    }
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        setCurrentImage(dataUrl);
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCurrentImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      setIsRecording(true);
      recognitionRef.current?.start();
    }
  };

  const speak = (text: string) => {
    if (isMuted) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = selectedLanguage;
    window.speechSynthesis.speak(utterance);
  };

  const handleSendMessage = async (text: string = inputText) => {
    if (!text.trim() && !currentImage) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      image: currentImage || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            parts: [
              ...(currentImage ? [{
                inlineData: {
                  mimeType: "image/jpeg",
                  data: currentImage.split(',')[1]
                }
              }] : []),
              { text: `Language: ${LANGUAGES[selectedLanguage]}. User query: ${text}` }
            ]
          }
        ],
        config: {
          systemInstruction: "You are VisionTalk, a privacy-focused visual assistant. Analyze images accurately and respond in the requested language. Be concise and helpful."
        }
      });

      const response = await model;
      const aiText = response.text || "I'm sorry, I couldn't process that.";

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiText,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, aiMessage]);
      speak(aiText);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Error: Failed to connect to AI service. Please check your connection.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsProcessing(false);
      setCurrentImage(null);
    }
  };

  const exportChat = (format: 'pdf' | 'json' | 'txt') => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `visiontalk-export-${Date.now()}.json`;
      a.click();
    } else if (format === 'txt') {
      const content = messages.map(m => `[${new Date(m.timestamp).toLocaleString()}] ${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `visiontalk-export-${Date.now()}.txt`;
      a.click();
    } else if (format === 'pdf') {
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text("VisionTalk Conversation Export", 20, 20);
      doc.setFontSize(10);
      let y = 30;
      messages.forEach(m => {
        const text = `[${new Date(m.timestamp).toLocaleString()}] ${m.role.toUpperCase()}: ${m.content}`;
        const lines = doc.splitTextToSize(text, 170);
        if (y + (lines.length * 5) > 280) {
          doc.addPage();
          y = 20;
        }
        doc.text(lines, 20, y);
        y += (lines.length * 5) + 5;
      });
      doc.save(`visiontalk-export-${Date.now()}.pdf`);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-[#0a0a0a] border-x border-[#1a1a1a] shadow-2xl overflow-hidden font-sans">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-[#1a1a1a] bg-[#0f0f0f]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <Camera className="w-5 h-5 text-black" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight uppercase text-emerald-500">VisionTalk</h1>
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Secure Visual Node</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400"
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400"
          >
            <Settings size={18} />
          </button>
          <button 
            onClick={() => setMessages([])}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      {/* Settings Overlay */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 right-4 w-64 bg-[#151515] border border-[#2a2a2a] rounded-xl shadow-2xl p-4 z-50"
          >
            <h3 className="text-xs font-bold text-zinc-500 uppercase mb-3 flex items-center gap-2">
              <Languages size={14} /> Language
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {(Object.keys(LANGUAGES) as Language[]).map(lang => (
                <button
                  key={lang}
                  onClick={() => setSelectedLanguage(lang)}
                  className={`text-xs p-2 rounded-md border transition-all ${
                    selectedLanguage === lang 
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  {LANGUAGES[lang]}
                </button>
              ))}
            </div>

            <h3 className="text-xs font-bold text-zinc-500 uppercase mb-3 flex items-center gap-2">
              <Download size={14} /> Export Data
            </h3>
            <div className="flex flex-col gap-2">
              <button onClick={() => exportChat('pdf')} className="flex items-center justify-between text-xs p-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 transition-all">
                <span>Portable Document (PDF)</span>
                <FileText size={14} />
              </button>
              <button onClick={() => exportChat('json')} className="flex items-center justify-between text-xs p-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 transition-all">
                <span>Structured Data (JSON)</span>
                <FileJson size={14} />
              </button>
              <button onClick={() => exportChat('txt')} className="flex items-center justify-between text-xs p-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 transition-all">
                <span>Plain Text (TXT)</span>
                <FileCode size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
            <div className="w-16 h-16 rounded-full border border-dashed border-zinc-700 flex items-center justify-center">
              <Camera className="w-8 h-8 text-zinc-600" />
            </div>
            <div className="max-w-xs">
              <h2 className="text-sm font-medium text-zinc-300">System Ready</h2>
              <p className="text-xs text-zinc-500 mt-1">Upload an image or use the camera to begin visual analysis.</p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              {msg.image && (
                <img 
                  src={msg.image} 
                  alt="User input" 
                  className="rounded-xl border border-zinc-800 max-h-64 object-cover shadow-lg"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className={`p-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user' 
                ? 'bg-emerald-600 text-white rounded-tr-none' 
                : 'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-none'
              }`}>
                <div className="markdown-body">
                  <Markdown>{msg.content}</Markdown>
                </div>
                <div className={`text-[9px] mt-2 font-mono opacity-50 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-2xl rounded-tl-none">
              <div className="flex gap-1">
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </main>

      {/* Camera View Overlay */}
      <AnimatePresence>
        {cameraActive && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black z-40 flex flex-col"
          >
            <div className="flex-1 relative overflow-hidden">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
                <div className="w-full h-full border border-emerald-500/30 rounded-lg relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-emerald-500" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-emerald-500" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-emerald-500" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-emerald-500" />
                </div>
              </div>
            </div>
            <div className="p-8 bg-black flex items-center justify-center gap-8">
              <button 
                onClick={stopCamera}
                className="w-12 h-12 rounded-full border border-zinc-800 flex items-center justify-center text-zinc-500 hover:bg-zinc-900"
              >
                <X size={24} />
              </button>
              <button 
                onClick={captureImage}
                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center group"
              >
                <div className="w-16 h-16 rounded-full bg-white group-active:scale-90 transition-transform" />
              </button>
              <div className="w-12" /> {/* Spacer */}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area */}
      <footer className="p-4 bg-[#0f0f0f] border-t border-[#1a1a1a]">
        <div className="space-y-4">
          {/* Image Preview */}
          {currentImage && (
            <div className="relative inline-block">
              <img 
                src={currentImage} 
                alt="Preview" 
                className="h-20 w-20 object-cover rounded-lg border border-emerald-500/50"
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={() => setCurrentImage(null)}
                className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white shadow-lg"
              >
                <X size={12} />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex gap-1">
              <button 
                onClick={startCamera}
                className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
                title="Open Camera"
              >
                <Camera size={20} />
              </button>
              <label className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all cursor-pointer">
                <ImageIcon size={20} />
                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>

            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask about an image..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-3 pr-12 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-all resize-none max-h-32"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <button 
                onClick={() => handleSendMessage()}
                className="absolute right-2 bottom-2 p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-all"
              >
                <Send size={18} />
              </button>
            </div>

            <button 
              onClick={toggleRecording}
              className={`p-4 rounded-2xl transition-all ${
                isRecording 
                ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse' 
                : 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-105'
              }`}
            >
              {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
          </div>
          
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              <div className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              {isProcessing ? 'Processing' : 'System Idle'}
            </div>
            <div className="h-1 w-1 rounded-full bg-zinc-800" />
            <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              Node: Local-01
            </div>
            <div className="h-1 w-1 rounded-full bg-zinc-800" />
            <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              Enc: AES-256
            </div>
          </div>
        </div>
      </footer>

      {/* Hidden Canvas for Capturing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
