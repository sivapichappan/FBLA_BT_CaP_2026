import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from '../contexts/LocationContext';
import { useAuth } from '../contexts/AuthContext';
import { aiApi, AiSuggestion } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Send, Bot, User, Star, MapPin, Sparkles, X, MessageCircle } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: AiSuggestion[];
}

const STORAGE_KEY = 'ai_chat_dismissed';

const AiChatWidget = () => {
  const navigate = useNavigate();
  const { location } = useLocation();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [showBadge, setShowBadge] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-open on first visit + show "Try me!" badge
  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      setShowBadge(true);
      // Auto-open after 2 seconds on first visit
      const timer = setTimeout(() => {
        if (!hasAutoOpened) {
          setOpen(true);
          setHasAutoOpened(true);
          setMessages([{
            role: 'assistant',
            content: "Hey! 👋 I'm your AI assistant — I can help you find great local businesses nearby. Try asking me something like \"best coffee near me\" or \"affordable dinner spots\"!",
          }]);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, open]);

  const handleOpen = () => {
    setOpen(true);
    setShowBadge(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  const handleClose = () => {
    setOpen(false);
    localStorage.setItem(STORAGE_KEY, 'true');
    setShowBadge(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    if (!isAuthenticated) {
      setMessages([{ role: 'assistant', content: 'Please log in to use the AI assistant.' }]);
      return;
    }

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await aiApi.chat(
        userMsg,
        location?.latitude,
        location?.longitude,
        sessionToken || undefined,
      );
      setSessionToken(res.data.sessionToken);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: res.data.response,
          suggestions: res.data.suggestions,
        },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const priceDisplay = (level: number | null) => {
    if (!level) return '';
    return ' · ' + '$'.repeat(level);
  };

  return (
    <>
      {/* Floating trigger button — pill with text */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            onClick={handleOpen}
            className="fixed bottom-6 right-6 z-50 rounded-full gradient-primary flex items-center gap-2.5 px-5 py-3.5 shadow-lg shadow-primary/40 hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all group"
          >
            {/* Animated glow rings */}
            <span className="absolute inset-0 rounded-full gradient-primary animate-ping opacity-15" />
            <span className="absolute -inset-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{
              background: 'radial-gradient(circle, hsl(217 91% 60% / 0.3), transparent 70%)',
            }} />

            <Sparkles className="h-5 w-5 text-white relative z-10" />
            <span className="text-white font-semibold text-sm relative z-10">Ask AI</span>

            {/* "Try me!" notification badge */}
            {showBadge && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.5 }}
                className="absolute -top-2 -right-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg shadow-red-500/30 z-20"
              >
                Try me!
              </motion.span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-2rem)] h-[500px] max-h-[70vh] rounded-2xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden border border-white/15 bg-popover"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.03]">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center shadow-md shadow-primary/20">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">AI Assistant</h3>
                  <p className="text-[11px] text-muted-foreground">Find local businesses instantly</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-8 w-8 hover:bg-white/5 rounded-lg"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <AnimatePresence mode="popLayout">
                {messages.length === 0 && (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center py-10 text-muted-foreground"
                  >
                    <div className="h-12 w-12 rounded-2xl gradient-primary mx-auto mb-3 flex items-center justify-center opacity-40">
                      <MessageCircle className="h-6 w-6 text-white" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">How can I help?</p>
                    <p className="text-xs mb-4">Ask about restaurants, shops, or services nearby.</p>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {['Best coffee', 'Cheap eats', 'Open now'].map((q, i) => (
                        <motion.button
                          key={q}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 + i * 0.08 }}
                          onClick={() => setInput(q)}
                          className="text-xs glass-subtle rounded-full px-3 py-1.5 hover:bg-white/8 transition-colors border border-white/15"
                        >
                          {q}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="h-6 w-6 rounded-full gradient-primary flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm shadow-primary/20">
                        <Bot className="h-3 w-3 text-white" />
                      </div>
                    )}
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] ${
                      msg.role === 'user'
                        ? 'gradient-primary text-white shadow-md shadow-primary/10'
                        : 'bg-white/[0.06] border border-white/10'
                    }`}>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {msg.suggestions.map((s, si) => (
                            <motion.button
                              key={s.id}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.08 + si * 0.04 }}
                              onClick={() => navigate(`/business/${s.id}`)}
                              className="w-full text-left bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 rounded-lg px-2.5 py-1.5 transition-all hover:translate-x-0.5"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-medium text-[11px] truncate">{s.name}</span>
                                {s.local_badge && (
                                  <Badge className={`text-[9px] px-1 py-0 flex-shrink-0 ${
                                    s.local_badge === 'verified_local'
                                      ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                                      : 'bg-transparent border-green-500/20 text-green-400/80'
                                  }`}>
                                    {s.local_badge === 'verified_local' ? '✓' : '~'}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-0.5">
                                  <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                                  {s.rating}
                                </span>
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="h-2.5 w-2.5" />
                                  {s.distance_km}km
                                </span>
                                {s.is_open_now !== null && (
                                  <span className={s.is_open_now ? 'text-green-400' : 'text-red-400'}>
                                    {s.is_open_now ? 'Open' : 'Closed'}
                                  </span>
                                )}
                                {s.price_level && <span>{priceDisplay(s.price_level)}</span>}
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="h-6 w-6 rounded-full bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User className="h-3 w-3" />
                      </div>
                    )}
                  </motion.div>
                ))}

                {loading && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-2"
                  >
                    <div className="h-6 w-6 rounded-full gradient-primary flex items-center justify-center flex-shrink-0 shadow-sm shadow-primary/20">
                      <Bot className="h-3 w-3 text-white" />
                    </div>
                    <div className="bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 flex items-center gap-1">
                      <motion.span className="w-1.5 h-1.5 rounded-full bg-primary" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: 0 }} />
                      <motion.span className="w-1.5 h-1.5 rounded-full bg-primary" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: 0.2 }} />
                      <motion.span className="w-1.5 h-1.5 rounded-full bg-accent" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: 0.4 }} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-white/10 p-3 bg-white/[0.02]">
              <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask about local businesses..."
                  disabled={loading}
                  className="flex-1 h-9 text-sm"
                />
                <Button type="submit" disabled={loading || !input.trim()} size="icon" className="h-9 w-9 gradient-primary border-0 hover:opacity-90 shadow-md shadow-primary/20 disabled:shadow-none">
                  <Send className="h-3.5 w-3.5 text-white" />
                </Button>
              </form>
              {!location && (
                <p className="text-[10px] text-muted-foreground mt-1.5">Enable location for better results.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AiChatWidget;
