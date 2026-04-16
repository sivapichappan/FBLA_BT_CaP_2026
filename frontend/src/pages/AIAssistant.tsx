import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from '../contexts/LocationContext';
import { aiApi, AiSuggestion } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BlurFade from '@/components/ui/blur-fade';
import { Send, Bot, User, Star, MapPin, Sparkles } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: AiSuggestion[];
}

const AIAssistant = () => {
  const navigate = useNavigate();
  const { location } = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

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
    } catch (error) {
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
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <BlurFade delay={0}>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center">
            <Sparkles className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Assistant</h1>
            <p className="text-xs text-muted-foreground">Powered by two-stage intent analysis</p>
          </div>
        </div>
      </BlurFade>

      <BlurFade delay={0.1}>
        <Card className="flex flex-col h-[calc(100vh-16rem)] glass border-white/10 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <AnimatePresence mode="popLayout">
              {messages.length === 0 && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-center py-16 text-muted-foreground"
                >
                  <div className="h-16 w-16 rounded-2xl gradient-primary mx-auto mb-4 flex items-center justify-center opacity-30">
                    <Bot className="h-8 w-8 text-white" />
                  </div>
                  <h2 className="text-lg font-semibold mb-2 text-foreground">How can I help?</h2>
                  <p className="text-sm">Ask me about local businesses, restaurants, services, or anything nearby.</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-5">
                    {['Best coffee near me', 'Affordable restaurants', 'Dog-friendly places'].map((q, i) => (
                      <motion.div
                        key={q}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setInput(q); }}
                          className="glass-subtle border-white/10 hover:bg-white/5 hover:border-primary/30 transition-all"
                        >
                          {q}
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'gradient-primary text-white shadow-lg shadow-primary/10'
                      : 'glass-subtle'
                  }`}>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    {msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {msg.suggestions.map((s, si) => (
                          <motion.button
                            key={s.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 + si * 0.05 }}
                            onClick={() => navigate(`/business/${s.id}`)}
                            className="w-full text-left glass-subtle hover:bg-white/[0.06] rounded-lg px-3 py-2 transition-all hover:translate-x-0.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-xs truncate">{s.name}</span>
                              {s.local_badge && (
                                <Badge
                                  className={`text-[10px] px-1 py-0 flex-shrink-0 ${
                                    s.local_badge === 'verified_local'
                                      ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                                      : 'bg-transparent border-green-500/20 text-green-400/80'
                                  }`}
                                >
                                  {s.local_badge === 'verified_local' ? '✓ Local' : '~ Local'}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-0.5">
                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                {s.rating}
                              </span>
                              <span className="flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" />
                                {s.distance_km} km
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
                    <div className="h-8 w-8 rounded-full glass-subtle flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </motion.div>
              ))}

              {loading && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="glass-subtle rounded-xl px-4 py-3 flex items-center gap-1.5">
                    <motion.span
                      className="w-1.5 h-1.5 rounded-full bg-primary"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                    />
                    <motion.span
                      className="w-1.5 h-1.5 rounded-full bg-primary"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                    />
                    <motion.span
                      className="w-1.5 h-1.5 rounded-full bg-accent"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/5 p-4">
            <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask about local businesses..."
                disabled={loading}
                className="flex-1 bg-white/5 border-white/10 focus:border-primary/40 transition-colors"
              />
              <Button type="submit" disabled={loading || !input.trim()} size="icon" className="gradient-primary border-0 hover:opacity-90 shadow-lg shadow-primary/20 disabled:shadow-none">
                <Send className="h-4 w-4 text-white" />
              </Button>
            </form>
            {!location && (
              <p className="text-xs text-muted-foreground mt-2">
                Enable location for better recommendations.
              </p>
            )}
          </div>
        </Card>
      </BlurFade>
    </div>
  );
};

export default AIAssistant;
