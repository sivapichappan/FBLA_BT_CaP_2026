import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../contexts/LocationContext';
import { aiApi, AiSuggestion } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, Send, Bot, User, Star, MapPin } from 'lucide-react';

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
  }, [messages]);

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
      <div className="flex items-center gap-3 mb-6">
        <MessageCircle className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-bold">AI Assistant</h1>
      </div>

      <Card className="flex flex-col h-[calc(100vh-16rem)]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Bot className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
              <h2 className="text-lg font-semibold mb-2">How can I help?</h2>
              <p className="text-sm">Ask me about local businesses, restaurants, services, or anything nearby.</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {['Best coffee near me', 'Affordable restaurants', 'Dog-friendly places'].map(q => (
                  <Button key={q} variant="outline" size="sm" onClick={() => { setInput(q); }}>
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {msg.suggestions.map(s => (
                      <button
                        key={s.id}
                        onClick={() => navigate(`/business/${s.id}`)}
                        className="w-full text-left bg-background/60 hover:bg-background rounded-md px-3 py-2 transition-colors border border-border/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-xs truncate">{s.name}</span>
                          {s.local_badge && (
                            <Badge
                              variant={s.local_badge === 'verified_local' ? 'default' : 'outline'}
                              className="text-[10px] px-1 py-0 flex-shrink-0"
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
                            <span className={s.is_open_now ? 'text-green-600' : 'text-red-500'}>
                              {s.is_open_now ? 'Open' : 'Closed'}
                            </span>
                          )}
                          {s.price_level && <span>{priceDisplay(s.price_level)}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <Skeleton className="h-12 w-48 rounded-lg" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about local businesses..."
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" disabled={loading || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
          {!location && (
            <p className="text-xs text-muted-foreground mt-2">
              Enable location for better recommendations.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};

export default AIAssistant;
